"""Apply image-bound graphic context and ordinary-person-difference guards."""
from pathlib import Path
import hashlib
import shutil
root=Path.home()/'authentiscan'
stage=Path(__file__).resolve().parent
expected={
 'api/shared/feature-review-contract.mjs':'f53bf6ea3376755ba971683ccf657c50802145e47f4a43c15cf3c9d5d7cf406e',
 'api/shared/visual-finding-quality.mjs':'93c746e1bfa17967da32bc6b0fac64be9fcc7bc4296ab40bbb2538182f437a49',
 'web/shared/feature-review-contract.mjs':'f53bf6ea3376755ba971683ccf657c50802145e47f4a43c15cf3c9d5d7cf406e',
 'web/shared/visual-finding-quality.mjs':'93c746e1bfa17967da32bc6b0fac64be9fcc7bc4296ab40bbb2538182f437a49',
 'web/shared/visual-review-paragraph.mjs':'f8d42065e68119a8dff197c03bc86b0509148709b0ffea0eb4d7e88f6b2feb3a',
 'web/src/components/common/FeatureReviewPanel.jsx':'8460299f27ccfd32f3dea89f5f569e2f314501aad13735ed1674ab747add8b44',
}
new='web/shared/visual-review-context.mjs'
if (root/new).exists():raise SystemExit('New target exists; nothing applied.')
for name,digest in expected.items():
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:raise SystemExit('Baseline changed; nothing applied: '+name)
for name in [*expected,new]:
 if not (stage/Path(name).name).is_file():raise SystemExit('Missing staged source; nothing applied.')
backup=Path.home()/'authentiscan-backups/context-review-20261108'
backup.mkdir(mode=0o700)
for name in expected:
 target=backup/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,target)
for name in [*expected,new]:shutil.copyfile(stage/Path(name).name,root/name)
print('Context review applied; source backups: '+str(backup))
