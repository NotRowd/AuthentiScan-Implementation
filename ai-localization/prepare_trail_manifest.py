"""Create a TRAIL-compatible manifest from the frozen OpenSDI feasibility pilot.

This only records metadata and relative paths. It does not copy or alter dataset
assets, split examples, infer labels from images, or modify upstream TRAIL code.
All rows intentionally remain in one ``pilot`` split so its evaluator cannot
fit a threshold on the same exploratory cohort.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from PIL import Image


TRAIL_SIZE = 448


def _letterbox_pair(image_path: Path, mask_path: Path, image_out: Path, mask_out: Path) -> None:
    """Fit image/mask to TRAIL's square geometry without changing aspect ratio."""
    with Image.open(image_path) as source:
        image = source.convert("RGB")
    with Image.open(mask_path) as source:
        mask = source.convert("L")
    if image.size != mask.size:
        raise ValueError(f"image/mask geometry mismatch: {image_path} / {mask_path}")
    scale = min(TRAIL_SIZE / image.width, TRAIL_SIZE / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    image = image.resize(size, Image.Resampling.LANCZOS)
    mask = mask.resize(size, Image.Resampling.NEAREST)
    left = (TRAIL_SIZE - size[0]) // 2
    top = (TRAIL_SIZE - size[1]) // 2
    canvas = Image.new("RGB", (TRAIL_SIZE, TRAIL_SIZE), (124, 116, 104))
    mask_canvas = Image.new("L", (TRAIL_SIZE, TRAIL_SIZE), 0)
    canvas.paste(image, (left, top))
    mask_canvas.paste(mask, (left, top))
    image_out.parent.mkdir(parents=True, exist_ok=True)
    mask_out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(image_out, format="PNG", optimize=True)
    mask_canvas.save(mask_out, format="PNG", optimize=True)

def build_manifest(dataset_root: Path, output: Path) -> int:
    source = dataset_root / "manifest.json"
    rows = json.loads(source.read_text(encoding="utf-8"))
    if len(rows) != 60:
        raise ValueError(f"expected the frozen 60-record pilot, found {len(rows)}")
    converted = []
    seen: set[str] = set()
    for row in rows:
        sample_id = str(row["id"])
        if sample_id in seen:
            raise ValueError(f"duplicate sample id: {sample_id}")
        seen.add(sample_id)
        source_image = str(row["image"])
        source_mask = str(row["truth"])
        for relative in (source_image, source_mask):
            candidate = Path(relative)
            if candidate.is_absolute() or ".." in candidate.parts:
                raise ValueError(f"unsafe dataset path: {relative}")
            if not (dataset_root / candidate).is_file():
                raise FileNotFoundError(dataset_root / candidate)
        image = Path("trail-pilot-inputs") / f"{sample_id}.png"
        mask = Path("trail-pilot-inputs") / f"{sample_id}-mask.png"
        _letterbox_pair(
            dataset_root / source_image,
            dataset_root / source_mask,
            dataset_root / image,
            dataset_root / mask,
        )
        group = str(row["group"])
        if group not in {"full", "authentic", "partial"}:
            raise ValueError(f"unexpected group for {sample_id}: {group}")
        converted.append(
            {
                "sample_id": sample_id,
                "source_id": str(row["source_family"]),
                "split": "pilot",
                "image": image.as_posix(),
                "mask": mask.as_posix(),
                "condition": "fully_generated" if group == "full" else group,
                "regime": group,
                "generator": str(row["generator"]),
            }
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(converted[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(converted)
    return len(converted)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    count = build_manifest(args.dataset_root, args.output)
    print(f"Wrote {count} pilot rows to {args.output}")
    print("All records use split=pilot; do not fit a threshold on this cohort.")


if __name__ == "__main__":
    main()
