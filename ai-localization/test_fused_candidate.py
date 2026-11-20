import unittest
import numpy as np
from evaluate_fused_candidate import metrics, selected_rows, reviewed_config


class FusedScreenTests(unittest.TestCase):
    def legacy_config(self):
        return dict(_target_='fused.model.model.FUSED', enable_seg=True,
            fusion_mode='self_attn', moe_before_sa=True, seg_decoder_mode='joint',
            convnext_input_size=512, pretrained_path=None, attention_branches=8,
            pooling='mha', final_pooling='attn', seg_global_bias=False)

    def test_sofake_legacy_query_count_is_explicit(self):
        config, ignored = reviewed_config(self.legacy_config(), {'pretrained_path', 'num_latents'}, 'sofake')
        self.assertEqual(config, {'pretrained_path': None, 'num_latents': 8})
        self.assertEqual(ignored['attention_branches'], 8)

    def test_legacy_config_changes_are_rejected(self):
        for key, value in [('attention_branches', 4), ('pooling', 'mean'),
                           ('final_pooling', 'mean'), ('seg_global_bias', True),
                           ('unknown_option', True), ('pretrained_path', 'other.pth'),
                           ('num_latents', 8)]:
            saved = self.legacy_config()
            saved[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                reviewed_config(saved, {'pretrained_path', 'num_latents'}, 'sofake')

    def test_opensdi_does_not_accept_sofake_extras(self):
        with self.assertRaises(ValueError):
            reviewed_config(self.legacy_config(), {'pretrained_path', 'num_latents'}, 'opensdi')
        saved = self.legacy_config()
        for key in ('attention_branches', 'pooling', 'final_pooling', 'seg_global_bias'):
            del saved[key]
        saved['num_latents'] = 8
        config, _ = reviewed_config(saved, {'pretrained_path', 'num_latents'}, 'opensdi')
        self.assertEqual(config['num_latents'], 8)

    def test_fixed_cohort_uses_only_nine_train_cases(self):
        rows = selected_rows()
        self.assertEqual(len(rows), 9)
        self.assertTrue(all(row['split'] == 'train' for row in rows))

    def test_perfect_and_missed_masks(self):
        truth = np.array([[1, 0], [0, 0]])
        self.assertEqual(metrics(truth.astype(float), truth)['dice'], 1)
        self.assertEqual(metrics(np.zeros((2, 2)), truth)['dice'], 0)

    def test_authentic_not_reported_as_perfect_dice(self):
        result = metrics(np.zeros((2, 2)), np.zeros((2, 2)))
        self.assertIsNone(result['dice'])
        self.assertEqual(result['highlighted_fraction'], 0)
        self.assertEqual(metrics(np.ones((2, 2)), np.zeros((2, 2)))['highlighted_fraction'], 1)

    def test_invalid_scores_and_masks_rejected(self):
        for scores, truth in [(np.array([[np.nan]]), np.zeros((1, 1))),
                              (np.ones((2, 2)), np.zeros((1, 1))),
                              (np.array([[1.1]]), np.zeros((1, 1))),
                              (np.zeros((1, 1)), np.array([[2]]))]:
            with self.assertRaises(ValueError):
                metrics(scores, truth)


if __name__ == '__main__':
    unittest.main()
