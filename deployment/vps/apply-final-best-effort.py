"""Finalize the explicitly accepted best-effort UI, preserving model/contracts."""
from pathlib import Path
import hashlib
import shutil
root=Path.home()/'authentiscan'
stage=Path(__file__).resolve().parent
expected={
 'web/shared/visual-review-paragraph.mjs':'95f8768a031d91fade0c5a3c7d0e257f3dd912e2457929c158d4f761351013cc',
 'web/src/components/common/FeatureReviewPanel.jsx':'acc6323460e20ea6b0a8ac00519eb912a09ea51edf6d181ade79a77305089f4a',
}
for name,digest in expected.items():
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:raise SystemExit('Baseline changed; nothing applied: '+name)
 if not (stage/Path(name).name).is_file():raise SystemExit('Missing staged source; nothing applied.')
backup=Path.home()/'authentiscan-backups/final-best-effort-20261108'
backup.mkdir(mode=0o700)
for name in expected:
 target=backup/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,target)
for name in expected:shutil.copyfile(stage/Path(name).name,root/name)
print('Final best-effort UI applied with rollback sources: '+str(backup))
