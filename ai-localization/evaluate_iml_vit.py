"""Isolated IML-ViT screening; never changes the app or claims a release passed."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'vendor/iml-vit'
REVISION = '07dd2be0f4ea27a5c97c9fa5ffbe236733833eac'
WEIGHTS = SOURCE / 'checkpoints/iml-vit-trufor-20231104.pth'
WEIGHT_HASH = '9fa9ae88cafeb6eab28c2afd5bef74679416cf0a790b2370fa6a6fb4c122c58c'


def load_model():
    import torch
    if subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip() != REVISION:
        raise ValueError('Unexpected upstream revision')
    if subprocess.check_output(['git', '-C', str(SOURCE), 'diff', '--name-only'], text=True).strip():
        raise ValueError('Modified upstream source')
    if hashlib.sha256(WEIGHTS.read_bytes()).hexdigest() != WEIGHT_HASH:
        raise ValueError('Checkpoint hash mismatch')
    sys.path.insert(0, str(SOURCE))
    from iml_vit_model import iml_vit_model
    torch.set_num_threads(4)
    model = iml_vit_model()
    model.load_state_dict(torch.load(WEIGHTS, map_location='cpu', weights_only=True), strict=True)
    return model.eval()


def infer(model, image):
    import numpy as np
    import torch
    import torch.nn.functional as F
    width, height = image.size
    if not (0 < width <= 1024 and 0 < height <= 1024):
        raise ValueError('Screen accepts images up to 1024x1024 without resizing or cropping')
    # Upstream pad pipeline: RGB black padding bottom/right, then ImageNet normalization.
    padded = np.zeros((1024, 1024, 3), dtype=np.uint8)
    padded[:height, :width] = np.asarray(image.convert('RGB'))
    normalized = (padded.astype(np.float32) / 255 - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
    tensor = torch.from_numpy(normalized.transpose(2, 0, 1).copy()).unsqueeze(0)
    start = time.monotonic()
    with torch.inference_mode():
        # Same prediction path as upstream forward, omitting only ground-truth loss computation.
        features = model.featurePyramid_net(model.encoder_net(tensor))
        logits = model.predict_head(list(features.values()))
        scores = torch.sigmoid(F.interpolate(logits, size=(1024,1024), mode='bilinear', align_corners=False))[0,0,:height,:width].numpy()
    if not np.isfinite(scores).all() or scores.min()<0 or scores.max()>1:
        raise ValueError('Invalid model output')
    return scores, time.monotonic()-start


def main():
    import numpy as np
    from PIL import Image
    from localization import pixel_metrics, overlay
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--example', type=Path)
    parser.add_argument('--pilot', action='store_true')
    parser.add_argument('--per-group', type=int, default=2, help='Fixed first N records per group for a bounded smoke screen')
    args=parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    model=load_model()
    records=[]
    data=ROOT/'datasets/opensdi-pilot-v1'
    if args.pilot:
        # Existing development pilot only. Never read the sealed final-test cohort.
        all_records=json.loads((data/'manifest.json').read_text())
        if args.per_group<1: raise ValueError('per-group must be positive')
        counts={}
        for record in all_records:
            group=record['group']
            if counts.get(group,0)<args.per_group:
                records.append(record);counts[group]=counts.get(group,0)+1
    if args.example:
        records=[{'id':'user-example','group':'unknown','image':str(args.example.resolve())}]+records
    if not records: raise ValueError('Choose an example or the development pilot')
    rows=[]
    for item in records:
        row={'id':item['id'], 'group':item['group'], 'generator':item.get('generator')}
        try:
            file=data/item['image']
            digest=hashlib.sha256(file.read_bytes()).hexdigest()
            if item.get('input_sha256',digest)!=digest: raise ValueError('Image hash mismatch')
            with Image.open(file) as source:
                if source.getexif().get(274,1)!=1: raise ValueError('EXIF orientation needs separate review')
                image=source.convert('RGB')
            scores,seconds=infer(model,image)
            folder=args.output/item['id'];folder.mkdir()
            np.savez_compressed(folder/'scores.npz', scores=scores)
            overlay(image,scores,.5).save(folder/'overlay.png')
            row.update(status='ok', input_sha256=digest,seconds=seconds,flagged_fraction=float((scores>=.5).mean()))
            if item.get('truth'):
                truth_file=data/item['truth']
                if hashlib.sha256(truth_file.read_bytes()).hexdigest()!=item['truth_sha256']: raise ValueError('Truth hash mismatch')
                with Image.open(truth_file) as source: truth=np.asarray(source.convert('L'))
                if not np.isin(truth,[0,255]).all(): raise ValueError('Invalid binary truth')
                row['metrics']=pixel_metrics(scores,truth//255,.5)
                if item['group']=='authentic': row['metrics']['dice']=row['metrics']['iou']=None
        except Exception as error:
            row.update(status='failed',error=f'{type(error).__name__}: {error}')
        rows.append(row)
        report={'candidate':'IML-ViT (TruFor-protocol checkpoint)','source_revision':REVISION,'checkpoint_sha256':WEIGHT_HASH,
                'threshold':.5,'release_approved':False,'scope':'Development screening only; no threshold tuning; no ground truth for user example', 'rows':rows}
        groups={}
        for group in sorted({r['group'] for r in rows}):
            selected=[r for r in rows if r['group']==group and r['status']=='ok']
            dice=[r['metrics']['dice'] for r in selected if r.get('metrics',{}).get('dice') is not None]
            groups[group]={'n':len(selected),'mean_dice':float(np.mean(dice)) if dice else None,
                           'mean_flagged_fraction':float(np.mean([r['flagged_fraction'] for r in selected])) if selected else None}
        report['groups']=groups
        (args.output/'results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(row),flush=True)
    print(json.dumps(report['groups']),flush=True)


if __name__=='__main__': main()
