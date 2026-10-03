import unittest

from service.policy import InferencePolicy, classify_authentic_score


def policy() -> InferencePolicy:
    return InferencePolicy("pilot", 0.51, 0.05, "authentic", "base", "conv", "pool", "drop", "out")


class PolicyTests(unittest.TestCase):
    def test_authentic_and_ai_generated_decisions_use_calibrated_threshold(self):
        self.assertEqual(classify_authentic_score(0.70, policy())["verdict"], "authentic")
        self.assertEqual(classify_authentic_score(0.30, policy())["verdict"], "ai_generated")

    def test_scores_near_calibrated_threshold_are_uncertain(self):
        result = classify_authentic_score(0.55, policy())
        self.assertEqual(result["verdict"], "uncertain")
        self.assertAlmostEqual(result["authentic_score"], 0.55)
        self.assertAlmostEqual(result["ai_generated_score"], 0.45)


if __name__ == "__main__":
    unittest.main()
