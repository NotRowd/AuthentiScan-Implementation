"""Apply the reviewed v3 source update after verifying AWS v2 baselines."""
from pathlib import Path
import hashlib
import shutil

root = Path.home() / 'authentiscan'
staging = Path(__file__).resolve().parent
expected = {
    'visual/evaluate_visual_candidate.py': '075c508336ad8bd8d0cb28ee9cba4e1ea7e7352bdf7047e4f9b631a51ca82425',
    'api/shared/feature-review-contract.mjs': 'd5f212b95ec1d47c5b9002c0e08e497cd829d458dba04368729931334a4b697e',
    'web/shared/feature-review-contract.mjs': 'd5f212b95ec1d47c5b9002c0e08e497cd829d458dba04368729931334a4b697e',
    'web/src/components/common/FeatureReviewPanel.jsx': '9ebdf5408cbadec876f18b187b8224bcf0e7044bfa438320736fc1f0fb4bba0d',
}
for name, digest in expected.items():
    if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
        raise SystemExit(f'Deployed baseline changed: {name}. No changes applied.')
    if not (staging / Path(name).name).is_file():
        raise SystemExit(f'Missing staged source: {name}. No changes applied.')
backup = Path.home() / 'authentiscan-backups/anomaly-v3-20261108'
backup.mkdir(mode=0o700)
for name in expected:
    saved = backup / name
    saved.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / name, saved)
for name in expected:
    shutil.copyfile(staging / Path(name).name, root / name)
print(f'Updated four source targets. Rollback sources: {backup}')
