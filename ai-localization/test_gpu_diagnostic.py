import io
import json
from contextlib import ExitStack, nullcontext, redirect_stdout, redirect_stderr
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'gpu-diagnostic'))
sys.path.append(str(HERE / 'gpu-training'))
sys.path.append(str(HERE / 'gpu-feasibility'))
import diagnostic_support as support
import run_diagnostic as runner


def rows():
    return [dict(sample_id=f'{source}-{condition}', source_id=source, split='train', condition=condition,
                 image=f'{source}-{condition}.png', mask=f'{source}-{condition}-mask.png')
            for source in ('tgif2-724', 'tgif2-5992')
            for condition in ('authentic_control', 'segm_flux1dev', 'random_flux1dev')]


class DiagnosticTests(unittest.TestCase):
    def test_fixed_train_only_selection(self):
        sample = rows()
        self.assertEqual(support.select_rows(sample + [dict(sample[0], split='validation')]), sample)
        with self.assertRaises(ValueError):
            support.select_rows(sample[:-1])
        with self.assertRaises(ValueError):
            support.select_rows([dict(r, split='test') for r in sample])

    def test_criteria_are_per_image_and_not_accuracy(self):
        target = np.zeros((6, 10, 10), dtype=np.uint8)
        target[[1, 2, 4, 5], 2:6, 2:6] = 1
        passed = support.summarize(target.astype(float), target, rows())
        self.assertTrue(passed['learning_check_passed'])
        self.assertFalse(passed['release_approved'])
        self.assertFalse(passed['generalization_evaluated'])
        scores = target.astype(float)
        scores[1] = 0
        self.assertFalse(support.summarize(scores, target, rows())['learning_check_passed'])
        scores = target.astype(float)
        scores[0, 0, 0] = .5
        self.assertFalse(support.summarize(scores, target, rows())['learning_check_passed'])
        with self.assertRaises(ValueError):
            support.summarize(scores, target, [dict(r, split='validation') for r in rows()])

    def test_path_guard(self):
        with tempfile.TemporaryDirectory(dir=HERE / 'runs') as folder:
            for name in ('../x', 'C:/x', '/x', 'data\\x'):
                with self.assertRaises(ValueError):
                    support.safe_file(folder, name)

    def test_real_worker_and_pack_with_tiny_cpu_double(self):
        import gpu_model
        class Tiny(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.image_encoder = torch.nn.Module()
                self.image_encoder.adaptor = torch.nn.Linear(1, 1)
                self.image_encoder.hfp_branch = torch.nn.Linear(1, 1)
                self.mask_decoder = torch.nn.Linear(1, 1)
                self.frozen = torch.nn.Parameter(torch.ones(1), requires_grad=False)
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
            root = Path(folder); output = root / 'diagnostic-output'; output.mkdir()
            base = root / 'base-training'; base.mkdir()
            (root / 'DIAGNOSTIC.json').write_text('{}')
            stack.enter_context(patch.object(runner, 'ROOT', root))
            stack.enter_context(patch.object(runner, 'STEPS', 12))
            stack.enter_context(patch.object(runner, 'INTERVAL', 6))
            stack.enter_context(patch.object(runner, 'prepare', return_value=(rows(), {})))
            stack.enter_context(patch.object(runner, 'safe_file', side_effect=lambda base, name: base / name))
            stack.enter_context(patch.object(gpu_model, 'load_candidate', side_effect=Tiny))
            stack.enter_context(patch.object(gpu_model, 'inputs', side_effect=inputs))
            stack.enter_context(patch.object(gpu_model, 'predict', side_effect=predict))
            stack.enter_context(patch.object(torch, 'autocast', side_effect=lambda **kwargs: nullcontext()))
            stack.enter_context(patch.object(torch.amp, 'GradScaler', side_effect=lambda *a, **k: original_scaler('cpu', enabled=False)))
            for name in ('manual_seed_all', 'reset_peak_memory_stats'):
                stack.enter_context(patch.object(torch.cuda, name, return_value=None))
            for name in ('max_memory_allocated', 'max_memory_reserved'):
                stack.enter_context(patch.object(torch.cuda, name, return_value=0))
            with redirect_stdout(io.StringIO()):
                self.assertEqual(runner.run_worker(base, output), 0)
                runner.pack(output)
            result = json.loads((output / 'RESULT.json').read_text())
            self.assertEqual(result['steps_completed'], 12)
            self.assertTrue(all(result['updated_groups'].values()))
            self.assertFalse(result['release_approved'])
            history = json.loads((output / 'history.json').read_text())
            self.assertEqual([v['step'] for v in history], [0, 6, 12])
            import hashlib, zipfile
            with zipfile.ZipFile(output / 'Return-to-Kent-Diagnostic.zip') as archive:
                ledger = json.loads(archive.read('RETURN-SHA256.json'))
                for name, digest in ledger['files'].items():
                    self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), digest)
                self.assertFalse(any(name.endswith('.pt') for name in archive.namelist()))

    def test_worker_error_is_reported(self):
        with tempfile.TemporaryDirectory(dir=HERE / 'runs') as folder:
            root = Path(folder); (root / 'DIAGNOSTIC.json').write_text('{}')
            with patch.object(runner, 'ROOT', root), patch.object(runner, 'prepare', side_effect=RuntimeError('GPU unavailable')), redirect_stderr(io.StringIO()):
                self.assertEqual(runner.run_worker(root, root), 1)
            result = json.loads((root / 'RESULT.json').read_text())
            self.assertEqual(result['status'], 'diagnostic_error')
            self.assertIn('GPU unavailable', result['error'])

    def test_timeout_stops_owned_worker_and_packs_failure(self):
        import subprocess
        class TimedOutWorker:
            terminated = False
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def wait(self, timeout=None):
                if timeout is not None:
                    raise subprocess.TimeoutExpired('unit-test-worker', timeout)
                return -15
            def terminate(self): self.terminated = True
        with tempfile.TemporaryDirectory(dir=HERE / 'runs') as folder:
            root = Path(folder); base = root / 'base'; base.mkdir()
            worker = TimedOutWorker()
            with patch.object(runner, 'ROOT', root), patch.object(runner, 'verify', return_value=rows()), \
                 patch.object(sys, 'argv', ['run_diagnostic.py', '--base', str(base)]), \
                 patch.object(runner.subprocess, 'Popen', return_value=worker), redirect_stdout(io.StringIO()):
                self.assertEqual(runner.main(), 1)
            self.assertTrue(worker.terminated)
            result = json.loads((root / 'diagnostic-output/RESULT.json').read_text())
            self.assertEqual(result['status'], 'diagnostic_timeout')
            self.assertTrue((root / 'diagnostic-output/Return-to-Kent-Diagnostic.zip').is_file())

    def test_existing_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory(dir=HERE / 'runs') as folder:
            root = Path(folder); base = root / 'base'; base.mkdir()
            output = root / 'diagnostic-output'; output.mkdir()
            marker = output / 'previous-result.txt'; marker.write_text('preserve')
            with patch.object(runner, 'ROOT', root), patch.object(runner, 'verify', return_value=rows()), \
                 patch.object(sys, 'argv', ['run_diagnostic.py', '--base', str(base)]):
                with self.assertRaises(FileExistsError): runner.main()
            self.assertEqual(marker.read_text(), 'preserve')


if __name__ == '__main__':
    unittest.main()
