"""Continue an already-running download through isolated, offline evaluation.

Never changes the live service. --download owns the download stage; otherwise
waits for an existing downloader. Each run
uses its own new directory; interruption does not overwrite earlier artifacts.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
ARCHIVES = ROOT / "datasets/tgif2-flux1dev-archives-v1"
VENDOR = ROOT / "vendor/trail-image-edit-localization"
CHECKPOINT = ROOT / "weights/hub/checkpoints/dinov2_vits14_pretrain.pth"
CHECKSUM = "b938bf1bc15cd2ec0feacfe3a1bb553fe8ea9ca46a7e1d8d00217f29aef60cd9"


def write_status(root: Path, stage: str, **details) -> None:
    value = dict(stage=stage, updated_at=datetime.now(timezone.utc).isoformat(),
                 pid=os.getpid(), production_changed=False, **details)
    temporary = root / "status.tmp"
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(root / "status.json")
    print(json.dumps(value), flush=True)


def execute(root: Path, stage: str, arguments: list[str], env: dict) -> None:
    write_status(root, stage, command=arguments)
    with (root / f"{stage}.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen([sys.executable, "-u", *arguments], cwd=ROOT.parent,
                                   env=env, stdout=log, stderr=subprocess.STDOUT)
        write_status(root, stage, child_pid=process.pid, log=f"{stage}.log")
        code = process.wait()
    if code:
        raise RuntimeError(f"{stage} failed (exit {code}); inspect {stage}.log")


def wait_for_download(root: Path, timeout_hours: float) -> None:
    deadline = time.monotonic() + timeout_hours * 3600
    last_progress = time.monotonic()
    previous_bytes = -1
    while not (ARCHIVES / "download_manifest.json").is_file():
        received = sum(p.stat().st_size for p in ARCHIVES.rglob("*.gz*"))
        if received != previous_bytes:
            previous_bytes = received
            last_progress = time.monotonic()
            write_status(root, "waiting_for_download", retained_archive_bytes=received,
                         expected_archive_bytes=3_731_300_672)
        if time.monotonic() - last_progress > 30 * 60:
            raise RuntimeError("No archive growth for 30 minutes; downloader may have stopped")
        if time.monotonic() >= deadline:
            raise TimeoutError("Download wait limit reached; partial archives remain resumable")
        time.sleep(15)


def pipeline(root: Path, timeout_hours: float, download: bool = False) -> None:
    # Fail before waiting if the already-cached checkpoint was changed/missing.
    digest = hashlib.sha256()
    with CHECKPOINT.open("rb") as handle:
        for block in iter(lambda: handle.read(8 << 20), b""):
            digest.update(block)
    if digest.hexdigest() != CHECKSUM:
        raise ValueError("Cached checkpoint checksum mismatch")
    cache_source = ROOT / "weights/hub/facebookresearch_dinov2_7764ea0f912e53c92e82eb78a2a1631e92725fc8"
    if not (cache_source / "hubconf.py").is_file():
        raise FileNotFoundError("Pinned DINOv2 source is not cached; refusing implicit download")
    env = {**os.environ, "PYTHONPATH": str(VENDOR / "src"),
           "TORCH_HOME": str(ROOT / "weights"), "PYTHONUNBUFFERED": "1",
           "OMP_NUM_THREADS": "2", "MKL_NUM_THREADS": "2"}
    execute(root, "preflight", ["-m", "trail.cli", "self-test"], env)
    if download:
        execute(root, "download", [str(ROOT / "acquire_tgif2_flux1dev_subset.py"),
                "--output", str(ARCHIVES)], env)
    else:
        wait_for_download(root, timeout_hours)
    prepared, run, evaluation = root / "prepared", root / "inference", root / "evaluation"
    execute(root, "prepare", [str(ROOT / "prepare_tgif2_flux1dev_subset.py"),
        "--archives", str(ARCHIVES), "--output", str(prepared)], env)
    execute(root, "infer", ["-m", "trail.cli", "infer", "--manifest", str(prepared / "manifest.csv"),
        "--data-root", str(prepared), "--models", str(VENDOR / "configs/models.json"),
        "--model", "dinov2_vits14", "--layers", "11", "--family", "haar", "--strength", "0.2",
        "--application", "global", "--replicates", "1", "--splits", "dev,test",
        "--device", "cpu", "--pair-batch", "1", "--offline", "--output", str(run)], env)
    execute(root, "evaluate", ["-m", "trail.cli", "evaluate", "--manifest", str(prepared / "manifest.csv"),
        "--data-root", str(prepared), "--run-dir", str(run), "--layer", "11",
        "--fit-splits", "dev", "--output", str(evaluation)], env)
    execute(root, "summarize", [str(ROOT / "summarize_tgif2_flux1dev_subset.py"),
        "--evaluation", str(evaluation), "--manifest", str(prepared / "manifest.csv"),
        "--data-root", str(prepared), "--run-dir", str(run), "--output", str(root / "results.json")], env)
    write_status(root, "evaluation_complete_needs_review", report="results.json",
                 release_approved=False,
                 note="Narrow FLUX.1-dev research evaluation only; not production certification")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--download-wait-hours", type=float, default=24)
    parser.add_argument("--download", action="store_true",
                        help="Own/resume the download before evaluation; do not use if another downloader is running")
    args = parser.parse_args()
    if not 0 < args.download_wait_hours <= 24:
        parser.error("download wait must be between 0 and 24 hours")
    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=False)
    try:
        pipeline(root, args.download_wait_hours, download=args.download)
    except Exception as exc:
        write_status(root, "failed", error=f"{type(exc).__name__}: {exc}")
        raise


if __name__ == "__main__":
    main()
