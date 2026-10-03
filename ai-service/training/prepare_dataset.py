"""Create a balanced, reproducible AuthentiScan training dataset.

The source folders must contain known real photographs and known AI-generated
images. This tool verifies image bytes, removes duplicate content, shuffles
with a recorded seed, creates train/valid/test splits, and writes a manifest.
It never overwrites a dataset that already contains images.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image, UnidentifiedImageError


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
SPLITS = ("train", "valid", "test")


@dataclass(frozen=True)
class SourceImage:
    path: Path
    sha256: str
    suffix: str
    label: str


def image_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as image_file:
        for chunk in iter(lambda: image_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_valid_supported_image(path: Path) -> bool:
    if path.suffix.lower() not in IMAGE_SUFFIXES:
        return False
    try:
        with Image.open(path) as image:
            image.verify()
        # ``verify`` checks headers but deliberately does not decode pixels.
        # Reopen and load every pixel so truncated/corrupt JPEGs are rejected
        # before they enter a reproducible training split.
        with Image.open(path) as image:
            image.load()
    except (UnidentifiedImageError, OSError):
        return False
    return True


def collect_unique_images(source: Path, label: str) -> tuple[list[SourceImage], int]:
    if not source.is_dir():
        raise ValueError(f"Source directory does not exist: {source}")

    seen_hashes: set[str] = set()
    unique_images: list[SourceImage] = []
    skipped = 0

    for path in sorted(candidate for candidate in source.rglob("*") if candidate.is_file()):
        if not is_valid_supported_image(path):
            skipped += 1
            continue
        digest = image_sha256(path)
        if digest in seen_hashes:
            skipped += 1
            continue
        seen_hashes.add(digest)
        unique_images.append(SourceImage(path, digest, path.suffix.lower(), label))

    return unique_images, skipped


def split_images(
    images: list[SourceImage], train_ratio: float, valid_ratio: float, seed: int
) -> dict[str, list[SourceImage]]:
    if train_ratio <= 0 or valid_ratio <= 0 or train_ratio + valid_ratio >= 1:
        raise ValueError("train_ratio and valid_ratio must be positive and sum to less than 1.")
    if len(images) < 3:
        raise ValueError("At least three unique images per class are required for train/valid/test.")

    shuffled = list(images)
    random.Random(seed).shuffle(shuffled)
    train_end = int(len(shuffled) * train_ratio)
    valid_end = train_end + int(len(shuffled) * valid_ratio)

    # Preserve at least one image in every split for small pilot datasets.
    train_end = max(1, min(train_end, len(shuffled) - 2))
    valid_end = max(train_end + 1, min(valid_end, len(shuffled) - 1))
    return {
        "train": shuffled[:train_end],
        "valid": shuffled[train_end:valid_end],
        "test": shuffled[valid_end:],
    }


def assert_output_is_safe(output: Path) -> None:
    if not output.exists():
        return
    existing_images = [
        path
        for path in output.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    ]
    if existing_images:
        raise ValueError(
            f"Output already contains {len(existing_images)} image(s): {output}. "
            "Choose a new empty folder rather than overwriting a dataset."
        )


def copy_split(
    output: Path, split: str, label: str, images: list[SourceImage], manifest: list[dict]
) -> None:
    target_directory = output / split / label
    target_directory.mkdir(parents=True, exist_ok=True)
    for index, source in enumerate(images, start=1):
        target_name = f"{label}_{index:06d}{source.suffix}"
        target = target_directory / target_name
        shutil.copy2(source.path, target)
        manifest.append(
            {
                "split": split,
                "label": label,
                "file": str(Path(split) / label / target_name),
                "source_sha256": source.sha256,
            }
        )


def build_dataset(
    real_source: Path,
    fake_source: Path,
    output: Path,
    train_ratio: float = 0.70,
    valid_ratio: float = 0.15,
    limit_per_class: int | None = None,
    seed: int = 42,
) -> dict:
    """Build an equally sized train/valid/test dataset and return its manifest."""
    assert_output_is_safe(output)
    real_images, real_skipped = collect_unique_images(real_source, "real")
    fake_images, fake_skipped = collect_unique_images(fake_source, "fake")

    real_hashes = {image.sha256 for image in real_images}
    fake_hashes = {image.sha256 for image in fake_images}
    overlap = real_hashes & fake_hashes
    if overlap:
        raise ValueError(
            f"{len(overlap)} identical image(s) appear in both real and fake sources. "
            "Fix the labels before training."
        )

    available_per_class = min(len(real_images), len(fake_images))
    if limit_per_class is not None:
        if limit_per_class < 3:
            raise ValueError("limit_per_class must be at least 3.")
        available_per_class = min(available_per_class, limit_per_class)
    if available_per_class < 3:
        raise ValueError("Need at least three unique valid images in each class.")

    # Balance before splitting. A distinct seed per class avoids paired ordering.
    real_selection = list(real_images)
    fake_selection = list(fake_images)
    random.Random(seed).shuffle(real_selection)
    random.Random(seed + 1).shuffle(fake_selection)
    real_splits = split_images(real_selection[:available_per_class], train_ratio, valid_ratio, seed)
    fake_splits = split_images(fake_selection[:available_per_class], train_ratio, valid_ratio, seed + 1)

    manifest_records: list[dict] = []
    for split in SPLITS:
        copy_split(output, split, "real", real_splits[split], manifest_records)
        copy_split(output, split, "fake", fake_splits[split], manifest_records)

    report = {
        "created_at": datetime.now(UTC).isoformat(),
        "seed": seed,
        "ratios": {"train": train_ratio, "valid": valid_ratio, "test": 1 - train_ratio - valid_ratio},
        "class_mapping": {"fake": 0, "real": 1},
        "input_sources": {"real": str(real_source), "fake": str(fake_source)},
        "available_unique_images": {"real": len(real_images), "fake": len(fake_images)},
        "skipped_files": {"real": real_skipped, "fake": fake_skipped},
        "used_per_class": available_per_class,
        "split_counts": {
            split: {"real": len(real_splits[split]), "fake": len(fake_splits[split])}
            for split in SPLITS
        },
        "records": manifest_records,
    }
    (output / "dataset-manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--real-source", required=True, type=Path)
    parser.add_argument("--fake-source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--train-ratio", type=float, default=0.70)
    parser.add_argument("--valid-ratio", type=float, default=0.15)
    parser.add_argument("--limit-per-class", type=int)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    report = build_dataset(
        args.real_source,
        args.fake_source,
        args.output,
        args.train_ratio,
        args.valid_ratio,
        args.limit_per_class,
        args.seed,
    )
    print("AuthentiScan dataset prepared safely.")
    print(f"Balanced images per class: {report['used_per_class']}")
    for split, counts in report["split_counts"].items():
        print(f"{split}: {counts['real']} real, {counts['fake']} fake")
    print(f"Manifest: {args.output / 'dataset-manifest.json'}")


if __name__ == "__main__":
    main()
