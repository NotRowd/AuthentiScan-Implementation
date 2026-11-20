"""Apply the approved simple review to hash-verified AWS sources with backups."""
from pathlib import Path
import hashlib
import shutil

root=Path.home()/'authentiscan'
staging=Path(__file__).resolve().parent
expected={
 'visual/evaluate_visual_candidate.py':'2d38866e9621eca413940146fe2c39f56df8e965aa9a0a0f092e1918e66f001b',
 'visual/qwen_service.py':'d90414ee9cd320806d15d7170b5bf013505c18aa4ec549ef48cc5a06a0cc762c',
 'api/shared/feature-review-contract.mjs':'0203641525f60e02539c11bf149706cc7b8c30968b7a9ce6b6fd51581a8fd6c0',
 'web/shared/feature-review-contract.mjs':'0203641525f60e02539c11bf149706cc7b8c30968b7a9ce6b6fd51581a8fd6c0',
 'web/src/components/common/FeatureReviewPanel.jsx':'b766baf9cbe36ccab61c6fc284c6d91cc8daeb5478f3903c7cddb911662717fe',
}
for name,digest in expected.items():
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:
  raise SystemExit('Baseline changed; no changes applied: '+name)
for name in ('evaluate_visual_candidate.py','feature-review-contract.mjs','FeatureReviewPanel.jsx','visual-review-paragraph.mjs'):
 if not (staging/name).is_file():raise SystemExit('Missing staged source; nothing applied.')
new=root/'web/shared/visual-review-paragraph.mjs'
if new.exists():raise SystemExit('New target already exists; nothing applied.')
worker=(root/'visual/qwen_service.py').read_text()
before="except ValueError as error:\n                raise VisualInvalidResponse"
after="except ValueError as error:\n                diagnostic = 'incomplete_generation' if str(error) == 'Visual review generation did not finish' else 'invalid_review_fields'\n                print('Visual review rejected: ' + diagnostic, flush=True)\n                raise VisualInvalidResponse"
if worker.count(before)!=1 or worker.count('findings=findings, changes_verdict=False')!=1:
 raise SystemExit('Worker patch target mismatch; nothing applied.')
worker=worker.replace(before,after).replace('findings=findings, changes_verdict=False',"findings=findings, image_type=result['image_type'], changes_verdict=False")
backup=Path.home()/'authentiscan-backups/simple-review-20261108'
backup.mkdir(mode=0o700)
for name in expected:
 target=backup/name
 target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(root/name,target)
for name in expected:
 if name=='visual/qwen_service.py':(root/name).write_text(worker)
 else:shutil.copyfile(staging/Path(name).name,root/name)
shutil.copyfile(staging/'visual-review-paragraph.mjs',new)
print('Simple review applied. Backups: '+str(backup))
