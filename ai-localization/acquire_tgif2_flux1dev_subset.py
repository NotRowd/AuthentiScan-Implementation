"""Download a bounded, official TGIF2 Flux.1-dev localization subset.

Only the upstream testing archives needed for aligned originals, supplied
segmentation masks, Flux.1-dev semantic splices, and Flux.1-dev random-mask
splices are acquired. The upstream's source-disjoint development and
confirmation cohorts are both selected from these archives. Ground-truth masks
are never passed to inference.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.request import HTTPCookieProcessor, Request, build_opener


BASE_URL = "https://cloud.ilabt.imec.be"
OFFICIAL_REPOSITORY = "https://github.com/IDLabMedia/tgif-dataset"
OFFICIAL_REPOSITORY_COMMIT = "fc5c557bd1a2d49a5dabc3676a54cfc44798f4ea"
LICENSE = "CC BY-SA 4.0"
MAX_DATASET_BYTES = 8_000_000_000
RANGE_BYTES = 8 << 20
READ_BYTES = 256 << 10


class DownloadBudget:
    """Persist actual received bytes, including interrupted attempts."""

    def __init__(self, root: Path, limit: int = MAX_DATASET_BYTES):
        self.path = root / "transfer_ledger.json"
        self.limit = limit
        self.lock = threading.Lock()
        if self.path.exists():
            self.used = int(json.loads(self.path.read_text())["received_bytes"])
        else:
            # Count retained older downloads and reserve 100 MB for earlier probes.
            self.used = 100_000_000 + sum(
                path.stat().st_size for path in root.rglob("*") if path.is_file()
            )

    def reserve(self, size: int) -> None:
        with self.lock:
            if self.used + size > self.limit:
                raise RuntimeError("Actual transfer budget would exceed 8 GB; stopping")
            # Reserve BEFORE the read. A failed read overcounts rather than undercounts.
            self.used += size
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps({"received_bytes": self.used,
                "limit_bytes": self.limit, "accounting": "conservative read reservations"}))
            temporary.replace(self.path)


@dataclass(frozen=True)
class Archive:
    group: str
    share_token: str
    remote_path: str
    expected_bytes: int
    expected_sha256: str

    @property
    def local_relative_path(self) -> str:
        return f"{self.group}/{self.remote_path}"


ARCHIVES = (
    Archive(
        "flux",
        "KG48tLZZzifC5WE",
        "orig-flux/orig-flux_testing.tar.gz",
        671_932_371,
        "5cd3de091fb7b7b0f93d691e2996be8f24e65ff1285f522f0ad35e58ca75b7cb",
    ),
    Archive(
        "tgif",
        "xEeAzrY7ES9KA8o",
        "masks/masks_testing.tar.gz",
        5_272_350,
        "420f010647cd670545db894b02f17deaa1e1fc4ec1a802b5cd9e7a530fc89ce8",
    ),
    Archive(
        "flux",
        "KG48tLZZzifC5WE",
        "flux1dev-sp/flux1dev-sp_testing.tar.gz",
        2_035_703_844,
        "cfa6c1b8caa1c0e098a9ce7664c2b1a0dbb83c19512d788d00c3bd896090ed69",
    ),
    Archive(
        "random",
        "GDGewtTFcHccaNj",
        "masks-flux/masks-flux_testing.tar.gz",
        101_732,
        "2e35fb6d4dfdf14b60de19853e34c4f7fdef1fa56b28e5de1acbdc1ca9e6256e",
    ),
    Archive(
        "random",
        "GDGewtTFcHccaNj",
        "flux1dev-sp/flux1dev-sp_testing.tar.gz",
        1_018_290_375,
        "6025f6a0d5d004f943eb343fea058e3af9c7ac03eec1928242b74627da1992df",
    ),
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify(path: Path, archive: Archive) -> None:
    size = path.stat().st_size
    if size != archive.expected_bytes:
        raise RuntimeError(f"wrong archive size for {archive.remote_path}: {size}")
    digest = sha256_file(path)
    if digest != archive.expected_sha256:
        raise RuntimeError(
            f"SHA-256 mismatch for {archive.remote_path}: {digest} != {archive.expected_sha256}"
        )


def public_session(token: str):
    opener = build_opener(HTTPCookieProcessor(CookieJar()))
    page = opener.open(f"{BASE_URL}/index.php/s/{token}", timeout=60).read().decode("utf-8")
    match = re.search(r'<head data-requesttoken="([^"]+)"', page)
    if not match:
        raise RuntimeError(f"could not obtain public-share request token for {token}")
    return opener, html.unescape(match.group(1))


def download(archive: Archive, root: Path, opener, request_token: str,
             budget: DownloadBudget | None = None) -> Path:
    output = root / archive.local_relative_path
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.is_file():
        verify(output, archive)
        return output

    partial = output.with_suffix(output.suffix + ".part")
    offset = partial.stat().st_size if partial.exists() else 0
    if offset > archive.expected_bytes:
        raise RuntimeError(f"partial archive exceeds expected size: {partial}")
    url = f"{BASE_URL}/public.php/dav/files/{archive.share_token}/{archive.remote_path}"
    failures = 0
    print(f"Starting {archive.group}/{archive.remote_path} at {offset:,} bytes", flush=True)
    while offset < archive.expected_bytes:
        end = min(archive.expected_bytes - 1, offset + RANGE_BYTES - 1)
        expected_range_length = end - offset + 1
        headers = {
            "X-Requested-With": "XMLHttpRequest",
            "requesttoken": request_token,
            "Range": f"bytes={offset}-{end}",
        }
        copied = 0
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                request = Request(url, headers=headers)
                with opener.open(request, timeout=45) as response:
                    status = int(getattr(response, "status", response.getcode()))
                    content_range = response.headers.get("Content-Range", "")
                    expected_content_range = (
                        f"bytes {offset}-{end}/{archive.expected_bytes}"
                    )
                    if status != 206 or content_range != expected_content_range:
                        raise RuntimeError(
                            f"unexpected range response for {archive.remote_path}: "
                            f"status={status}, Content-Range={content_range!r}"
                        )
                    mode = "ab" if offset else "wb"
                    with partial.open(mode) as target:
                        remaining = end - offset + 1
                        while remaining:
                            read_size = min(READ_BYTES, remaining)
                            if budget:
                                budget.reserve(read_size)
                            block = response.read(read_size)
                            if not block:
                                raise RuntimeError(
                                    f"short range response for {archive.remote_path}: "
                                    f"received {copied} of {end - offset + 1} bytes"
                                )
                            target.write(block)
                            copied += len(block)
                            remaining -= len(block)
                        target.flush()
                last_error = None
                break
            except Exception as exc:  # retry network interruptions; retain verified prefix
                last_error = exc
                failures += 1
                current_size = partial.stat().st_size if partial.exists() else 0
                if current_size != offset:
                    if not offset < current_size <= end + 1:
                        raise RuntimeError("Unexpected partial file length") from exc
                    print(f"Interrupted range; retaining {current_size:,} bytes: {exc}", flush=True)
                    break
                if attempt < 3:
                    print(
                        f"Retry {attempt}/3 for {archive.remote_path} at byte {offset}: {exc}",
                        flush=True,
                    )
                    time.sleep(attempt * 2)
        if last_error is not None:
            if failures >= 10 or "budget" in str(last_error).lower():
                raise RuntimeError(f"could not download {archive.remote_path}") from last_error
            offset = partial.stat().st_size if partial.exists() else 0
            time.sleep(2)
            continue
        new_offset = partial.stat().st_size
        if new_offset > archive.expected_bytes:
            raise RuntimeError(f"download exceeded expected size for {archive.remote_path}")
        if new_offset - offset != expected_range_length or copied != expected_range_length:
            raise RuntimeError(
                f"range byte count mismatch for {archive.remote_path}: "
                f"saved={new_offset - offset}, received={copied}, "
                f"expected={expected_range_length}"
            )
        offset = new_offset
        print(f"Downloading {archive.group}/{archive.remote_path}: "
              f"{offset:,}/{archive.expected_bytes:,} bytes", flush=True)

    verify(partial, archive)
    partial.replace(output)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    total = sum(row.expected_bytes for row in ARCHIVES)
    if total > MAX_DATASET_BYTES:
        raise RuntimeError(f"archive set exceeds the hard {MAX_DATASET_BYTES}-byte cap")
    root = args.output.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    records = []
    started = time.time()
    budget = DownloadBudget(root)

    def acquire(archive):
        opener, request_token = public_session(archive.share_token)
        path = download(archive, root, opener, request_token, budget)
        print(f"Verified {archive.group}/{archive.remote_path}", flush=True)
        return {**asdict(archive), "path": path.relative_to(root).as_posix(),
                "sha256": archive.expected_sha256}

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(acquire, archive) for archive in ARCHIVES]
        for future in as_completed(futures):
            records.append(future.result())

    manifest = {
        "schema_version": 1,
        "dataset": "TGIF2",
        "official_repository": OFFICIAL_REPOSITORY,
        "official_repository_commit": OFFICIAL_REPOSITORY_COMMIT,
        "license": LICENSE,
        "scope": "Flux.1-dev semantic and random-mask testing archives only",
        "hard_download_cap_bytes": MAX_DATASET_BYTES,
        "expected_download_bytes": total,
        "conservative_received_bytes": budget.used,
        "downloaded_archives": records,
        "elapsed_seconds": round(time.time() - started, 3),
    }
    (root / "download_manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({"expected_download_bytes": total, "license": LICENSE}, indent=2))


if __name__ == "__main__":
    main()
