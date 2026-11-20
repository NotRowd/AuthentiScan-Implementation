import unittest
from evaluate_pilot import aggregate
from localization import pixel_metrics


class PilotTests(unittest.TestCase):
    def row(self, scores, truth):
        return {"metrics": pixel_metrics(scores, truth, .5), "inference_seconds": 1.0}

    def test_exact_edit_has_perfect_overlap(self):
        result = aggregate([self.row([[.9, .1]], [[1, 0]])])
        self.assertEqual(result["mean_iou"], 1.0)
        self.assertEqual(result["mean_dice"], 1.0)

    def test_full_generation_reports_coverage_not_class_score(self):
        result = aggregate([self.row([[.9, .1]], [[1, 1]])])
        self.assertEqual(result["mean_iou"], .5)
        self.assertIsNone(result["mean_false_positive_pixel_rate"])

    def test_inverted_mask_not_accepted_as_correct(self):
        result = aggregate([self.row([[.1, .9]], [[1, 0]])])
        self.assertEqual(result["mean_iou"], 0.0)

    def test_false_highlight_is_counted(self):
        row = self.row([[.9, .1]], [[0, 0]])
        row["metrics"]["iou"] = row["metrics"]["dice"] = None
        result = aggregate([row])
        self.assertEqual(result["mean_false_positive_pixel_rate"], .5)
        self.assertEqual(result["images_over_1pct_highlight"], 1)
        self.assertIsNone(result["mean_iou"])


if __name__ == "__main__":
    unittest.main()
