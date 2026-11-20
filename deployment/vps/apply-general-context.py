"""Broaden context wording and content-type fallbacks; preserve model/contracts."""
from pathlib import Path
import hashlib
import shutil
root=Path.home()/'authentiscan'
stage=Path(__file__).resolve().parent
expected={
 'web/shared/visual-review-context.mjs':'c1d5480dc922692fb63754f447f040750fc55cf2fa23242cf4280566c624ad5a',
 'web/shared/visual-review-paragraph.mjs':'9cf77aa6a9d339abe3f26bcf52504977d3b46ffe693c2257e2a8132a148d3ea4',
}
for name,digest in expected.items():
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:raise SystemExit('Baseline changed; nothing applied: '+name)
 if not (stage/Path(name).name).is_file():raise SystemExit('Missing staged source; nothing applied.')
backup=Path.home()/'authentiscan-backups/general-context-20261108'
backup.mkdir(mode=0o700)
for name in expected:
 target=backup/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,target)
for name in expected:shutil.copyfile(stage/Path(name).name,root/name)
print('General context applied. Backups: '+str(backup))
