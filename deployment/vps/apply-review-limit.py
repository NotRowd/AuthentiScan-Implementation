"""Apply the diagnosed finding-limit fix to verified simple-review sources."""
from pathlib import Path
import hashlib
import shutil
root=Path.home()/'authentiscan'
staging=Path(__file__).resolve().parent
expected={
 'visual/evaluate_visual_candidate.py':'46c654d06042b1f2577d896517144458ac2f416d489638b709d08bff015cf96f',
 'api/shared/feature-review-contract.mjs':'78f9fc4746583001175fa8f68b02601bb19a2b497715ee10844b606b9cc43b06',
 'web/shared/feature-review-contract.mjs':'78f9fc4746583001175fa8f68b02601bb19a2b497715ee10844b606b9cc43b06',
}
for name,digest in expected.items():
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:raise SystemExit('Baseline changed; nothing applied.')
 if not (staging/Path(name).name).is_file():raise SystemExit('Missing staged source; nothing applied.')
backup=Path.home()/'authentiscan-backups/simple-review-20261108/finding-limit'
backup.mkdir(mode=0o700)
for name in expected:
 target=backup/name
 target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(root/name,target)
for name in expected:shutil.copyfile(staging/Path(name).name,root/name)
print('Finding limit fix applied with verified backups.')
