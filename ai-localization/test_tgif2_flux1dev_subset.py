from __future__ import annotations

import unittest
import csv
import hashlib
import json
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from acquire_tgif2_flux1dev_subset import ARCHIVES, MAX_DATASET_BYTES
from prepare_tgif2_flux1dev_subset import IMAGE_SIZE, resize_mask, source_ids_by_split
from summarize_tgif2_flux1dev_subset import summarize_rows, verified_prediction_rows


class Tgif2Flux1DevSubsetTests(unittest.TestCase):
    def test_archive_bundle_stays_within_user_cap(self) -> None:
        total = sum(archive.expected_bytes for archive in ARCHIVES)
        self.assertEqual(total, 3_731_300_672)
        self.assertLess(total, MAX_DATASET_BYTES)
        self.assertEqual(len({archive.expected_sha256 for archive in ARCHIVES}), len(ARCHIVES))

    def test_frozen_development_and_confirmation_sources_are_disjoint(self) -> None:
        cohorts = source_ids_by_split()
        self.assertEqual(len(cohorts["dev"]), 80)
        self.assertEqual(len(cohorts["test"]), 80)
        self.assertTrue(set(cohorts["dev"]).isdisjoint(cohorts["test"]))

    def test_mask_resize_produces_binary_448_grid(self) -> None:
        source = np.zeros((23, 41), dtype=np.uint8)
        source[4:19, 10:35] = 255
        result = resize_mask(source)
        self.assertEqual(result.shape, (IMAGE_SIZE, IMAGE_SIZE))
        self.assertEqual(set(np.unique(result)), {False, True})
        self.assertGreater(float(result.mean()), 0.0)
        self.assertLess(float(result.mean()), 1.0)

    def test_summary_keeps_development_and_test_groups_separate(self) -> None:
        rows = [
            {
                "split": "dev",
                "image_role": "edited",
                "condition": "segm_flux1dev",
                "source_id": "source-1",
                "auroc": "0.8",
                "auprc": "0.4",
                "dice": "0.5",
                "iou": "0.33",
                "pixel_auroc": "nan",
                "pixel_auprc": "nan",
                "positive_patches": "12",
                "background_patches": "20",
                "oracle_dice": "1.0",
            },
            {
                "split": "test",
                "image_role": "aligned_original",
                "condition": "authentic_control",
                "source_id": "source-2",
                "auroc": "nan",
                "auprc": "nan",
                "dice": "1.0",
                "iou": "1.0",
                "pixel_auroc": "nan",
                "pixel_auprc": "nan",
                "positive_patches": "0",
                "background_patches": "784",
                "predicted_positive_patches": 2,
                "evaluated_patches": 784,
            },
        ]
        result = summarize_rows(rows)
        self.assertEqual(result["split_counts"], {"dev": 1, "test": 1})
        self.assertFalse(result["test_threshold_retuning"])
        test_control = next(group for group in result["groups"] if group["split"] == "test")
        self.assertEqual(test_control["images_with_any_false_highlight"], 1)
        self.assertAlmostEqual(test_control["false_highlight_patch_fraction_image_macro"], 2 / 784)
        self.assertNotIn("oracle_dice_image_macro", test_control)
        self.assertIsNone(test_control["dice_image_macro"])

    def test_real_prediction_artifacts_determine_false_highlights(self) -> None:
        # The upstream CSV contains truth counts, not predicted counts, and
        # omits image_role. Join roles from the manifest and read actual maps.
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            manifest = root / "manifest.csv"
            rows = [dict(sample_id=split, source_id=split, split=split,
                         image="unused.png", mask="mask.png",
                         image_role="aligned_original", condition="authentic_control")
                    for split in ("dev", "test")]
            with manifest.open("w", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=rows[0])
                writer.writeheader()
                writer.writerows(rows)
            Image.fromarray(np.zeros((448, 448), dtype=np.uint8)).save(root / "mask.png")
            records = []
            for row in rows:
                path = root / (row["sample_id"] + ".npz")
                np.savez(path, scores=np.ones((1, 32, 32), dtype=np.float32))
                records.append(dict(sample_id=row["sample_id"], file=path.name,
                                    sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
            run = dict(manifest_sha256=hashlib.sha256(manifest.read_bytes()).hexdigest(),
                       mask_blind_inference=True, model={"layers": [11]}, records=records)
            (root / "run.json").write_text(json.dumps(run))
            summary = dict(threshold_source="fit on splits dev", threshold=0.5,
                           layer=11, median3=True)
            (root / "summary.json").write_text(json.dumps(summary))
            columns = ["sample_id", "source_id", "split", "positive_patches", "background_patches"]
            with (root / "per_image.csv").open("w", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=columns)
                writer.writeheader()
                for row in rows:
                    writer.writerow({**{key: row[key] for key in columns[:3]},
                                     "positive_patches": 0, "background_patches": 1024})
            verified, threshold = verified_prediction_rows(root, manifest, root, root)
            self.assertEqual(threshold, 0.5)
            self.assertEqual(verified[1]["predicted_positive_patches"], 1024)
            self.assertEqual(verified[1]["false_positive_patches"], 1024)
            self.assertEqual(summarize_rows(verified)["groups"][1][
                "false_highlight_patch_fraction_image_macro"], 1.0)
            summary["threshold_source"] = "fit on splits test"
            (root / "summary.json").write_text(json.dumps(summary))
            with self.assertRaisesRegex(ValueError, "exclusively on dev"):
                verified_prediction_rows(root, manifest, root, root)
            summary["threshold_source"] = "fit on splits dev"
            (root / "summary.json").write_text(json.dumps(summary))
            (root / "test.npz").write_bytes(b"corrupt")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                verified_prediction_rows(root, manifest, root, root)


if __name__ == "__main__":
    unittest.main()
