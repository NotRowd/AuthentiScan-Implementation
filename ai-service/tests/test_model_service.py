import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from model_service import classify_score
from calibrate_label_mapping import mapping_from_means


class ClassifyScoreTests(unittest.TestCase):
    def test_ai_generated_positive_class(self):
        result = classify_score(0.9, "ai_generated", 0.05)

        self.assertEqual(result["verdict"], "ai_generated")
        self.assertEqual(result["ai_generated_score"], 0.9)
        self.assertAlmostEqual(result["authentic_score"], 0.1)

    def test_authentic_positive_class(self):
        result = classify_score(0.9, "authentic", 0.05)

        self.assertEqual(result["verdict"], "authentic")
        self.assertEqual(result["authentic_score"], 0.9)
        self.assertAlmostEqual(result["ai_generated_score"], 0.1)

    def test_uncertain_score_near_boundary(self):
        result = classify_score(0.5, "ai_generated", 0.05)

        self.assertEqual(result["verdict"], "uncertain")

    def test_mapping_is_ai_generated_when_generated_scores_are_higher(self):
        self.assertEqual(mapping_from_means(0.2, 0.8), "ai_generated")

    def test_mapping_is_authentic_when_authentic_scores_are_higher(self):
        self.assertEqual(mapping_from_means(0.8, 0.2), "authentic")


if __name__ == "__main__":
    unittest.main()
