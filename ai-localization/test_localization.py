import unittest
import numpy as np
from PIL import Image
from localization import unit_map, threshold_mask, pixel_metrics, overlay


class LocalizationTests(unittest.TestCase):
    def test_rejects_invalid_values(self):
        for value in (float("nan"), float("inf"), -0.1, 1.1):
            with self.assertRaises(ValueError):
                unit_map([[value]])

    def test_rejects_wrong_shape(self):
        with self.assertRaises(ValueError):
            unit_map(np.zeros((2, 3)), (3, 2))

    def test_no_per_image_normalization(self):
        self.assertFalse(threshold_mask(np.full((2, 2), 0.01), 0.5).any())

    def test_bad_threshold(self):
        for value in (0, 1, float("nan")):
            with self.assertRaises(ValueError):
                threshold_mask([[0.2]], value)

    def test_perfect_partial_mask(self):
        result = pixel_metrics([[0.9, 0.1]], [[1, 0]], 0.5)
        self.assertEqual(result["iou"], 1)
        self.assertEqual(result["dice"], 1)

    def test_authentic_is_not_fake_perfect_score(self):
        result = pixel_metrics([[0.1, 0.1]], [[0, 0]], 0.5)
        self.assertIsNone(result["iou"])
        self.assertEqual(result["false_positive_pixel_rate"], 0)

    def test_false_highlight(self):
        result = pixel_metrics([[0.9, 0.1]], [[0, 0]], 0.5)
        self.assertEqual(result["false_positive_pixel_rate"], 0.5)

    def test_overlay_leaves_unselected_pixels_unchanged(self):
        image = Image.new("RGB", (2, 1), (40, 60, 80))
        result = np.asarray(overlay(image, [[0.1, 0.9]], 0.5))
        np.testing.assert_array_equal(result[0, 0], [40, 60, 80])
        self.assertFalse(np.array_equal(result[0, 1], [40, 60, 80]))


if __name__ == "__main__":
    unittest.main()
