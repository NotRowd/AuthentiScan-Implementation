import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from training.prepare_dataset import build_dataset


def create_image(path: Path, color: tuple[int, int, int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), color).save(path, format="PNG")


class PrepareDatasetTests(unittest.TestCase):
    def test_balances_classes_splits_and_writes_manifest(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            real_source = root / "real-source"
            fake_source = root / "fake-source"
            for index in range(10):
                create_image(real_source / f"real-{index}.png", (index, 0, 0))
                create_image(fake_source / f"fake-{index}.png", (0, index + 10, 255))

            output = root / "prepared"
            report = build_dataset(real_source, fake_source, output, seed=7)

            self.assertEqual(report["used_per_class"], 10)
            self.assertEqual(report["class_mapping"], {"fake": 0, "real": 1})
            self.assertEqual(report["split_counts"]["train"], {"real": 7, "fake": 7})
            self.assertEqual(report["split_counts"]["valid"], {"real": 1, "fake": 1})
            self.assertEqual(report["split_counts"]["test"], {"real": 2, "fake": 2})
            self.assertTrue((output / "dataset-manifest.json").is_file())
            self.assertEqual(
                len(json.loads((output / "dataset-manifest.json").read_text())["records"]), 20
            )

    def test_rejects_duplicate_image_content_across_labels(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            real_source = root / "real-source"
            fake_source = root / "fake-source"
            for index in range(3):
                create_image(real_source / f"real-{index}.png", (index, 0, 0))
                create_image(fake_source / f"fake-{index}.png", (0, index + 10, 255))
            (fake_source / "wrong-label.png").write_bytes((real_source / "real-0.png").read_bytes())

            with self.assertRaisesRegex(ValueError, "both real and fake"):
                build_dataset(real_source, fake_source, root / "prepared")

    def test_skips_truncated_images(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            real_source = root / "real-source"
            fake_source = root / "fake-source"
            for index in range(4):
                create_image(real_source / f"real-{index}.png", (index, 0, 0))
                create_image(fake_source / f"fake-{index}.png", (0, index + 10, 255))
            # A PNG signature/header alone can pass shallow checks but cannot
            # be fully decoded; it must never be copied into a training split.
            (real_source / "truncated.png").write_bytes(b"\\x89PNG\\r\\n\\x1a\\n")

            report = build_dataset(real_source, fake_source, root / "prepared")

            self.assertEqual(report["skipped_files"]["real"], 1)
            self.assertEqual(report["used_per_class"], 4)


if __name__ == "__main__":
    unittest.main()
