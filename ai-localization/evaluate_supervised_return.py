"""Kent-only evaluation: never fit a threshold or train using held-out masks."""
import argparse
import csv
import json
from pathlib import Path
import time
import numpy as np
import torch
from supervised_localizer import ARCHITECTURE,CHECKPOINT_SHA,REVISION,FeatureExtractor,MaskHead,sha,relative_file,operating_metrics
from train_supervised_localization import target_for,validate_assets,write_json,seed_everything


def validate_return(data,returned):
    report=json.loads((returned/'validation-report.json').read_text());checkpoint=json.loads((returned/'checkpoint.json').read_text())
    if report['status']!='validation_gate_passed_needs_fresh_test':raise ValueError('Validation did not pass; preserve the untouched test set')
    expected=sha(data/'training-manifest.csv');head=sha(returned/'best-head.pt')
    for metadata in [report,checkpoint]:
        if metadata.get('architecture')!=ARCHITECTURE or metadata.get('head_sha256')!=head or metadata.get('training_manifest_sha256')!=expected:raise ValueError('Returned checkpoint/validation provenance mismatch')
    if checkpoint.get('encoder_sha256')!=CHECKPOINT_SHA or checkpoint.get('encoder_revision')!=REVISION:raise ValueError('Wrong encoder')
    threshold=report['threshold']
    if not isinstance(threshold,(int,float)) or not np.isfinite(threshold) or not .01<=threshold<=.99:raise ValueError('Invalid locked validation threshold')
    groups=report['groups'];controls=groups['authentic_control']
    if controls['images']!=40 or controls['images_with_highlights']/40>.10 or controls['highlighted_area_mean']>.01 or any(groups[c]['images']!=40 or groups[c]['dice']<.50 for c in ('segm_flux1dev','random_flux1dev')):raise ValueError('Validation report fails frozen gate')
    return threshold,head


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ['data','returned','source','checkpoint','output']:parser.add_argument('--'+key,type=Path,required=True)
    parser.add_argument('--device',choices=['cpu','cuda'],default='cpu');args=parser.parse_args()
    threshold,head_sha=validate_return(args.data,args.returned)
    with (args.data/'sealed-test-manifest.csv').open(newline='') as handle:rows=list(csv.DictReader(handle))
    protocol=json.loads((args.data/'protocol.json').read_text())
    expected={'tgif2-'+value for value in protocol['cohorts']['test']}
    old={'tgif2-'+value for split in ('train','validation') for value in protocol['cohorts'][split]}
    if len(rows)!=240 or any(row['split']!='test' for row in rows) or {r['source_id'] for r in rows}!=expected or expected&old:raise ValueError('Held-out split invalid')
    validate_assets(args.data,rows);args.output.mkdir(parents=True,exist_ok=False);seed_everything()
    extractor=FeatureExtractor(args.source,args.checkpoint,args.device);model=MaskHead().to(args.device)
    model.load_state_dict(torch.load(args.returned/'best-head.pt',map_location='cpu',weights_only=True));model.eval()
    probabilities=[];targets=[];started=time.monotonic()
    with torch.inference_mode():
        for index,row in enumerate(rows):
            features=torch.from_numpy(extractor(relative_file(args.data,row['image']).read_bytes()).astype(np.float32)).unsqueeze(0).to(args.device)
            probability=model(features).sigmoid().cpu().numpy()[0,0]
            probabilities.append(probability)
            # Mask is read only after the image-only forward pass, for scoring.
            targets.append(target_for(args.data,row))
            print(f'Test [{index+1}/{len(rows)}] {row["sample_id"]}',flush=True)
    groups=operating_metrics(probabilities,targets,rows,threshold);controls=groups['authentic_control']
    gate=controls['images_with_highlights']/controls['images']<=.10 and controls['highlighted_area_mean']<=.01 and all(groups[c]['dice']>=.50 for c in ('segm_flux1dev','random_flux1dev'))
    result=dict(status='fresh_test_gate_passed_needs_visual_review' if gate else 'fresh_test_gate_failed',release_approved=False,
      architecture=ARCHITECTURE,head_sha256=head_sha,threshold=threshold,threshold_source='returned locked validation report',
      test_threshold_retuned=False,groups=groups,test_images=len(rows),test_sources=len(expected),seconds=time.monotonic()-started,
      scope='FLUX.1-dev partial edits; 32x32 mask predictions, no pixel-exact or broad generator claim.')
    write_json(args.output/'test-report.json',result)
    np.savez_compressed(args.output/'test-predictions.npz',probabilities=np.asarray(probabilities),targets=np.asarray(targets))
    write_json(args.output/'sample-order.json',[r['sample_id'] for r in rows])
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()
