"""Render fixed-scale example overlays from one TRAIL pilot run."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def palette(values: np.ndarray) -> np.ndarray:
    """Blue -> cyan -> green -> yellow -> red display palette."""
    stops = np.asarray(
        [[15, 35, 220], [0, 205, 255], [0, 220, 70], [255, 235, 0], [235, 20, 20]],
        dtype=np.float32,
    )
    x = np.clip(values, 0, 1) * (len(stops) - 1)
    lo = np.floor(x).astype(int)
    hi = np.minimum(lo + 1, len(stops) - 1)
    fraction = (x - lo)[..., None]
    return np.rint(stops[lo] * (1 - fraction) + stops[hi] * fraction).astype(np.uint8)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    # Use only a local import for the pinned upstream's median filter.
    from trail.core import median3
    from trail.data import sha256_file

    root = args.data_root.resolve()
    run_dir = args.run_dir.resolve()
    run = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    with args.manifest.open(newline="", encoding="utf-8") as handle:
        rows = {row["sample_id"]: row for row in csv.DictReader(handle)}
    if run.get("manifest_sha256") != sha256_file(args.manifest.resolve()):
        raise ValueError("run manifest checksum differs")
    chosen = ["sd15-full-1139", "sd15-authentic-1139", "sd15-partial-1139"]
    by_id = {str(record["sample_id"]): record for record in run["records"]}
    maps: dict[str, np.ndarray] = {}
    layer = int(run["model"]["layers"][0])
    for sample_id in chosen:
        record = by_id[sample_id]
        file = run_dir / record["file"]
        if sha256_file(file) != record["sha256"]:
            raise ValueError(f"prediction checksum mismatch: {file}")
        with np.load(file, allow_pickle=False) as payload:
            maps[sample_id] = median3(np.asarray(payload["scores"][0], dtype=np.float32))
    all_maps = []
    for item in run["records"]:
        with np.load(run_dir / item["file"], allow_pickle=False) as payload:
            all_maps.append(np.asarray(payload["scores"][0], dtype=np.float32).ravel())
    all_values = np.concatenate(all_maps)
    scale_max = float(np.percentile(all_values, 99))
    cell = 448
    margin, gap, label_h = 20, 12, 34
    canvas = Image.new("RGB", (margin * 2 + cell * 3 + gap * 2,
                               margin * 2 + 3 * (cell + label_h) + 2 * gap), "white")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    headings = ["Input image", "TRAIL score overlay", "Pilot annotation"]
    for col, title in enumerate(headings):
        x = margin + col * (cell + gap)
        draw.text((x, 4), title, fill=(15, 40, 75), font=font)
    for row_index, sample_id in enumerate(chosen):
        row = rows[sample_id]
        y = margin + label_h + row_index * (cell + label_h + gap)
        image_path = root / row["image"]
        mask_path = root / row["mask"]
        with Image.open(image_path) as source:
            original = source.convert("RGB").resize((cell, cell), Image.Resampling.BICUBIC)
        score = maps[sample_id]
        normalized = np.clip(score / max(scale_max, 1e-8), 0, 1)
        heat = Image.fromarray(palette(normalized)).resize((cell, cell), Image.Resampling.BILINEAR)
        overlay = Image.blend(original, heat, 0.42)
        with Image.open(mask_path) as mask_image:
            mask = mask_image.convert("L").resize((cell, cell), Image.Resampling.NEAREST)
        annotation = Image.new("RGB", (cell, cell), (28, 32, 38))
        annotation_np = np.asarray(annotation).copy()
        mask_np = np.asarray(mask) > 127
        annotation_np[mask_np] = (255, 30, 190)
        annotation = Image.fromarray(annotation_np)
        for col, visual in enumerate((original, overlay, annotation)):
            x = margin + col * (cell + gap)
            canvas.paste(visual, (x, y))
        draw.text((margin, y - label_h + 5), f"{sample_id}  |  {row['regime']}",
                  fill=(15, 40, 75), font=font)
    footer_y = canvas.height - 18
    draw.text((margin, footer_y),
              f"Fixed shared score scale: 0 to {scale_max:.5f}; native map is 32x32 patches. "
              "TRAIL drift is not a probability or calibrated mask.",
              fill=(40, 50, 65), font=font)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, format="PNG", optimize=True)
    print(f"Saved {args.output} (shared 99th-percentile display ceiling {scale_max:.6g})")


if __name__ == "__main__":
    main()
