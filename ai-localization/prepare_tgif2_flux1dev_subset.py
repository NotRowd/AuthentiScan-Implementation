"""Prepare source-disjoint TGIF2 Flux.1-dev development and test cohorts."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import tarfile
from pathlib import Path

import numpy as np
from PIL import Image

from acquire_tgif2_flux1dev_subset import ARCHIVES, verify


IMAGE_SIZE = 448
REPOSITORY = "https://github.com/IDLabMedia/tgif-dataset"
REPOSITORY_COMMIT = "fc5c557bd1a2d49a5dabc3676a54cfc44798f4ea"
UPSTREAM = Path(__file__).parent / "vendor" / "trail-image-edit-localization"
COHORTS = {
    "dev": UPSTREAM / "data" / "splits" / "tgif2_development_80.csv",
    "test": UPSTREAM / "data" / "splits" / "tgif2_confirmation_80.csv",
}
ARCHIVE_PATHS = {
    "originals": Path("flux/orig-flux/orig-flux_testing.tar.gz"),
    "semantic_mask": Path("tgif/masks/masks_testing.tar.gz"),
    "semantic_fake": Path("flux/flux1dev-sp/flux1dev-sp_testing.tar.gz"),
    "random_mask": Path("random/masks-flux/masks-flux_testing.tar.gz"),
    "random_fake": Path("random/flux1dev-sp/flux1dev-sp_testing.tar.gz"),
}
FAKE_CONDITIONS = (
    {
        "condition": "segm_flux1dev",
        "mask_type": "segmentation",
        "fake_suffix": "_mask_segm.png_ps_mask.png_flux1dev_0.png",
        "mask_suffix": "_mask_segm.png_ps_mask.png",
        "mask_archive": "semantic_mask",
    },
    {
        "condition": "random_flux1dev",
        "mask_type": "random",
        "fake_suffix": "_mask_random.png_spliced_flux1dev_0.png",
        "mask_suffix": "_mask_random.png",
        "mask_archive": "random_mask",
    },
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_cohort(path: Path, expected_rows: int = 80) -> list[str]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    ids = [str(int(row["authentic_source_id"])) for row in rows]
    if len(ids) != expected_rows or len(set(ids)) != expected_rows:
        raise ValueError(f"invalid frozen cohort {path}: expected {expected_rows} unique IDs")
    return ids


def read_selected(archive: Path, wanted: set[str]) -> dict[str, bytes]:
    found: dict[str, bytes] = {}
    with tarfile.open(archive, "r:gz") as handle:
        for member in handle:
            if not member.isfile():
                continue
            name = Path(member.name).name
            if name not in wanted:
                continue
            if name in found:
                raise ValueError(f"duplicate basename {name} in {archive}")
            payload = handle.extractfile(member)
            if payload is None:
                raise ValueError(f"could not extract {member.name} from {archive}")
            found[name] = payload.read()
    missing = wanted - set(found)
    if missing:
        raise ValueError(f"{archive.name} is missing {len(missing)} selected files: {sorted(missing)[:5]}")
    print(f"Verified selected files in {archive.name}: {len(found)}", flush=True)
    return found


def decode_rgb(payload: bytes, name: str) -> np.ndarray:
    with Image.open(io.BytesIO(payload)) as image:
        result = np.asarray(image.convert("RGB")).copy()
    if result.ndim != 3 or result.shape[2] != 3:
        raise ValueError(f"invalid RGB image {name}")
    return result


def decode_mask(payload: bytes, name: str) -> np.ndarray:
    with Image.open(io.BytesIO(payload)) as image:
        result = np.asarray(image)
    if result.ndim == 3:
        if result.shape[2] < 3 or not (
            np.array_equal(result[..., 0], result[..., 1])
            and np.array_equal(result[..., 0], result[..., 2])
        ):
            raise ValueError(f"mask RGB channels differ for {name}")
        result = result[..., 0]
    if result.ndim != 2:
        raise ValueError(f"invalid mask {name}")
    return result


def resize_rgb(array: np.ndarray) -> np.ndarray:
    image = Image.fromarray(array.astype(np.uint8), mode="RGB")
    return np.asarray(image.resize((IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.BICUBIC)).copy()


def resize_mask(array: np.ndarray) -> np.ndarray:
    image = Image.fromarray(array.astype(np.uint8), mode="L")
    return np.asarray(image.resize((IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.NEAREST)) > 127


def save_rgb(path: Path, array: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(array.astype(np.uint8), mode="RGB").save(path, format="PNG", optimize=False)


def save_mask(path: Path, array: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(array.astype(np.uint8) * 255, mode="L").save(path, format="PNG", optimize=False)


def source_ids_by_split() -> dict[str, list[str]]:
    cohorts = {split: load_cohort(path) for split, path in COHORTS.items()}
    overlap = set(cohorts["dev"]) & set(cohorts["test"])
    if overlap:
        raise ValueError(f"official dev and confirmation cohorts overlap: {sorted(overlap)[:5]}")
    return cohorts


def prepare(archives_root: Path, output: Path, *, custom_cohorts: dict[str,list[str]] | None = None) -> list[dict[str, str]]:
    output = output.resolve()
    if output.exists() and any(output.iterdir()):
        raise FileExistsError(f"refusing to overwrite non-empty output directory: {output}")
    archive_manifest = archives_root / "download_manifest.json"
    if not archive_manifest.is_file():
        raise FileNotFoundError("Download has not completed: missing download_manifest.json")
    for archive in ARCHIVES:
        verify(archives_root / archive.local_relative_path, archive)
    print("All five source archives pass pinned size/SHA-256 verification", flush=True)
    output.mkdir(parents=True, exist_ok=True)
    cohort_ids = custom_cohorts if custom_cohorts is not None else source_ids_by_split()
    flattened=[value for values in cohort_ids.values() for value in values]
    if not flattened or len(set(flattened))!=len(flattened) or not all(str(value).isdigit() for value in flattened):
        raise ValueError('Cohorts must have unique numeric source IDs with no split overlap')
    all_ids = set(flattened)
    original_names = {f"{source_id}_orig.png" for source_id in all_ids}
    originals = read_selected(archives_root / ARCHIVE_PATHS["originals"], original_names)

    mask_payloads: dict[str, dict[str, bytes]] = {}
    for condition in FAKE_CONDITIONS:
        mask_archive = str(condition["mask_archive"])
        suffix = str(condition["mask_suffix"])
        wanted = {f"{source_id}{suffix}" for source_id in all_ids}
        if mask_archive in mask_payloads:
            raise AssertionError(f"unexpected repeated mask archive: {mask_archive}")
        mask_payloads[mask_archive] = read_selected(
            archives_root / ARCHIVE_PATHS[mask_archive], wanted
        )

    fake_payloads: dict[str, dict[str, bytes]] = {}
    for condition in FAKE_CONDITIONS:
        condition_id = str(condition["condition"])
        suffix = str(condition["fake_suffix"])
        wanted = {f"{source_id}{suffix}" for source_id in all_ids}
        fake_archive_key = "semantic_fake" if condition["mask_type"] == "segmentation" else "random_fake"
        fake_payloads[condition_id] = read_selected(
            archives_root / ARCHIVE_PATHS[fake_archive_key], wanted
        )

    rows: list[dict[str, str]] = []
    for split, ids in cohort_ids.items():
        for source_id in ids:
            original_name = f"{source_id}_orig.png"
            original = decode_rgb(originals[original_name], original_name)
            source_shape = original.shape
            image_relative = f"assets/{split}/real/{source_id}.png"
            mask_relative = f"assets/{split}/mask/real/{source_id}.png"
            save_rgb(output / image_relative, resize_rgb(original))
            save_mask(output / mask_relative, np.zeros((IMAGE_SIZE, IMAGE_SIZE), dtype=bool))
            rows.append(
                {
                    "sample_id": f"{split}-{source_id}-authentic-control",
                    "source_id": f"tgif2-{source_id}",
                    "split": split,
                    "image": image_relative,
                    "mask": mask_relative,
                    "condition": "authentic_control",
                    "regime": "authentic_control",
                    "generator": "none",
                    "mask_type": "all_negative_control",
                    "image_role": "aligned_original",
                }
            )

            for condition in FAKE_CONDITIONS:
                condition_id = str(condition["condition"])
                mask_type = str(condition["mask_type"])
                fake_name = f"{source_id}{condition['fake_suffix']}"
                raw_fake = decode_rgb(fake_payloads[condition_id][fake_name], fake_name)
                if raw_fake.shape != source_shape:
                    raise ValueError(
                        f"unaligned fake/original for {source_id}/{condition_id}: "
                        f"{raw_fake.shape} != {source_shape}"
                    )

                mask_name = f"{source_id}{condition['mask_suffix']}"
                raw_mask = decode_mask(mask_payloads[str(condition["mask_archive"])][mask_name], mask_name)
                if raw_mask.shape != source_shape[:2]:
                    raise ValueError(f"unaligned mask for {source_id}/{condition_id}")
                changed = np.any(raw_fake != original, axis=2)
                support = raw_mask > 0
                inside_changed = int(np.count_nonzero(changed & support))
                outside_changed = int(np.count_nonzero(changed & ~support))
                inside_rate = inside_changed / max(1, int(support.sum()))
                outside_rate = outside_changed / max(1, int((~support).sum()))
                if inside_changed == 0:
                    raise ValueError(f"no changed pixels inside mask: {source_id}/{condition_id}")
                if mask_type == "segmentation" and outside_changed:
                    raise ValueError(
                        f"semantic mask misses changed pixels: {source_id}/{outside_changed} outside"
                    )
                if mask_type == "random" and inside_rate <= outside_rate:
                    raise ValueError(
                        f"random mask does not localize changes: {source_id}/{condition_id}"
                    )

                prepared_image = resize_rgb(raw_fake)
                prepared_mask = resize_mask(raw_mask)
                image_relative = f"assets/{split}/fake/{condition_id}/{source_id}.png"
                mask_relative = f"assets/{split}/mask/{condition_id}/{source_id}.png"
                save_rgb(output / image_relative, prepared_image)
                save_mask(output / mask_relative, prepared_mask)
                rows.append(
                    {
                        "sample_id": f"{split}-{source_id}-{condition_id}",
                        "source_id": f"tgif2-{source_id}",
                        "split": split,
                        "image": image_relative,
                        "mask": mask_relative,
                        "condition": condition_id,
                        "regime": "partial_edit",
                        "generator": "FLUX.1-dev",
                        "mask_type": mask_type,
                        "image_role": "edited",
                    }
                )

    manifest_path = output / "manifest.csv"
    with manifest_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    archive_manifest = archives_root / "download_manifest.json"
    manifest = {
        "schema_version": 1,
        "phase": "prepare-tgif2-flux1dev-supervised-experiment" if custom_cohorts is not None else "prepare-tgif2-flux1dev-source-disjoint-localization-benchmark",
        "dataset": "TGIF2",
        "official_repository": REPOSITORY,
        "official_repository_commit": REPOSITORY_COMMIT,
        "license": "CC BY-SA 4.0",
        "archive_manifest_sha256": sha256_file(archive_manifest),
        "cohort_sha256": {split:hashlib.sha256(json.dumps(ids).encode()).hexdigest() for split,ids in cohort_ids.items()} if custom_cohorts is not None else {split: sha256_file(path) for split, path in COHORTS.items()},
        "split_source_counts": {split: len(ids) for split, ids in cohort_ids.items()},
        "source_disjoint": True,
        "samples_per_source": {
            "authentic_controls": 1,
            "semantic_flux1dev_edits": 1,
            "random_mask_flux1dev_edits": 1,
        },
        "counts": {
            split: sum(row["split"] == split for row in rows) for split in cohort_ids
        },
        "preprocessing": {
            "image": "Pillow RGB bicubic resize to 448x448, matching upstream benchmark",
            "mask": "provided source mask; nearest resize to 448x448; positive if >127",
            "inference_is_mask_blind": True,
            "validation_masks_used_only_after_inference": True,
        },
        "geometry_checks": [
            "fake/original/mask alignment checked before resize",
            "semantic edits must have no changed pixels outside supplied mask",
            "random-mask edits must have higher changed-pixel rate inside than outside mask",
        ],
        "conditions": [dict(condition) for condition in FAKE_CONDITIONS],
        "not_in_scope": [
            "fully regenerated images",
            "other generators",
            "AI-authorship classification",
            "semantic impossible-scene reasoning",
            "live product integration",
        ],
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest["counts"], indent=2), flush=True)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archives", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.archives.expanduser().resolve(), args.output.expanduser().resolve())


if __name__ == "__main__":
    main()
