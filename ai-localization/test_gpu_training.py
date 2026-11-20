"""CPU regression checks; do not claim a full RTX training run was tested here."""
import copy
from contextlib import ExitStack, nullcontext, redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
import torch

HERE = Path(__file__).resolve().parent / 'gpu-training'
sys.path.insert(0, str(HERE))
from verify_package import validate_rows, safe_file
from training_support import (trainable_state, restore_trainable, save_checkpoint,
    load_checkpoint, epoch_order, choose_threshold, exclusive_run, write_json)


def families():
    rows = []
    for split in ('train', 'validation'):
        for condition in ('authentic_control', 'segm_flux1dev', 'random_flux1dev'):
            name = split + '-' + condition
            rows.append(dict(sample_id=name, source_id=split + '-source', split=split,
                condition=condition, image=name + '.png', mask=name + '-mask.png'))
    return rows


class TrainingTests(unittest.TestCase):
    def test_source_and_test_leakage_rejected(self):
        rows = families()
        self.assertEqual(validate_rows(rows), {'train': 3, 'validation': 3})
        bad = copy.deepcopy(rows)
        bad[3]['source_id'] = rows[0]['source_id']
        with self.assertRaises(ValueError):
            validate_rows(bad)
        bad = copy.deepcopy(rows)
        bad[0]['split'] = 'test'
        with self.assertRaises(ValueError):
            validate_rows(bad)
        with self.assertRaises(ValueError):
            validate_rows(rows[:-1])

    def test_unsafe_paths(self):
        with tempfile.TemporaryDirectory(dir=HERE.parent / 'runs') as folder:
            for name in ('../secret', 'C:/secret', 'data\\secret', '/secret'):
                with self.assertRaises(ValueError):
                    safe_file(folder, name)

    def test_resume_matches_uninterrupted_optimizer_and_rng(self):
        torch.manual_seed(21)
        model = torch.nn.Sequential(torch.nn.Linear(3, 3), torch.nn.Linear(3, 1))
        model[0].requires_grad_(False)
        frozen = model[0].weight.detach().clone()
        optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=1e-3)
        identity = {'package': 'unit-test', 'release_approved': False}

        def step():
            optimizer.zero_grad(set_to_none=True)
            model(torch.randn(4, 3)).square().mean().backward()
            optimizer.step()

        step()
        with tempfile.TemporaryDirectory(dir=HERE.parent / 'runs') as folder:
            last = Path(folder) / 'last.pt'
            value = dict(identity=identity, epoch=1, history=[{'epoch': 1}], best_epoch=1,
                best_loss=.5, model=trainable_state(model), optimizer=optimizer.state_dict(),
                rng_cpu=torch.get_rng_state())
            save_checkpoint(last, value)
            # A torn future temporary file must never be loaded as the last commit.
            last.with_suffix('.pt.partial').write_bytes(b'incomplete next epoch')
            step()
            expected = trainable_state(model)
            saved = load_checkpoint(last, identity)
            restore_trainable(model, saved['model'])
            optimizer.load_state_dict(saved['optimizer'])
            torch.set_rng_state(saved['rng_cpu'])
            step()
            for name, actual in trainable_state(model).items():
                torch.testing.assert_close(actual, expected[name], rtol=0, atol=0)
            torch.testing.assert_close(model[0].weight, frozen, rtol=0, atol=0)
            with self.assertRaises(ValueError):
                load_checkpoint(last, {'package': 'wrong'})
            with self.assertRaises(ValueError):
                restore_trainable(model, {})
            bad = trainable_state(model)
            bad[next(iter(bad))].fill_(float('nan'))
            with self.assertRaises(ValueError):
                restore_trainable(model, bad)

    def test_epoch_shuffle_reproducible_and_complete(self):
        self.assertEqual(sorted(epoch_order(480, 1)), list(range(480)))
        np.testing.assert_array_equal(epoch_order(480, 3), epoch_order(480, 3))
        self.assertFalse(np.array_equal(epoch_order(480, 2), epoch_order(480, 3)))

    def test_validation_metrics_match_brute_force(self):
        rows = [r for r in families() if r['split'] == 'validation']
        rng = np.random.default_rng(7)
        scores = rng.uniform(size=(3, 8, 8)).astype(np.float32)
        scores[:, 0, 0] = .5  # Exact cutoff equality must count as highlighted.
        target = (rng.uniform(size=scores.shape) > .6).astype(np.uint8)
        target[0] = 0
        decision = choose_threshold(scores, target, rows)
        for item in decision['curve']:
            pred = scores.astype(np.float64) >= item['threshold']
            for index, row in enumerate(rows):
                group = item['groups'][row['condition']]
                self.assertEqual(group['images_with_highlights'], int(pred[index].any()))
                self.assertAlmostEqual(group['highlighted_area_mean'], float(pred[index].mean()))
                if index:
                    intersection = (pred[index] & target[index].astype(bool)).sum()
                    expected = 2 * intersection / (pred[index].sum() + target[index].sum())
                    self.assertAlmostEqual(group['dice'], expected)

    def test_good_validation_still_cannot_release(self):
        rows = [r for r in families() if r['split'] == 'validation']
        target = np.zeros((3, 8, 8), dtype=np.uint8)
        target[1:, 2:6, 2:6] = 1
        decision = choose_threshold(target.astype(np.float32), target, rows)
        self.assertEqual(decision['status'], 'validation_gate_passed_needs_independent_test')
        self.assertFalse(decision['release_approved'])
        bad_rows = copy.deepcopy(rows)
        bad_rows[0]['split'] = 'test'
        with self.assertRaises(ValueError):
            choose_threshold(target, target, bad_rows)
        failed = choose_threshold(np.zeros_like(target), target, rows)
        self.assertEqual(failed['status'], 'validation_gate_failed')

    def test_duplicate_run_lock_and_release(self):
        with tempfile.TemporaryDirectory(dir=HERE.parent / 'runs') as folder:
            lock = Path(folder) / 'run.lock'
            code = ('import sys; from pathlib import Path; sys.path.insert(0,sys.argv[1]); '
                    'from training_support import exclusive_run; '
                    '\nwith exclusive_run(Path(sys.argv[2])): print("acquired")')
            with exclusive_run(lock):
                result = subprocess.run([sys.executable, '-c', code, str(HERE), str(lock)], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('active run', result.stderr)
            with exclusive_run(lock):
                pass

    def test_json_disallows_nonfinite_and_writes_atomically(self):
        with tempfile.TemporaryDirectory(dir=HERE.parent / 'runs') as folder:
            path = Path(folder) / 'STATUS.json'
            write_json(path, {'stage': 'training', 'release_approved': False})
            with self.assertRaises(ValueError):
                write_json(path, {'loss': float('nan')})
            self.assertEqual(json.loads(path.read_text())['stage'], 'training')

    def test_full_worker_resume_and_return_with_tiny_cpu_double(self):
        # Exercise the REAL epoch/checkpoint/evaluation/pack orchestration. Only
        # GPU primitives and model/data are doubled; no GPU success is claimed.
        import train_gpu
        import training_support
        sys.path.append(str(HERE.parent / 'gpu-feasibility'))
        import gpu_model

        class TinyModel(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.image_encoder = torch.nn.Module()
                self.image_encoder.adaptor = torch.nn.Linear(1, 1)
                self.image_encoder.hfp_branch = torch.nn.Linear(1, 1)
                self.mask_decoder = torch.nn.Linear(1, 1)
                self.frozen = torch.nn.Parameter(torch.ones(1), requires_grad=False)
            def cuda(self):
                return self

        def predict(model, x):
            value = model.mask_decoder(model.image_encoder.adaptor(x) + model.image_encoder.hfp_branch(x))
            return value.reshape(1, 1, 1, 1).expand(1, 1, 4, 4)

        def inputs(image, mask, device):
            target = torch.zeros(1, 1, 448, 448)
            if 'authentic_control' not in str(mask):
                target[:, :, 100:300, 100:300] = 1
            return torch.ones(1, 1), target

        original_scaler = torch.amp.GradScaler
        original_write = training_support.write_json
        rows = families()
        with tempfile.TemporaryDirectory(dir=HERE.parent / 'runs') as folder, ExitStack() as stack:
            root = Path(folder)
            (root / 'RELEASE.json').write_text('{}')
            complete, interrupted = root / 'complete', root / 'interrupted'
            complete.mkdir()
            interrupted.mkdir()
            stack.enter_context(patch.object(train_gpu, 'ROOT', root))
            stack.enter_context(patch.object(train_gpu, 'verify', return_value=({'checkpoint_sha256': 'test-only'}, rows)))
            stack.enter_context(patch.object(train_gpu, 'environment', return_value={'versions': {}}))
            stack.enter_context(patch.object(train_gpu, 'safe_file', side_effect=lambda root, name: root / name))
            stack.enter_context(patch.object(training_support, 'EPOCHS', 2))
            stack.enter_context(patch.object(gpu_model, 'load_candidate', side_effect=TinyModel))
            stack.enter_context(patch.object(gpu_model, 'inputs', side_effect=inputs))
            stack.enter_context(patch.object(gpu_model, 'predict', side_effect=predict))
            stack.enter_context(patch.object(torch, 'autocast', side_effect=lambda **kwargs: nullcontext()))
            stack.enter_context(patch.object(torch.amp, 'GradScaler', side_effect=lambda *a, **k: original_scaler('cpu', enabled=False)))
            for name in ('manual_seed_all', 'set_rng_state_all', 'reset_peak_memory_stats'):
                stack.enter_context(patch.object(torch.cuda, name, return_value=None))
            stack.enter_context(patch.object(torch.cuda, 'get_rng_state_all', return_value=[]))
            for name in ('max_memory_allocated', 'max_memory_reserved'):
                stack.enter_context(patch.object(torch.cuda, name, return_value=0))
            with redirect_stdout(io.StringIO()):
                train_gpu.worker(complete, False)

                def interrupt_after_commit(path, value):
                    original_write(path, value)
                    if isinstance(value, dict) and value.get('stage') == 'epoch_committed' and value['epoch'] == 1:
                        raise RuntimeError('Simulated session interruption')

                with patch.object(training_support, 'write_json', side_effect=interrupt_after_commit):
                    with self.assertRaisesRegex(RuntimeError, 'Simulated'):
                        train_gpu.worker(interrupted, False)
                train_gpu.worker(interrupted, True)
                train_gpu.pack(interrupted)
            expected = torch.load(complete / 'last.pt', weights_only=True)
            actual = torch.load(interrupted / 'last.pt', weights_only=True)
            self.assertEqual(actual['epoch'], 2)
            for name in actual['model']:
                torch.testing.assert_close(actual['model'][name], expected['model'][name], rtol=0, atol=0)
            status = json.loads((interrupted / 'STATUS.json').read_text())
            self.assertEqual(status['stage'], 'completed')
            self.assertFalse(status['release_approved'])
            import zipfile
            with zipfile.ZipFile(interrupted / 'Return-to-Kent-Training.zip') as bundle:
                names = set(bundle.namelist())
                self.assertIn('best-adapter.pt', names)
                self.assertIn('validation-report.json', names)
                self.assertNotIn('last.pt', names)
                ledger = json.loads(bundle.read('RETURN-SHA256.json'))
                import hashlib
                for name, digest in ledger['files'].items():
                    self.assertEqual(hashlib.sha256(bundle.read(name)).hexdigest(), digest)


if __name__ == '__main__':
    unittest.main()
