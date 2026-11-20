"""Apply reviewed visual-review sources after checking every deployed baseline."""
from pathlib import Path
import hashlib
import shutil

root = Path.home() / 'authentiscan'
staging = Path(__file__).resolve().parent
expected = {
    'visual/qwen_service.py': '4cb370ef8e80c6ec5e7518535d230b960ca515ef215e6f402c2a2c974e87a086',
    'visual/evaluate_visual_candidate.py': 'c7cd1923292bd523a9f3af8d2ede8b300c0d0e3ea38cf12468f64db6a44013ec',
    'api/shared/feature-review-contract.mjs': '26c7231e1b2045c103ef12f31193246afa31d9955d4e5428e0f8787ed5e12b9f',
    'web/shared/feature-review-contract.mjs': '26c7231e1b2045c103ef12f31193246afa31d9955d4e5428e0f8787ed5e12b9f',
    'api/server/feature-review-routes.mjs': 'fc104e23e14507a8f62886a13707809f0862aa63a5d8686599dc210b6f343391',
    'web/src/components/common/SceneExplanationPanel.jsx': 'f4f6429d64ec33f6e1d1d15db2a0669b45adc7e7f9c53eff5e364a4a79aa2570',
    'web/src/components/common/FeatureReviewPanel.jsx': '12b59c314fd4a23272ace16e38d917c7e1def7ed51fd9d81c94c7ee01b6060f1',
}
for name, digest in expected.items():
    if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
        raise SystemExit(f'Deployed baseline changed: {name}. No changes applied.')
    if not (staging / Path(name).name).is_file():
        raise SystemExit(f'Missing staged source: {name}. No changes applied.')
backup = Path.home() / 'authentiscan-backups/anomaly-review-20261108'
backup.mkdir(mode=0o700)
for name in expected:
    saved = backup / name
    saved.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / name, saved)
for name in expected:
    shutil.copyfile(staging / Path(name).name, root / name)
print(f'Applied seven source targets. Rollback sources: {backup}')
