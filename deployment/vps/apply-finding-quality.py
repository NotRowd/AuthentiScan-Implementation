"""Deploy text-quality guards without changing review schema/model versions."""
from pathlib import Path
import hashlib
import shutil
root=Path.home()/'authentiscan'
staging=Path(__file__).resolve().parent
expected={
 'api/shared/feature-review-contract.mjs':'ae7ab666bde824fa39cca09ee9b6ae5017294c9336dfff0bacb8fc0a0bfeb316',
 'web/shared/feature-review-contract.mjs':'ae7ab666bde824fa39cca09ee9b6ae5017294c9336dfff0bacb8fc0a0bfeb316',
 'web/shared/visual-review-paragraph.mjs':'d7f052cc7b3e0bd15ee0997fd887bd7b3c6fbb52b3d730f9c82b940fef576a4f',
}
for name,digest in expected.items():
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:raise SystemExit('Baseline changed; nothing applied: '+name)
for name in ('feature-review-contract.mjs','visual-review-paragraph.mjs','visual-finding-quality.mjs'):
 if not (staging/name).is_file():raise SystemExit('Missing staged source; nothing applied.')
new=['api/shared/visual-finding-quality.mjs','web/shared/visual-finding-quality.mjs']
if any((root/name).exists() for name in new):raise SystemExit('New target exists; nothing applied.')
backup=Path.home()/'authentiscan-backups/finding-quality-20261108'
backup.mkdir(mode=0o700)
for name in expected:
 target=backup/name
 target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(root/name,target)
for name in [*expected,*new]:shutil.copyfile(staging/Path(name).name,root/name)
print('API/browser quality guards applied with backups: '+str(backup))
