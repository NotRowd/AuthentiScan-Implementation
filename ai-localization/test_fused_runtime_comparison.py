import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
from compare_fused_runtimes import audit
from evaluate_fused_candidate import metrics


class RuntimeComparisonTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name) / 'base'
        self.new = Path(self.temp.name) / 'new'
        self.expected = []
        rows = []
        for i in range(9):
            condition = ('authentic_control', 'segm_flux1dev', 'random_flux1dev')[i % 3]
            sample = f'case-{i}'
            self.expected.append(dict(sample_id=sample, condition=condition))
            truth = np.array([[0, 0], [0, 0 if i % 3 == 0 else 255]], dtype=np.uint8)
            scores = truth.astype(np.float32) / 255
            result = metrics(scores, truth // 255)
            rows.append(dict(sample_id=sample, condition=condition, image_sha256='a'*64,
                mask_sha256='b'*64, upstream_postprocess=result, **result))
            for folder in (self.base, self.new):
                folder.mkdir(exist_ok=True)
                np.savez(folder / (sample + '.npz'), scores=scores, upstream_scores=scores, truth=truth)
        self.report = dict(stage='development_screen_complete', threshold=.5, release_approved=False,
            source_commit='fixed-source', runtime={'author_inference_versions': True}, rows=rows)
        for folder in (self.base, self.new):
            (folder / 'RESULT.json').write_text(json.dumps(self.report), encoding='utf-8')
        self.patcher = patch('compare_fused_runtimes.selected_rows', return_value=self.expected)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def update(self):
        (self.new / 'RESULT.json').write_text(json.dumps(self.report), encoding='utf-8')

    def test_verifies_metrics_without_approving_release(self):
        result = audit(self.base, self.new)
        self.assertFalse(result['release_approved'])
        self.assertTrue(all(row['max_score_difference'] == 0 for row in result['rows']))
        self.assertIsNone(result['groups']['authentic_control']['current']['mean_dice'])

    def test_rejects_claim_not_supported_by_saved_map(self):
        self.report['rows'][1]['dice'] = .4
        self.update()
        with self.assertRaisesRegex(ValueError, 'metric'):
            audit(self.base, self.new)

    def test_rejects_input_mismatch(self):
        self.report['rows'][0]['image_sha256'] = 'c'*64
        self.update()
        with self.assertRaisesRegex(ValueError, 'identity'):
            audit(self.base, self.new)

    def test_rejects_incomplete_comparison(self):
        self.report['stage'] = 'inference'
        self.update()
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            audit(self.base, self.new)

    def test_rejects_different_checkpoint_as_runtime_comparison(self):
        self.report['checkpoint'] = 'sofake'
        self.update()
        with self.assertRaisesRegex(ValueError, 'Checkpoint changed'):
            audit(self.base, self.new)


if __name__ == '__main__':
    unittest.main()
