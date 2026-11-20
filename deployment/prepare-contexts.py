"""Create local allowlisted Cloud Build contexts. No network or deployment."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import stat

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "firebase-local"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def checked(path):
    path.relative_to(ROOT)
    for item in (path, *path.parents):
        if item == ROOT:
            break
        if item.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise RuntimeError(f"Refusing linked source: {item.name}")
    if not path.is_file():
        raise RuntimeError(f"Missing source: {path.relative_to(ROOT)}")
    return path


def ignore_rules(names):
    # Deny everything except the exact prepared files, including future additions.
    allowed = set()
    for name in names:
        parts = name.split("/")
        for index in range(1, len(parts)):
            allowed.add("/".join(parts[:index]) + "/")
        allowed.add(name)
    return "**\n" + "".join("!" + name + "\n" for name in sorted(allowed))


def main():
    api_names = ["Dockerfile", "package.json", "package-lock.json",
                 "local-config.mjs", "cloud-config.mjs", "firestore.rules",
                 "media-config.json", "scripts/serve-production-api.mjs",
                 "src/assets/logo.png", "src/utils/analysisPresentation.js"]
    for folder in ("server", "shared"):
        api_names.extend(p.relative_to(WEB).as_posix()
                         for p in sorted((WEB / folder).iterdir())
                         if p.suffix in {".mjs", ".cjs", ".js"})
    classifier_names = [
        "ai-runtime/loyd-v1/requirements-cloud.txt",
        "ai-runtime/loyd-v1/policy.manuscript-60.json",
        "ai-work/2026-10-04/loyd-return-verified/runs/classifier-v1/finetune.keras",
    ]
    classifier_names.extend("ai-runtime/loyd-v1/service/" + name for name in
                            ("__init__.py", "app.py", "gradcam.py", "policy.py", "preprocessing.py"))
    sources = {
        "api": [(WEB / name, name) for name in api_names],
        "classifier": [(ROOT / name, name) for name in classifier_names]
                      + [(ROOT / "ai-runtime/loyd-v1/Dockerfile", "Dockerfile")],
    }
    locked = {entry["path"]: entry["sha256"] for entry in
              json.loads((ROOT / "ai-runtime/current-ai.lock.json").read_text())["files"]}
    secret_pattern = re.compile(rb"-----BEGIN (?:RSA )?PRIVATE KEY-----|(?:sk_(?:live|test)_|whsk_)[A-Za-z0-9]{12,}")
    for items in sources.values():
        for source, _ in items:
            checked(source)
            relative = source.relative_to(ROOT).as_posix()
            if relative in locked and digest(source) != locked[relative]:
                raise RuntimeError(f"AI lock mismatch: {relative}")
            if source.suffix in {".mjs", ".cjs", ".js", ".json", ".py"}:
                if secret_pattern.search(source.read_bytes()):
                    raise RuntimeError(f"Possible embedded secret: {relative}")
    if json.loads((WEB / "media-config.json").read_text()) != {"provider": "cloudinary"}:
        raise RuntimeError("Production context requires the Cloudinary media configuration.")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = ROOT / "deployment" / "prepared" / stamp
    output.mkdir(parents=True, exist_ok=False)
    report = {"created_utc": stamp, "uploaded": False, "contexts": {}}
    for label, items in sources.items():
        context = output / label
        entries = []
        for source, name in items:
            target = context / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            checksum = digest(target)
            if checksum != digest(source):
                raise RuntimeError(f"Copy verification failed: {name}")
            entries.append({"path": name, "bytes": target.stat().st_size, "sha256": checksum})
        names = [entry["path"] for entry in entries] + [".gcloudignore", ".dockerignore"]
        for ignore in (".gcloudignore", ".dockerignore"):
            (context / ignore).write_text(ignore_rules(names), encoding="utf-8")
        report["contexts"][label] = {"files": entries, "total_bytes": sum(e["bytes"] for e in entries)}
    (output / "manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Prepared locally: {output}")
    for label, data in report["contexts"].items():
        print(f"{label}: {len(data['files'])} payload files, {data['total_bytes'] / 1024**2:.2f} MiB")
    print("No upload, cloud build, billing change, or deployment performed.")


if __name__ == "__main__":
    main()
