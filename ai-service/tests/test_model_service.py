import unittest
from io import BytesIO
from pathlib import Path
import sys

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from model_service import classify_score, verified_image_format
from calibrate_label_mapping import mapping_from_means
from evaluate_model import evaluate_records, verdict_from_authentic_score


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

    def test_file_contents_confirm_a_png_image(self):
        image_bytes = BytesIO()
        Image.new("RGB", (1, 1)).save(image_bytes, format="PNG")

        self.assertEqual(verified_image_format(image_bytes.getvalue()), "PNG")

    def test_bmp_content_is_not_an_allowed_upload_format(self):
        image_bytes = BytesIO()
        Image.new("RGB", (1, 1)).save(image_bytes, format="BMP")

        with self.assertRaisesRegex(ValueError, "Only JPEG, PNG, and WebP"):
            verified_image_format(image_bytes.getvalue())

    def test_evaluation_counts_correct_and_uncertain_predictions(self):
        records = [
            {"expected": "authentic", "predicted": "authentic"},
            {"expected": "ai_generated", "predicted": "ai_generated"},
            {"expected": "authentic", "predicted": "uncertain"},
            {"expected": "ai_generated", "predicted": "authentic"},
        ]

        result = evaluate_records(records)

        self.assertEqual(result["correct_predictions"], 2)
        self.assertEqual(result["uncertain_predictions"], 1)
        self.assertEqual(result["missed_ai_generated"], 1)
        self.assertEqual(verdict_from_authentic_score(0.5, 0.05), "uncertain")


if __name__ == "__main__":
    unittest.main()
