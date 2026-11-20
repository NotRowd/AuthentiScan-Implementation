"""Recompute the fixed input-only comparison without running FUSED."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile
import numpy as np
from PIL import Image
from evaluate_fused_candidate import ROOT, DATA, SOFAKE, selected_rows, digest, metrics


def audit(archive, output):
    rows=selected_rows()
    expected={'LAUNCHER.json','results/RESULT.json','stdout.log','stderr.log'}
    expected.update('results/'+r['sample_id']+ext for r in rows for ext in ('.npz','.png'))
    baseline_dir=ROOT/'runs/loyd-fused-return-v2-2026-10-26'
    baseline_report=json.loads((baseline_dir/'results/RESULT.json').read_text())
    with zipfile.ZipFile(ROOT/'handoff/AuthentiScan-FUSED-Direct-Source-Loyd-v1.zip') as package:
        release=package.read('RELEASE.json')
        inputs=json.loads(package.read('INPUTS.json'))
        baseline_hashes=json.loads(package.read('BASELINE-SHA256.json'))
        for name,value in baseline_hashes.items(): assert digest(baseline_dir/name)==value
        for sample,item in inputs.items():
            assert hashlib.sha256(package.read('images/'+sample+'.png')).hexdigest()==item['native_sha256']
    with zipfile.ZipFile(archive) as z:
        assert len(z.namelist())==len(set(z.namelist()))
        assert set(z.namelist())==expected|{'SHA256.json'}
        assert sum(i.file_size for i in z.infolist())<200*1024**2
        hashes=json.loads(z.read('SHA256.json'))
        assert set(hashes)==expected
        payload={n:z.read(n) for n in expected}
        for name,value in payload.items(): assert hashlib.sha256(value).hexdigest()==hashes[name]
        launcher=json.loads(payload['LAUNCHER.json'])
        report=json.loads(payload['results/RESULT.json'])
        assert launcher['release_sha256']==hashlib.sha256(release).hexdigest()
        assert launcher['completed'] is True and launcher['exit_code']==0
        assert launcher['release_approved'] is False and report['release_approved'] is False
        assert report['stage']=='development_screen_complete' and report['threshold']==.5
        assert report['checkpoint']=='sofake' and report['protocol']=='direct-source-input-v1'
        assert report['runtime']==baseline_report['runtime']
        assert report['runtime']['checkpoint_sha256']==SOFAKE[2]
        assert len(report['rows'])==9 and {r['sample_id'] for r in report['rows']}=={r['sample_id'] for r in rows}
        measured=[]
        for row in rows:
            sample=row['sample_id']; item=inputs[sample]
            stored=next(r for r in report['rows'] if r['sample_id']==sample)
            assert stored['condition']==row['condition']
            for key,value in item.items(): assert stored[key]==value
            assert digest(DATA/row['image'])==item['prepared_image_sha256']
            assert digest(DATA/row['mask'])==item['mask_sha256']
            with Image.open(DATA/row['mask']) as im: truth=np.asarray(im.convert('L'))
            with Image.open(DATA/row['image']) as im: display=np.asarray(im.convert('RGB')).astype(np.float32)
            with np.load(io.BytesIO(payload['results/'+sample+'.npz']),allow_pickle=False) as new, np.load(baseline_dir/'results'/(sample+'.npz'),allow_pickle=False) as old:
                assert set(new.files)=={'scores','native_scores','truth','upstream_scores'}
                assert np.array_equal(new['truth'],truth) and np.array_equal(old['truth'],truth)
                native=new['native_scores']
                assert native.shape==(512,512) and np.isfinite(native).all() and native.min()>=0 and native.max()<=1
                upstream=np.asarray(Image.fromarray((native*255).astype(np.uint8)).resize((448,448),Image.Resampling.BILINEAR)).astype(np.float32)/255
                assert np.array_equal(upstream,new['upstream_scores'])
                current=metrics(new['scores'],truth//255); before=metrics(old['scores'],truth//255)
                author=metrics(upstream,truth//255)
                for actual, recorded in ((current,stored),(before,stored['baseline']),(author,stored['upstream_postprocess'])):
                    for key,value in actual.items():
                        assert recorded[key] is None if value is None else np.isclose(value,recorded[key],atol=1e-9,rtol=0)
                disagreement=float(np.mean((new['scores']>=.5)!=(old['scores']>=.5)))
                assert np.isclose(disagreement,stored['mask_disagreement'],atol=1e-9,rtol=0)
                alpha=(new['scores']>=.5)[...,None]*.45
                expected_overlay=(display*(1-alpha)+np.array([255,50,140])*alpha).astype(np.uint8)
                with Image.open(io.BytesIO(payload['results/'+sample+'.png'])) as im:
                    assert np.array_equal(np.asarray(im.convert('RGB')),expected_overlay)
                measured.append(dict(sample_id=sample,condition=row['condition'],baseline=before,direct=current,upstream=author))
        groups={}
        for condition in sorted({r['condition'] for r in measured}):
            group=[r for r in measured if r['condition']==condition]
            groups[condition]={}
            for variant in ('baseline','direct','upstream'):
                values=[r[variant] for r in group]
                dice=[r['dice'] for r in values if r['dice'] is not None]
                groups[condition][variant]=dict(images=len(values),mean_dice=float(np.mean(dice)) if dice else None,
                    images_highlighted=sum(r['highlighted_fraction']>0 for r in values),
                    mean_highlighted_fraction=float(np.mean([r['highlighted_fraction'] for r in values])))
        g=groups
        passed=(g['segm_flux1dev']['direct']['mean_dice']>=.5 and g['random_flux1dev']['direct']['mean_dice']>=.5
                and g['authentic_control']['direct']['images_highlighted']==0 and g['authentic_control']['direct']['mean_highlighted_fraction']<=.01)
        result=dict(archive_sha256=digest(archive),payloads_verified=22,release_identity_verified=True,
            runtime_and_checkpoint_unchanged=True,targets_unchanged=True,metrics_recomputed=True,overlays_verified=True,
            scope='Nine development images from three source families; no population accuracy claim',
            screen_passed=passed,release_approved=False,total_forward_seconds=sum(r['seconds'] for r in report['rows']),groups=groups,rows=measured)
        output.mkdir(parents=True,exist_ok=False)
        for name,data in payload.items():
            target=output/name; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
        (output/'SHA256.json').write_bytes(z.read('SHA256.json'))
        (output/'AUDIT.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive',type=Path,required=True); parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    result=audit(args.archive,args.output)
    print(json.dumps({k:v for k,v in result.items() if k!='rows'},indent=2))
