"""Recompute all returned diagnostic metrics without loading a checkpoint."""
import collections
import hashlib
import io
import json
from pathlib import Path
import zipfile
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parent


def sha(data):return hashlib.sha256(data).hexdigest()


def measure(scores,truth):
    assert scores.shape==truth.shape==(448,448)
    assert np.isfinite(scores).all() and scores.min()>=0 and scores.max()<=1
    pred=scores>.5;total=int(pred.sum()+truth.sum());tp=int((pred & truth.astype(bool)).sum())
    return dict(highlighted_fraction=float(pred.mean()),dice=2*tp/total if truth.any() else None)


def summarize(rows):
    result={}
    for role in ('tiny_fit','development_holdout'):
        result[role]={}
        for condition in ('authentic_control','segm_flux1dev','random_flux1dev'):
            group=[r for r in rows if r['role']==role and r['condition']==condition]
            result[role][condition]=dict(images=len(group),images_with_highlights=sum(r['highlighted_fraction']>0 for r in group),
                mean_highlighted_fraction=float(np.mean([r['highlighted_fraction'] for r in group])),
                mean_dice=float(np.mean([r['dice'] for r in group])) if condition!='authentic_control' else None,
                minimum_dice=min(r['dice'] for r in group) if condition!='authentic_control' else None)
    return result


def main(archive=None,package=None,output=None):
    archive=Path(archive or 'D:/Downloads/Return-to-Kent-DetectiveSAM-Diagnostic.zip')
    package=Path(package or ROOT/'handoff/AuthentiScan-DetectiveSAM-Diagnostic-Loyd-v1.zip')
    output=Path(output or ROOT/'runs/loyd-detectivesam-diagnostic-return-2026-10-28')
    with zipfile.ZipFile(package) as p,zipfile.ZipFile(archive) as z:
        cases=json.loads(p.read('CASES.json'));protocol=json.loads(p.read('PROTOCOL.json'))
        expected={'LAUNCHER.json','stdout.log','stderr.log','results/RESULT.json','results/loss.jsonl','results/diagnostic-adapters.pt'}
        for phase in ('before','after'):
            expected.add('results/'+phase+'/SUMMARY.json')
            expected.update('results/'+phase+'/'+c['sample_id']+'.npz' for c in cases)
        assert len(z.namelist())==len(set(z.namelist())) and set(z.namelist())==expected|{'SHA256.json'}
        assert sum(i.file_size for i in z.infolist())<300*2**20
        hashes=json.loads(z.read('SHA256.json'));assert set(hashes)==expected
        for name in expected:assert sha(z.read(name))==hashes[name]
        launcher=json.loads(z.read('LAUNCHER.json'));report=json.loads(z.read('results/RESULT.json'))
        assert launcher['release_sha256']==report['release_sha256']==sha(p.read('RELEASE.json'))
        assert launcher['completed'] and launcher['exit_code']==0 and report['completed'] and report['steps_completed']==480
        assert not report['release_approved'] and report['protocol']==protocol
        assert report['frozen_sha256_before']==report['frozen_sha256_after']
        assert report['trainable_sha256_before']!=report['trainable_sha256_after'] and report['three_step_checks']['passed']
        assert report['adapter_checkpoint_sha256']==hashes['results/diagnostic-adapters.pt']
        measured={};panels=[]
        for phase in ('before','after'):
            summaries=json.loads(z.read('results/'+phase+'/SUMMARY.json'))
            assert len(summaries)==48 and len({r['sample_id'] for r in summaries})==48
            rows=[]
            for case in cases:
                image=p.read(case['image']);mask=p.read(case['mask'])
                assert sha(image)==case['image_sha256'] and sha(mask)==case['mask_sha256']
                with Image.open(io.BytesIO(mask)) as im:truth=(np.asarray(im.convert('L'))>127).astype(np.uint8)
                with np.load(io.BytesIO(z.read('results/'+phase+'/'+case['sample_id']+'.npz')),allow_pickle=False) as arrays:
                    assert set(arrays.files)=={'scores','truth'} and np.array_equal(truth,arrays['truth'])
                    values=measure(arrays['scores'],truth)
                stored=next(r for r in summaries if r['sample_id']==case['sample_id'])
                for key in ('source_id','role','condition'):assert stored[key]==case[key]
                for key,value in values.items():assert stored[key] is None if value is None else np.isclose(stored[key],value,rtol=0,atol=1e-10)
                rows.append(dict(sample_id=case['sample_id'],source_id=case['source_id'],role=case['role'],condition=case['condition'],**values))
            measured[phase]=rows
        groups={phase:summarize(rows) for phase,rows in measured.items()}
        for condition,g in report['decision']['groups'].items():
            for phase,stats in g.items():
                for key,value in stats.items():
                    actual=groups[phase]['development_holdout'][condition][key]
                    assert actual is None if value is None else np.isclose(value,actual,rtol=0,atol=1e-10)
        fit=[r for r in measured['after'] if r['role']=='tiny_fit']
        fit_ok=all(r['highlighted_fraction']==0 if r['condition']=='authentic_control' else r['dice']>=.9 for r in fit)
        before,after=groups['before']['development_holdout'],groups['after']['development_holdout']
        ac,bc=after['authentic_control'],before['authentic_control']
        holdout_ok=(ac['images_with_highlights']<=1 and ac['mean_highlighted_fraction']<=.01
            and ac['images_with_highlights']<=bc['images_with_highlights'] and ac['mean_highlighted_fraction']<=bc['mean_highlighted_fraction']
            and all(after[c]['mean_dice']>=.5 and after[c]['mean_dice']>=before[c]['mean_dice']-.03 for c in ('segm_flux1dev','random_flux1dev')))
        assert report['decision']['tiny_fit_passed']==fit_ok and report['decision']['development_holdout_passed']==holdout_ok
        assert report['decision']['diagnostic_passed']==(fit_ok and holdout_ok)
        loss=[json.loads(line) for line in z.read('results/loss.jsonl').decode().splitlines()]
        assert [r['step'] for r in loss]==list(range(1,481))
        family={}
        for c in cases:
            if c['role']=='tiny_fit':family.setdefault(c['source_id'],{})[c['condition']]=c['sample_id']
        cycle=[]
        for source in sorted(family):
            g=family[source];cycle += [g['authentic_control'],g['segm_flux1dev'],g['authentic_control'],g['random_flux1dev']]
        assert all(r['sample_id']==cycle[i%16] for i,r in enumerate(loss))
        assert all(np.isfinite(r['loss']) and np.isfinite(r['gradient_norm']) for r in loss)
        loss_summary={}
        for c in ('authentic_control','segm_flux1dev','random_flux1dev'):
            loss_summary[c]={phase:float(np.mean([r['loss'] for r in block if r['condition']==c]))
                             for phase,block in (('first_cycle',loss[:16]),('last_cycle',loss[-16:]))}
        result=dict(archive_sha256=sha(archive.read_bytes()),payloads_verified=len(expected),release_identity_verified=True,
            all_96_score_maps_recomputed=True,ground_truth_matches_sent_package=True,training_schedule_verified=True,
            adapter_checkpoint_hash_verified=True,checkpoint_deserialized=False,
            frozen_parameter_hashes_match_as_reported=True,steps=480,tiny_fit_passed=fit_ok,
            development_holdout_passed=holdout_ok,release_approved=False,groups=groups,loss=loss_summary,
            gradient_clipped_steps=sum(r['gradient_norm']>1 for r in loss),training_seconds=report['training_seconds'],
            peak_allocated_gib=report['peak_allocated_gib'],peak_reserved_gib=report['peak_reserved_gib'],
            rows=measured,scope='Four training families, twelve development holdout families; not independent final validation')
        output.mkdir(parents=True,exist_ok=False)
        for name in expected|{'SHA256.json'}:
            dest=output/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(name))
        (output/'AUDIT.json').write_text(json.dumps(result,indent=2))
        # Deterministic representative: first source ID from each role, all its conditions.
        selected={min(c['source_id'] for c in cases if c['role']==role) for role in ('tiny_fit','development_holdout')}
        for case in cases:
            if case['source_id'] in selected:
                with Image.open(io.BytesIO(p.read(case['image']))) as im:original=np.asarray(im.convert('RGB')).copy()
                with Image.open(io.BytesIO(p.read(case['mask']))) as im:truth=np.asarray(im.convert('L'))>127
                predictions=[]
                for phase in ('before','after'):
                    with np.load(io.BytesIO(z.read('results/'+phase+'/'+case['sample_id']+'.npz')),allow_pickle=False) as arrays:predictions.append(arrays['scores']>.5)
                panels.append((case,original,truth,*predictions))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(6,4,figsize=(12,19))
    for row,(case,original,truth,before,after) in enumerate(panels):
        for ax,img,title in zip(axes[row],(original,truth,before,after),(case['sample_id'],'Known edit mask','Before training','After 480 steps')):
            ax.imshow(img,cmap='gray',vmin=0,vmax=1 if img.ndim==2 else 255);ax.set_title(title,fontsize=8);ax.axis('off')
    fig.suptitle('DetectiveSAM paired diagnostic: representative fit and holdout families\nWhite = labeled / predicted edit. Fixed cutoff 0.50. Quality checks FAILED.')
    fig.tight_layout(rect=(0,0,1,.965));fig.savefig(output/'BEFORE-AFTER.png',dpi=120);plt.close(fig)
    print(json.dumps({k:v for k,v in result.items() if k!='rows'},indent=2))
    return result


if __name__=='__main__':main()
