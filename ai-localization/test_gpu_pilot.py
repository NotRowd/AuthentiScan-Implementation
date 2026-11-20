import hashlib
import io
import json
from contextlib import ExitStack, nullcontext, redirect_stdout, redirect_stderr
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import numpy as np
from PIL import Image
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'gpu-pilot'))
sys.path.append(str(HERE / 'gpu-training'))
sys.path.append(str(HERE / 'gpu-feasibility'))
import pilot_support as support
import run_pilot as runner


def rows():
    return [dict(sample_id=f'{split}-{condition}', source_id=split, split=split, condition=condition,
        image=f'{split}-{condition}.png', mask=f'{split}-{condition}-mask.png')
        for split in ('train', 'validation') for condition in sorted(support.CONDITIONS)]


class PilotTests(unittest.TestCase):
    def test_cohort_guards(self):
        self.assertEqual(support.validate_rows(rows(), 1, 1), rows())
        for bad in (rows()[:-1], rows() + [rows()[0]], [dict(r, split='test') for r in rows()],
                    [dict(r, source_id='same') for r in rows()]):
            with self.assertRaises(ValueError): support.validate_rows(bad, 1, 1)

    def test_regions_never_read_validation(self):
        with tempfile.TemporaryDirectory(dir=HERE / 'runs') as folder:
            root = Path(folder)
            expected = np.zeros((448, 448), dtype=bool)
            for index, row in enumerate(r for r in rows() if r['split'] == 'train' and r['condition'] != 'authentic_control'):
                mask = np.zeros((448, 448), dtype=np.uint8)
                mask[10 + index:20 + index, 30:50] = 255
                expected |= mask > 0
                Image.fromarray(mask).save(root / row['mask'])
            actual = support.training_regions(root, rows())
            self.assertEqual(set(actual), {'train'})
            np.testing.assert_array_equal(actual['train'], expected)
            Image.fromarray(np.zeros((448, 448), dtype=np.uint8)).save(root / rows()[1]['mask'])
            with self.assertRaises(ValueError): support.training_regions(root, rows())

    def test_loss_gradient_and_scope(self):
        from torch.nn import functional as F
        row = dict(split='train', condition='authentic_control', source_id='s')
        region = np.array([[1, 0], [0, 0]], dtype=bool)
        y = torch.zeros(1, 1, 2, 2)
        base = lambda p, t: F.binary_cross_entropy_with_logits(p, t)
        a = torch.zeros_like(y, requires_grad=True)
        b = torch.zeros_like(y, requires_grad=True)
        la = support.objective(a, y, row, 'A', {}, base)
        lb = support.objective(b, y, row, 'B', {'s': region}, base)
        la.backward(); lb.backward()
        self.assertAlmostEqual(float(lb.detach()), float(la.detach()) * 1.5, places=6)
        self.assertGreater(float(b.grad[0, 0, 0, 0]), float(a.grad[0, 0, 0, 0]))
        self.assertEqual(float(b.grad[0, 0, 1, 1]), float(a.grad[0, 0, 1, 1]))
        edited = dict(row, condition='segm_flux1dev')
        self.assertEqual(float(support.objective(a, y, edited, 'B', {}, base)), float(la.detach()))
        for badrow, badregion in ((dict(row, split='validation'), region), (row, np.zeros((2, 2), bool)), (row, np.ones((3, 3), bool))):
            with self.assertRaises(ValueError): support.objective(b, y, badrow, 'B', {'s': badregion}, base)

    def test_endpoint_comparison_not_release(self):
        def result(dice, count=2, area=.02):
            return dict(fixed_cutoff=.5, groups={
                'authentic_control': dict(images_with_highlights=count, highlighted_area_mean=area),
                'segm_flux1dev': dict(dice=dice), 'random_flux1dev': dict(dice=dice)})
        self.assertEqual(support.compare(result(.2), result(.24))['status'], 'directional_screen_passed')
        self.assertEqual(support.compare(result(.2), result(.23))['status'], 'directional_screen_passed')
        self.assertFalse(support.compare(result(.2), result(.24))['release_approved'])
        self.assertEqual(support.compare(result(.2), result(.24, count=3))['status'], 'directional_screen_not_reached')
        self.assertEqual(support.compare(result(.2), result(.22))['status'], 'directional_screen_not_reached')

    def test_summary(self):
        validation = [r for r in rows() if r['split'] == 'validation']
        target = np.zeros((3, 4, 4), np.uint8)
        target[1:, 1:3, 1:3] = 1
        result = support.summarize(target.astype(float), target, validation)
        self.assertEqual(result['groups']['segm_flux1dev']['dice'], 1)
        self.assertEqual(result['groups']['segm_flux1dev']['mean_inside_score_lift'], 1)
        with self.assertRaises(ValueError): support.summarize(target, target, rows()[:3])

    def test_worker_both_arms_fresh_and_packed(self):
        import gpu_model
        initial = []
        class Tiny(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.image_encoder = torch.nn.Module()
                self.image_encoder.adaptor = torch.nn.Linear(1, 1)
                self.image_encoder.hfp_branch = torch.nn.Linear(1, 1)
                self.mask_decoder = torch.nn.Linear(1, 1)
                self.frozen = torch.nn.Parameter(torch.ones(1), requires_grad=False)
                initial.append({n: p.detach().clone() for n, p in self.named_parameters()})
            def cuda(self): return self
        def predict(model, x):
            value = model.mask_decoder(model.image_encoder.adaptor(x) + model.image_encoder.hfp_branch(x))
            return value.reshape(1, 1, 1, 1).expand(1, 1, 4, 4)
        def inputs(image, mask, device):
            target = torch.zeros(1, 1, 448, 448)
            if 'authentic_control' not in str(mask): target[:, :, 100:300, 100:300] = 1
            return torch.ones(1, 1), target
        original_scaler = torch.amp.GradScaler
        with tempfile.TemporaryDirectory(dir=HERE / 'runs') as folder, ExitStack() as stack:
            root = Path(folder); output = root / 'pilot-output'; output.mkdir()
            base = root / 'base'; base.mkdir(); (root / 'PILOT.json').write_text('{}')
            region = np.zeros((448, 448), bool); region[100:300, 100:300] = True
            for name, value in [('ROOT', root), ('EPOCHS', 2)]:
                stack.enter_context(patch.object(runner, name, value))
            stack.enter_context(patch.object(runner, 'prepare', return_value=(rows(), {})))
            stack.enter_context(patch.object(runner, 'training_regions', return_value={'train': region}))
            stack.enter_context(patch.object(runner, 'safe_file', side_effect=lambda base, name: base / name))
            stack.enter_context(patch.object(gpu_model, 'load_candidate', side_effect=Tiny))
            stack.enter_context(patch.object(gpu_model, 'inputs', side_effect=inputs))
            stack.enter_context(patch.object(gpu_model, 'predict', side_effect=predict))
            stack.enter_context(patch.object(torch, 'autocast', side_effect=lambda **kw: nullcontext()))
            stack.enter_context(patch.object(torch.amp, 'GradScaler', side_effect=lambda *a, **k: original_scaler('cpu', enabled=False)))
            for name in ('manual_seed_all', 'reset_peak_memory_stats', 'empty_cache'):
                stack.enter_context(patch.object(torch.cuda, name, return_value=None))
            for name in ('max_memory_allocated', 'max_memory_reserved'):
                stack.enter_context(patch.object(torch.cuda, name, return_value=0))
            with redirect_stdout(io.StringIO()):
                self.assertEqual(runner.run_worker(base, output), 0)
                runner.pack(output)
            self.assertEqual(len(initial), 2)
            for name in initial[0]: self.assertTrue(torch.equal(initial[0][name], initial[1][name]))
            report = json.loads((output / 'RESULT.json').read_text())
            self.assertEqual(report['status'], 'completed')
            self.assertFalse(report['release_approved'])
            for arm in ('A', 'B'):
                self.assertEqual(report['arms'][arm]['steps_completed'], 6)
                self.assertTrue(all(report['arms'][arm]['updated_groups'].values()))
                history = json.loads((output / arm / 'history.json').read_text())
                self.assertEqual([e['epoch'] for e in history], [0, 1, 2])
            with zipfile.ZipFile(output / 'Return-to-Kent-Pilot.zip') as archive:
                ledger = json.loads(archive.read('RETURN-SHA256.json'))
                for name, digest in ledger['files'].items():
                    self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), digest)

    def test_error_returns_report(self):
        with tempfile.TemporaryDirectory(dir=HERE / 'runs') as folder:
            root = Path(folder); (root / 'PILOT.json').write_text('{}')
            with patch.object(runner, 'ROOT', root), patch.object(runner, 'prepare', side_effect=RuntimeError('GPU unavailable')), redirect_stderr(io.StringIO()):
                self.assertEqual(runner.run_worker(root, root), 1)
            self.assertEqual(json.loads((root / 'RESULT.json').read_text())['status'], 'pilot_error')

    def test_timeout_stops_owned_worker_and_preserves_return(self):
        class TimedOut:
            terminated = False
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def wait(self, timeout=None):
                if timeout is not None: raise runner.subprocess.TimeoutExpired('test', timeout)
                return -15
            def terminate(self): self.terminated = True
        with tempfile.TemporaryDirectory(dir=HERE / 'runs') as folder:
            root = Path(folder); base = root / 'base'; base.mkdir(); child = TimedOut()
            with patch.object(runner, 'ROOT', root), patch.object(runner, 'verify', return_value=rows()), \
                 patch.object(sys, 'argv', ['run_pilot.py', '--base', str(base)]), \
                 patch.object(runner.subprocess, 'Popen', return_value=child), redirect_stdout(io.StringIO()):
                self.assertEqual(runner.main(), 1)
            self.assertTrue(child.terminated)
            self.assertEqual(json.loads((root / 'pilot-output/RESULT.json').read_text())['status'], 'pilot_timeout')
            self.assertTrue((root / 'pilot-output/Return-to-Kent-Pilot.zip').is_file())

    def test_no_overwrite(self):
        with tempfile.TemporaryDirectory(dir=HERE / 'runs') as folder:
            root = Path(folder); base = root / 'base'; base.mkdir()
            output = root / 'pilot-output'; output.mkdir(); marker = output / 'keep'; marker.write_text('saved')
            with patch.object(runner, 'ROOT', root), patch.object(runner, 'verify', return_value=rows()), \
                 patch.object(sys, 'argv', ['run_pilot.py', '--base', str(base)]):
                with self.assertRaises(FileExistsError): runner.main()
            self.assertEqual(marker.read_text(), 'saved')

    def test_check_does_not_launch_training(self):
        with tempfile.TemporaryDirectory(dir=HERE / 'runs') as folder:
            root = Path(folder); base = root / 'base'; base.mkdir()
            with patch.object(runner, 'ROOT', root), patch.object(runner, 'verify', return_value=rows()), \
                 patch.object(runner, 'prepare', return_value=(rows(), {})), \
                 patch.object(runner, 'training_regions', return_value={'train': np.ones((2, 2), bool)}), \
                 patch.object(sys, 'argv', ['run_pilot.py', '--base', str(base), '--check']), \
                 patch.object(runner.subprocess, 'Popen') as launch, redirect_stdout(io.StringIO()):
                self.assertEqual(runner.main(), 0)
                launch.assert_not_called()
            self.assertFalse((root / 'pilot-output').exists())

    def test_active_base_run_blocks_pilot(self):
        from training_support import exclusive_run
        with tempfile.TemporaryDirectory(dir=HERE / 'runs') as folder:
            root = Path(folder); base = root / 'base'; base.mkdir()
            with exclusive_run(base / '.worker.lock'), patch.object(runner, 'ROOT', root), \
                 patch.object(runner, 'verify', return_value=rows()), \
                 patch.object(sys, 'argv', ['run_pilot.py', '--base', str(base)]):
                with self.assertRaises(RuntimeError): runner.main()
            self.assertFalse((root / 'pilot-output').exists())


if __name__ == '__main__':
    unittest.main()
