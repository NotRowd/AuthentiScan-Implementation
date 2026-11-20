"""Acquire a bounded, deterministic academic OpenSDI pilot (not training data).

Provider: nebula/OpenSDI_test, CC BY-SA 4.0, academic use.
Wang, Huang & Hong, OpenSDI, CVPR 2025.
"""
import hashlib
import io
import json
import random
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "datasets/opensdi-pilot-v1"
REV = "7e233eaf98fcfee4c74c788f0e34d06feb7ad0df"
LIMIT = 200_000_000  # All responses including metadata; fail closed.
used = 0


def fetch(url, cap=8_000_000):
    global used
    request = urllib.request.Request(url, headers={"User-Agent": "AuthentiScan-academic-pilot/1"})
    for attempt in range(8):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                body = response.read(min(cap, LIMIT - used) + 1)
            break
        except urllib.error.HTTPError as error:
            if error.code not in (429, 502, 503, 504) or attempt == 7:
                raise
            delay = max(10, int(error.headers.get("Retry-After", "60")))
            print(f"Provider rate limit/temporary error; retry in {delay}s", flush=True)
            time.sleep(delay)
    used += len(body)
    if len(body) > cap or used > LIMIT:
        raise ValueError("Download budget exceeded")
    (OUT / "download-ledger.json").write_text(json.dumps({"accounted_bytes": used}))
    time.sleep(1)
    return body


def digest(body):
    return hashlib.sha256(body).hexdigest()


def prepare():
    global used
    OUT.mkdir(parents=True, exist_ok=True)
    ledger = OUT / "download-ledger.json"
    used = json.loads(ledger.read_text())["accounted_bytes"] if ledger.exists() else 10_000_000
    card = fetch("https://huggingface.co/datasets/nebula/OpenSDI_test/raw/" + REV + "/README.md")
    (OUT / "UPSTREAM-README.md").write_bytes(card)
    records = json.loads((OUT / "manifest.json").read_text()) if (OUT / "manifest.json").exists() else []
    completed = {r["id"] for r in records}
    for record in records:
        for key, hashkey in [("image", "input_sha256"), ("truth", "truth_sha256")]:
            if digest((OUT / record[key]).read_bytes()) != record[hashkey]:
                raise ValueError("Existing record changed; cannot resume")
    # Fixed random positions, chosen before seeing images or model predictions.
    positions = sorted(random.Random(20261009).sample(range(5000), 4))
    plan = {"revision": REV, "positions_per_group": positions,
            "generators": ["sd15", "sd2", "sdxl", "sd3", "flux"],
            "groups": {"full": 0, "authentic": 5000, "partial": 10000},
            "longest_edge": 384, "evaluation": "exploratory_pilot_not_release_validation",
            "max_download_bytes": LIMIT, "threshold": 0.5,
            "source": "https://huggingface.co/datasets/nebula/OpenSDI_test",
            "license": "CC-BY-SA-4.0; academic use; retain upstream attribution",
            "attribution": "Wang, Huang and Hong. OpenSDI. CVPR 2025.",
            "limitations": ["Dataset-viewer cached images may differ from original encoded files",
                            "Only four images per generator/group", "Reduced resolution",
                            "Not for threshold tuning or training", "No production approval"]}
    (OUT / "plan.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")
    for generator in plan["generators"]:
        for group, base in plan["groups"].items():
            for position in positions:
                identifier = f"{generator}-{group}-{position}"
                if identifier in completed:
                    continue
                query = urllib.parse.urlencode({"dataset": "nebula/OpenSDI_test", "config": "default",
                                                "split": generator, "offset": base + position, "length": 1})
                payload = json.loads(fetch("https://datasets-server.huggingface.co/rows?" + query))
                row = payload["rows"][0]["row"]
                expected = ("partial/" if group == "partial" else "entire/") + generator
                bare_sd15 = generator == "sd15" and group != "partial" and "/" not in row["key"] and row["mask"] is None
                if not (row["key"].startswith(expected + "/") or bare_sd15) or row["label"] != (0 if group == "authentic" else 1):
                    raise ValueError("Unexpected dataset order/labels; stop rather than silently resample")
                if REV not in row["image"]["src"]:
                    raise ValueError("Dataset viewer revision differs from frozen revision")
                image_bytes = fetch(row["image"]["src"])
                with Image.open(io.BytesIO(image_bytes)) as image_source:
                    if image_source.getexif().get(274, 1) != 1:
                        raise ValueError("Non-upright input needs explicit image/mask alignment review")
                    image = ImageOps.exif_transpose(image_source).convert("RGB")
                original_size = image.size
                mask_bytes = None
                if group == "partial":
                    if row["mask"] is None or REV not in row["mask"]["src"]:
                        raise ValueError("Missing aligned mask")
                    mask_bytes = fetch(row["mask"]["src"])
                    with Image.open(io.BytesIO(mask_bytes)) as mask_source:
                        mask = mask_source.convert("L")
                    if mask.size != original_size:
                        raise ValueError("Mask dimensions differ")
                    mask = Image.fromarray((np.asarray(mask) > 127).astype(np.uint8) * 255)
                    if len(np.unique(np.asarray(mask))) != 2:
                        raise ValueError("Expected nontrivial partial edit mask")
                else:
                    mask = Image.new("L", image.size, 0 if group == "authentic" else 255)
                scale = min(1, 384 / max(image.size))
                size = tuple(max(32, round(x * scale)) for x in image.size)
                image = image.resize(size, Image.Resampling.LANCZOS)
                mask = mask.resize(size, Image.Resampling.NEAREST)
                item = OUT / identifier
                item.mkdir()
                image.save(item / "input.png")
                mask.save(item / "truth.png")
                record = {"id": identifier, "generator": generator, "group": group,
                          "key": row["key"], "row_index": base + position,
                          "source_family": Path(row["key"]).stem,
                          "original_size": list(original_size), "prepared_size": list(size),
                          "viewer_image_sha256": digest(image_bytes),
                          "viewer_mask_sha256": digest(mask_bytes) if mask_bytes else None,
                          "input_sha256": digest((item / "input.png").read_bytes()),
                          "truth_sha256": digest((item / "truth.png").read_bytes()),
                          "mask_semantics": "white=edited; black=untouched",
                          "image": f"{identifier}/input.png", "truth": f"{identifier}/truth.png"}
                records.append(record)
                (OUT / "manifest.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
                print(f"Prepared {len(records)}/60: {identifier}; budget accounted {used / 1e6:.1f} MB", flush=True)
    (OUT / "acquisition.json").write_text(json.dumps({"accounted_download_bytes": used,
        "includes_initial_10mb_retry_reserve": True, "count": len(records)}, indent=2))


if __name__ == "__main__":
    prepare()
