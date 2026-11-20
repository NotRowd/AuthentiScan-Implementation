from pathlib import Path
import hashlib
import shutil
root=Path.home()/'authentiscan'
stage=Path(__file__).resolve().parent
expected={
 'web/src/components/common/LocalizationPanel.jsx':'15485275cc8a0f24d8a0f9c16fa7b93786c06751599e63f4d62bc90ce93e0acd',
 'web/src/services/firebase-api.js':'792272e5cabeba890c33474173c9e45dd04abb947ff6cac454d68c50cbca1a0e',
 'web/src/pages/ScanPage.jsx':'dfec9d6aeaac197e0232b5586d26d39b795b5748b283a7e782740cb69a72c323',
}
for name,digest in expected.items():
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:raise SystemExit('Baseline changed; nothing applied: '+name)
 if not (stage/Path(name).name).is_file():raise SystemExit('Missing source; nothing applied.')
backup=Path.home()/'authentiscan-backups/preview-recovery-20261108'
backup.mkdir(mode=0o700)
for name in expected:
 target=backup/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,target)
for name in expected:shutil.copyfile(stage/Path(name).name,root/name)
print('Preview recovery applied with backups: '+str(backup))
