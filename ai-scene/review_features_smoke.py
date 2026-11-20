"""Offline runtime probe. Does not validate visual accuracy or write user scans."""
import json
import time
import argparse
from pathlib import Path
from scene_service import SceneModel
from feature_review import FeatureReviewer
import feature_review

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--image',type=Path);parser.add_argument('--trace',action='store_true')
    parser.add_argument('--candidate-prompt',action='store_true');args=parser.parse_args()
    if args.candidate_prompt:
        feature_review.PROMPT=('Look at {subject}. What visible inconsistency can you identify? '
            'Answer "UNABLE | unclear" when unclear or not visible, or "NONE | no clear inconsistency" when none. '
            'Otherwise answer "CONCERN |" followed by one sentence describing what and where. Do not guess how the image was made.')
    image=args.image or Path(__file__).resolve().parent.parent/'firebase-local/src/assets/logo.png'
    payload=image.read_bytes()
    model=SceneModel()
    answers=[]
    if args.trace:
        describe=model.describe
        def traced(*values):
            answer=describe(*values);answers.append(answer);print(json.dumps({'raw_answer':answer}),flush=True);return answer
        model.describe=traced
    start=time.monotonic()
    result=FeatureReviewer(model).predict(payload)
    record={'example':image.name,'seconds':time.monotonic()-start,'result':result,'accuracy_validated':False,'candidate_prompt':args.candidate_prompt}
    if args.trace:record['raw_answers']=answers
    folder=Path(__file__).resolve().parent/'runs';folder.mkdir(exist_ok=True)
    filename='feature-review-candidate-smoke.json' if args.candidate_prompt else ('feature-review-v1-scene-smoke.json' if args.image else 'feature-review-v1-smoke.json')
    (folder/filename).write_text(json.dumps(record,indent=2),encoding='utf-8')
    print(json.dumps(record),flush=True)
