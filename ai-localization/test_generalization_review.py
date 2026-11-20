import unittest
import numpy as np
from review_localization_generalization import paired_response


class PairedResponseTests(unittest.TestCase):
    def test_correct_edit_and_empty_control(self):
        target = np.array([[1, 0], [0, 0]])
        result = paired_response(target, np.zeros((2, 2)), target)
        self.assertEqual(result['edited_dice_at_050'], 1)
        self.assertEqual(result['control_overlap_with_edit_location_at_050'], 0)
        self.assertEqual(result['inside_score_lift'], 1)

    def test_same_object_response_is_not_edit_evidence(self):
        target = np.array([[1, 0], [0, 0]])
        result = paired_response(target, target, target)
        self.assertEqual(result['edited_dice_at_050'], 1)
        self.assertEqual(result['inside_score_lift'], 0)
        self.assertEqual(result['control_overlap_with_edit_location_at_050'], 1)

    def test_reject_invalid_inputs(self):
        target = np.array([[1, 0], [0, 0]])
        for invalid in (np.zeros((3, 3)), np.full((2, 2), np.nan), np.full((2, 2), 2.0)):
            with self.assertRaises(ValueError):
                paired_response(invalid, target, target)
        for invalid in (np.zeros((2, 2)), np.ones((2, 2))):
            with self.assertRaises(ValueError):
                paired_response(target, target, invalid)


if __name__ == '__main__':
    unittest.main()
