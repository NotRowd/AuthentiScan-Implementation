"""Small contract tests for our TRAIL pilot preparation helpers."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from prepare_trail_manifest import _letterbox_pair


class LetterboxPairTests(unittest.TestCase):
    def test_preserves_geometry_and_keeps_padding_out_of_truth(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image_path = root / "source.png"
            mask_path = root / "truth.png"
            image_out = root / "prepared" / "image.png"
            mask_out = root / "prepared" / "mask.png"
            source = np.zeros((50, 100, 3), dtype=np.uint8)
            source[:, 50:] = 255
            truth = np.zeros((50, 100), dtype=np.uint8)
            truth[:, 50:] = 255
            Image.fromarray(source).save(image_path)
            Image.fromarray(truth).save(mask_path)

            _letterbox_pair(image_path, mask_path, image_out, mask_out)

            with Image.open(image_out) as prepared_image:
                result = np.asarray(prepared_image)
            with Image.open(mask_out) as prepared_mask:
                mask = np.asarray(prepared_mask)
            self.assertEqual(result.shape, (448, 448, 3))
            self.assertEqual(mask.shape, (448, 448))
            self.assertTrue(np.all(mask[:111] == 0))
            self.assertTrue(np.all(mask[337:] == 0))
            self.assertEqual(int(mask[112:336, :224].max()), 0)
            self.assertEqual(int(mask[112:336, 224:].min()), 255)
            self.assertTrue(np.all(result[:111] == np.asarray([124, 116, 104])))


if __name__ == "__main__":
    unittest.main()
