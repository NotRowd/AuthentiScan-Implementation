"""Apply the reviewed tentative-observation update to verified AWS sources."""
from pathlib import Path
import hashlib
import shutil

root = Path.home() / 'authentiscan'
staging = Path(__file__).resolve().parent
expected = {
    'visual/evaluate_visual_candidate.py': 'b5359efc8f8c1110ab50e87ccee8711e5be94e414a6727a63c3f17b1bef3d71e',
    'api/shared/feature-review-contract.mjs': '94b29750440d9eca835dfc58e023fbddd8c9f50af0411c4a6831d9293c2a1064',
    'web/shared/feature-review-contract.mjs': '94b29750440d9eca835dfc58e023fbddd8c9f50af0411c4a6831d9293c2a1064',
    'web/src/components/common/FeatureReviewPanel.jsx': 'b10f52133f3233a5b2cb07e40e886196b6fada035fbe015c76b95651d813f80d',
}
for name, digest in expected.items():
    if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
        raise SystemExit(f'Baseline changed: {name}. Nothing applied.')
    if not (staging / Path(name).name).is_file():
        raise SystemExit(f'Missing staged source: {name}. Nothing applied.')

# These rejected evaluation weights belong only to this task. Keep inputs/logs
# and all production weights. Verify every exact target before deleting any.
eval_root = (Path.home() / 'authentiscan-private-9b-eval-20261108').resolve()
weights = {
    'Qwen3.5-9B-Q4_K_M.gguf': '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8',
    'mmproj-F16.gguf': 'f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f',
}
targets = []
for name, digest in weights.items():
    target = eval_root / name
    if target.is_symlink() or target.resolve().parent != eval_root or not target.is_file():
        raise SystemExit('Unexpected evaluation weight; nothing applied.')
    with target.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != digest:
            raise SystemExit('Evaluation hash mismatch; nothing applied.')
    targets.append(target)
backup = Path.home() / 'authentiscan-backups/tentative-20261108'
backup.mkdir(mode=0o700)
for name in expected:
    saved = backup / name
    saved.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / name, saved)
for target in targets:
    target.unlink()
    print('Removed rejected evaluation weight: ' + target.name)
for name in expected:
    shutil.copyfile(staging / Path(name).name, root / name)
print('Updated four source targets; backups: ' + str(backup))
