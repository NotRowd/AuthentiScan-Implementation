"""Manual offline evaluation, not part of unit-test discovery; no cloud writes."""
import json
import argparse
import time
from pathlib import Path
from scene_service import SceneModel

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--logo-only',action='store_true');args=parser.parse_args()
    model=SceneModel();results=[]
    paths=[Path(__file__).resolve().parent.parent/'firebase-local/src/assets/logo.png',
        Path('C:/Users/kenta/AppData/Local/Temp/codex-clipboard-451a0fee-d0fd-413a-a175-9c80c40e5c39.jpg'),
        Path(__file__).resolve().parent.parent/'ai-localization/datasets/supervised-localization-v1/assets/validation/real/406129.png']
    for path in paths[:1] if args.logo_only else paths:
        start=time.monotonic();result=model.predict(path.read_bytes())
        record={'example':path.name,'seconds':time.monotonic()-start,'result':result};results.append(record)
        print(json.dumps(record),flush=True)
    folder=Path(__file__).resolve().parent/'runs';folder.mkdir(exist_ok=True)
    (folder/('explanation-v2-logo-final.json' if args.logo_only else 'explanation-v2-review.json')).write_text(json.dumps(results,indent=2),encoding='utf-8')
