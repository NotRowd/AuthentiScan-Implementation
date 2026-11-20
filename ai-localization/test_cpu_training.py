"""Exercise the full CPU training path with tiny synthetic cache fixtures only."""
import csv
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import torch

from supervised_localizer import ARCHITECTURE, CHECKPOINT_SHA, sha
from train_supervised_localization import seed_everything, train
from review_supervised_validation import read_validation


class CpuTrainingTests(unittest.TestCase):
    def test_cpu_completes_without_any_cuda_queries_or_release(self):
        seed_everything()
        with TemporaryDirectory() as folder:
            root = Path(folder)
            data, cache, output = root / 'data', root / 'cache', root / 'output'
            data.mkdir(); cache.mkdir()
            rows = []
            for split in ('train', 'validation'):
                for condition in ('authentic_control', 'segm_flux1dev', 'random_flux1dev'):
                    rows.append(dict(sample_id=f'{split}-{condition}', source_id=split,
                                     split=split, condition=condition))
            manifest = data / 'training-manifest.csv'
            with manifest.open('w', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
                writer.writeheader(); writer.writerows(rows)
            records = []
            for index, row in enumerate(rows):
                target = np.zeros((32, 32), np.float32)
                if row['condition'] != 'authentic_control':
                    target[8:24, 8:24] = 1
                path = cache / f'{index}.npz'
                np.savez_compressed(path, features=np.zeros((768, 32, 32), np.float16), target=target)
                records.append(dict(**row, file=path.name, sha256=sha(path)))
            (cache / 'index.json').write_text(json.dumps(dict(architecture=ARCHITECTURE,
                encoder_sha256=CHECKPOINT_SHA, training_manifest_sha256=sha(manifest), records=records)))
            args = SimpleNamespace(device='cpu', data=data, cache=cache, output=output)
            with patch('torch.cuda.get_device_name', side_effect=AssertionError('CUDA query')), \
                 patch('torch.cuda.get_device_properties', side_effect=AssertionError('CUDA query')), \
                 patch('torch.cuda.max_memory_allocated', side_effect=AssertionError('CUDA query')), \
                 redirect_stdout(io.StringIO()):
                train(args)
            completion = json.loads((output / 'completion.json').read_text())
            self.assertTrue(completion['training_complete'])
            self.assertFalse(completion['test_evaluated'])
            self.assertFalse(completion['production_enabled'])
            self.assertIsNone(completion['peak_gpu_memory_bytes'])
            self.assertEqual(len(json.loads((output / 'history.json').read_text())), 20)
            report = json.loads((output / 'validation-report.json').read_text())
            self.assertFalse(report['release_approved'])
            self.assertEqual(report['head_sha256'], sha(output / 'best-head.pt'))
            self.assertEqual(json.loads((output / 'environment.json').read_text())['device'], 'cpu')
            review_rows, review_report, probabilities, targets, groups = read_validation(data, output)
            self.assertEqual(len(review_rows), 3)
            self.assertEqual(probabilities.shape, (3, 32, 32))
            self.assertEqual(review_report, report)
            order_path = output / 'validation-sample-order.json'
            order = json.loads(order_path.read_text())
            order_path.write_text(json.dumps(list(reversed(order))))
            with self.assertRaisesRegex(ValueError, 'order mismatch'):
                read_validation(data, output)
            with self.assertRaises(FileExistsError):
                train(args)


if __name__ == '__main__':
    unittest.main()
