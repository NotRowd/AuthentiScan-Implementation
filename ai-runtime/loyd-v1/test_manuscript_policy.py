"""Decision-policy checks without loading TensorFlow or modifying saved scans."""
import json
import math
from pathlib import Path
import tempfile
import unittest
from service.policy import load_policy, classify_authentic_score

ROOT = Path(__file__).resolve().parent

class ManuscriptPolicyTests(unittest.TestCase):
    def setUp(self):
        self.policy = load_policy(ROOT / 'policy.manuscript-60.json')

    def test_exact_and_near_boundaries(self):
        cases = [(0, 'ai_generated'), (.27, 'ai_generated'), (.37, 'ai_generated'),
                 (.4, 'ai_generated'), (math.nextafter(.4, 1), 'uncertain'),
                 (.400001, 'uncertain'), (.5, 'uncertain'), (.5102, 'uncertain'),
                 (.599999, 'uncertain'), (math.nextafter(.6, 0), 'uncertain'),
                 (.6, 'authentic'), (1, 'authentic')]
        for score, expected in cases:
            with self.subTest(score=score):
                result = classify_authentic_score(score, self.policy)
                self.assertEqual(result['verdict'], expected)
                self.assertEqual(result['minimum_class_score'], .6)
                self.assertEqual(result['decision_rule'], 'manuscript_min_score_v1')
                self.assertEqual(result['authentic_score'], score)
                self.assertEqual(result['ai_generated_score'], 1-score)
                self.assertEqual(result['confidence_kind'], 'max_class_score_no_verdict' if expected=='uncertain' else 'verdict_class_score')

    def test_old_policy_retains_original_decisions_and_version(self):
        old = load_policy(ROOT.parents[1] / 'ai-work/2026-10-04/candidate-evaluation-v1/policy.validation-locked.json')
        self.assertEqual(old.policy_version, 'sha256:f743e894d346fb5b')
        self.assertNotEqual(old.policy_version, self.policy.policy_version)
        for score in [.27, .32, .37]:
            self.assertEqual(classify_authentic_score(score, old)['verdict'], 'uncertain')
        self.assertEqual(classify_authentic_score(.5102, old)['verdict'], 'authentic')

    def test_invalid_policy_and_scores_rejected(self):
        for score in [math.nan, math.inf, -1, 1.01]:
            with self.assertRaises(ValueError):classify_authentic_score(score, self.policy)
        raw=json.loads((ROOT/'policy.manuscript-60.json').read_text())
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'invalid.json'
            for patch in [{'decision_rule':'unknown'}, {'minimum_class_score':.55}, {'threshold':.32}, {'uncertainty_margin':.05}]:
                path.write_text(json.dumps({**raw, **patch}))
                with self.assertRaises(ValueError):load_policy(path)

if __name__=='__main__':unittest.main()
