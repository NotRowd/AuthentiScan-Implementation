import unittest
import numpy as np
import torch
from safire_direct import direct_loss, choose_threshold, verified_rows


class DirectTests(unittest.TestCase):
    def test_authentic_controls_penalize_highlights(self):
        logits = torch.ones(1, 1, 4, 4, requires_grad=True)
        loss = direct_loss(logits, torch.zeros(1, 1, 8, 8))
        loss.backward()
        self.assertTrue((logits.grad > 0).all())

    def test_edited_targets_penalize_empty_output(self):
        logits = torch.full((1, 1, 4, 4), -10., requires_grad=True)
        direct_loss(logits, torch.ones_like(logits)).backward()
        self.assertTrue((logits.grad < 0).all())

    def test_nonfinite_predictions_rejected(self):
        with self.assertRaises(ValueError):
            direct_loss(torch.full((1,1,4,4), float('nan')), torch.zeros(1,1,4,4))

    def test_selection_rejects_test_data(self):
        with self.assertRaises(ValueError):
            choose_threshold([], [], [{'split':'test'}])

    def test_all_foreground_fails_control_gate(self):
        rows = [dict(split='validation', condition=c) for c in
                ('authentic_control', 'segm_flux1dev', 'random_flux1dev')]
        p = np.ones((3,448,448), dtype=np.float32)
        t = p.copy(); t[0] = 0
        self.assertEqual(choose_threshold(p,t,rows)['status'], 'no_acceptable_validation_threshold')

    def test_empty_predictions_do_not_pass_edit_gate(self):
        rows = [dict(split='validation', condition=c) for c in
                ('authentic_control', 'segm_flux1dev', 'random_flux1dev')]
        p = np.zeros((3,448,448), dtype=np.float32)
        t = p.copy(); t[1:,100:200,100:200] = 1
        decision=choose_threshold(p,t,rows)
        self.assertEqual(decision['status'],'validation_gate_failed')
        self.assertEqual(decision['edited_macro_dice'],0)
        self.assertFalse(decision['release_approved'])

    def test_json_checkpoint_write_is_readable(self):
        import tempfile
        import json
        from pathlib import Path
        from train_safire_direct import write_json
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'status.json'
            write_json(path,{'stage':'first'})
            write_json(path,{'stage':'second'})
            self.assertEqual(json.loads(path.read_text()),{'stage':'second'})
            self.assertFalse(path.with_suffix('.json.partial').exists())

    def test_source_separated_data_integrity(self):
        rows, _ = verified_rows()
        self.assertEqual(sum(r['split']=='train' for r in rows),480)
        self.assertEqual(sum(r['split']=='validation' for r in rows),120)
        self.assertFalse({r['source_id'] for r in rows if r['split']=='train'} &
                         {r['source_id'] for r in rows if r['split']=='validation'})


if __name__ == '__main__':
    unittest.main()
