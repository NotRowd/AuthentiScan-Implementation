"""Bounded official-asset acquisition for an offline VAAS research comparison."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent / "weights/vaas-v2-base"
VAAS_REV = "bd1b86d2f28f10611badba3f40f1c803e6174fb1"
VIT_REV = "3f49326eb077187dfe1c2a2bb15fbd74e6ab91e3"
SEG_REV = "a775b4f5dcb2179e57006dca0e268281306412ef"
ASSETS = [
    ("OBA-Research/vaas", VAAS_REV, "model/px_model.pth", "px_model.pth", 63204714,
     "ec0d1ea72cfd8ae6f9ae89d13c173c72058380a33107bc3ae61145f7de18206b"),
    ("OBA-Research/vaas", VAAS_REV, "model/config.json", "config.json", 381, None),
    ("OBA-Research/vaas", VAAS_REV, "README.md", "VAAS-model-card.md", 100000, None),
    ("google/vit-base-patch16-224", VIT_REV, "model.safetensors", "vit/model.safetensors", 346293852,
     "1cea07110a4a47edc51420b2dda6f3b8b58e7256e8f44b4ea6aa9696162ccb5d"),
    ("google/vit-base-patch16-224", VIT_REV, "config.json", "vit/config.json", 69665, None),
    ("google/vit-base-patch16-224", VIT_REV, "README.md", "vit/README.md", 100000, None),
    ("nvidia/segformer-b1-finetuned-ade-512-512", SEG_REV, "config.json", "segformer/config.json", 6885, None),
    ("nvidia/segformer-b1-finetuned-ade-512-512", SEG_REV, "README.md", "segformer/README.md", 100000, None),
]


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    ledger = []
    if sum(a[4] for a in ASSETS) > 450_000_000:
        raise ValueError("Acquisition exceeds the 450 MB model-asset cap")
    for repo, revision, remote, local, cap, expected in ASSETS:
        url = f"https://huggingface.co/{repo}/resolve/{revision}/{remote}"
        target = ROOT / local
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            temp = target.with_name(target.name + ".partial")
            offset = temp.stat().st_size if temp.exists() else 0
            if offset > cap:
                raise ValueError(f"Oversized partial: {local}")
            if offset != cap or not expected:
                request = urllib.request.Request(url, headers={"Range": f"bytes={offset}-"} if offset else {})
                # Resume only when the server confirms the exact byte offset.
                with urllib.request.urlopen(request, timeout=60) as response:
                    if offset and (response.status != 206 or not response.headers.get(
                        "Content-Range", "").startswith(f"bytes {offset}-")):
                        raise ValueError("Server did not honor resumable range; partial retained")
                    with temp.open("ab" if offset else "xb") as out:
                        count = offset
                        while chunk := response.read(1024 * 1024):
                            count += len(chunk)
                            if count > cap:
                                raise ValueError(f"Asset exceeds recorded size: {local}")
                            out.write(chunk)
                            out.flush()
                            if count // (20 * 1024 * 1024) != (count-len(chunk)) // (20 * 1024 * 1024):
                                print(f"Downloading {local}: {count}/{cap}", flush=True)
            digest = hashlib.sha256(temp.read_bytes()).hexdigest()
            if expected and digest != expected:
                raise ValueError(f"Checksum mismatch: {local}")
            temp.rename(target)
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        if target.stat().st_size > cap or (expected and digest != expected):
            raise ValueError(f"Existing asset mismatch: {local}")
        ledger.append(dict(file=local, url=url, size=target.stat().st_size, sha256=digest))
        (ROOT / "assets.json").write_text(json.dumps(ledger, indent=2), encoding="utf-8")
        print(f"Verified {local}: {target.stat().st_size} bytes", flush=True)


if __name__ == "__main__":
    main()
