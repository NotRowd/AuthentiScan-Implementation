import unittest
import numpy as np
from run_vaas import align_map


class MapAlignmentTests(unittest.TestCase):
    def test_constant_preserved_without_brightening(self):
        out = align_map(np.full((224, 224), .2, dtype=np.float32), (129, 384))
        self.assertEqual(out.shape, (129, 384))
        np.testing.assert_allclose(out, .2, atol=1e-6)

    def test_orientation_preserved(self):
        native = np.zeros((224, 224), dtype=np.float32)
        native[:, 112:] = 1
        out = align_map(native, (300, 400))
        self.assertLess(out[150, 10], .01)
        self.assertGreater(out[150, 390], .99)

    def test_invalid_shape_rejected(self):
        with self.assertRaises(ValueError):
            align_map(np.zeros((20, 20)), (30, 30))

    def test_nonfinite_rejected(self):
        with self.assertRaises(ValueError):
            align_map(np.full((224, 224), np.nan), (30, 30))


if __name__ == "__main__":
    unittest.main()
