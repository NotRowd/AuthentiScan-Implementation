"""Safety/metric tests; these do not establish model accuracy."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from evaluate_safire import select_records, checked_path, tgif_development_records
from prepare_safire import Confirmation, ASSETS


class SafireTests(unittest.TestCase):
    def test_tgif_crosscheck_only_uses_first_training_source(self):
        root, rows = tgif_development_records()
        self.assertEqual([r['id'] for r in rows], ['train-724-authentic-control',
            'train-724-segm_flux1dev', 'train-724-random_flux1dev'])
        self.assertEqual([r['group'] for r in rows], ['authentic', 'partial', 'partial'])
        for row in rows:
            checked_path(root, row['image'], row['input_sha256'])
            checked_path(root, row['truth'], row['truth_sha256'])

    def test_selection_fixed_before_prediction_and_keeps_authentic_controls(self):
        rows = [dict(id=f'{group}-{i}', group=group) for group in
                ('full', 'authentic', 'partial') for i in range(4)]
        chosen = select_records(rows, 2)
        self.assertEqual([r['id'] for r in chosen],
            ['partial-0', 'partial-1', 'authentic-0', 'authentic-1', 'full-0', 'full-1'])
        for count in (0, 21):
            with self.assertRaises(ValueError):
                select_records(rows, count)
        with self.assertRaises(ValueError):
            select_records([r for r in rows if r['group'] != 'authentic'], 1)

    def test_hash_bound_inputs_reject_path_escape(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            asset = root/'fixture.bin'
            asset.write_bytes(b'fixture')
            digest = hashlib.sha256(b'fixture').hexdigest()
            self.assertEqual(checked_path(root, 'fixture.bin', digest), asset.resolve())
            with self.assertRaises(ValueError):
                checked_path(root, 'fixture.bin', '0'*64)
            with self.assertRaises(ValueError):
                checked_path(root, '../outside.bin', digest)

    def test_download_confirmation_and_total_scope(self):
        parser = Confirmation()
        parser.feed('<form id="other"><input name="id" value="wrong"></form>'
            '<form id="download-form" action="https://drive.usercontent.google.com/download">'
            '<input name="id" value="expected"><input name="confirm" value="t"></form>')
        self.assertEqual(parser.fields, {'id': 'expected', 'confirm': 't'})
        self.assertEqual(sum(asset[2] for asset in ASSETS), 795841097)

    def test_overlap_does_not_reward_empty_prediction_on_edited_truth(self):
        import numpy as np
        from localization import pixel_metrics
        empty = np.zeros((4, 4), dtype=np.float32)
        truth = np.zeros((4, 4), dtype=np.uint8)
        truth[1, 1] = 1
        self.assertEqual(pixel_metrics(empty, truth, .5)['dice'], 0)
        self.assertEqual(pixel_metrics(np.ones_like(empty), np.zeros_like(truth), .5)
                         ['false_positive_pixel_rate'], 1)
        with self.assertRaises(ValueError):
            pixel_metrics(np.full((4, 4), float('nan')), truth, .5)


if __name__ == '__main__':
    unittest.main()
