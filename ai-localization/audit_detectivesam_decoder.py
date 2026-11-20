"""Audit returned candidate masks; never load weights or select using labels in app."""
import io
import json
from pathlib import Path
import zipfile
import numpy as np
from PIL import Image
from audit_detectivesam_diagnostic import ROOT, sha, measure


def equal_metrics(a,b):
    for k in ('dice','highlighted_fraction'):
        assert b[k] is None if a[k] is None else np.isclose(a[k],b[k],rtol=0,atol=1e-10)


def main():
    archive=Path('D:/Downloads/Return-to-Kent-DetectiveSAM-Decoder.zip')
    package=ROOT/'handoff/AuthentiScan-DetectiveSAM-Decoder-Probe-Loyd-v1.zip'
    previous=Path('D:/Downloads/Return-to-Kent-DetectiveSAM-Balanced.zip')
    assert sha(package.read_bytes())=='e2005dde17552721e87f0f55d172d071236368d976bbbb2ad67b88341e1529c0'
    output=ROOT/'runs/loyd-detectivesam-decoder-return-2026-10-28'
    panels=[];rows=[];max_prior_delta=0.;max_selection_delta=0.
    with zipfile.ZipFile(package) as p,zipfile.ZipFile(archive) as z,zipfile.ZipFile(previous) as old:
        protocol=json.loads(p.read('PROTOCOL.json'))
        assert sha(previous.read_bytes())==protocol['trained_return_sha256']
        cases=json.loads(p.read('CASES.json'));assert len(cases)==12 and all(c['role']=='tiny_fit' for c in cases)
        expected={'LAUNCHER.json','stdout.log','stderr.log','results/RESULT.json'}
        expected.update(f"results/{v}/{c['sample_id']}.npz" for v in ('pretrained','balanced_v2') for c in cases)
        assert len(z.namelist())==len(set(z.namelist())) and set(z.namelist())==expected|{'SHA256.json'}
        assert sum(i.file_size for i in z.infolist())<200*2**20
        hashes=json.loads(z.read('SHA256.json'));assert set(hashes)==expected
        for n in expected:assert sha(z.read(n))==hashes[n]
        report=json.loads(z.read('results/RESULT.json'));launcher=json.loads(z.read('LAUNCHER.json'))
        assert report['release_sha256']==launcher['release_sha256']==sha(p.read('RELEASE.json'))
        assert launcher['completed'] and launcher['exit_code']==0 and report['completed'] and report['stage']=='probe_complete'
        assert report['training_steps']==0 and not report['release_approved'] and not launcher['release_approved']
        assert report['adapter_file_sha256']==protocol['adapter_checkpoint_sha256']
        assert report['parameters_unchanged_within_each_variant']
        assert len(report['rows'])==24 and len({(r['variant'],r['sample_id']) for r in report['rows']})==24
        for variant,phase in (('pretrained','before'),('balanced_v2','after')):
            for case in cases:
                sid=case['sample_id'];stored=next(r for r in report['rows'] if r['variant']==variant and r['sample_id']==sid)
                for field in ('image','mask'):assert sha(p.read(case[field]))==case[field+'_sha256']
                with Image.open(io.BytesIO(p.read(case['mask']))) as im:truth=(np.asarray(im.convert('L'))>127).astype(np.uint8)
                with np.load(io.BytesIO(z.read(f'results/{variant}/{sid}.npz')),allow_pickle=False) as data:
                    assert set(data.files)=={'heads','selected','truth'} and np.array_equal(truth,data['truth'])
                    heads=data['heads'].copy();selected=data['selected'].copy()
                assert heads.shape==(4,448,448) and stored['condition']==case['condition']
                ms=[measure(h,truth) for h in heads];actual=measure(selected,truth)
                for a,b in zip(ms,stored['heads']):equal_metrics(a,b)
                equal_metrics(actual,stored['selected'])
                scores=np.asarray(stored['internal_object_quality_scores']);assert scores.shape==(4,) and np.isfinite(scores).all()
                fallback=stored['single_head_stability']<.98
                chosen=int(scores[1:].argmax())+1 if fallback else 0
                assert stored['selected_head']==chosen and stored['fallback_used']==fallback
                delta=float(np.max(np.abs(selected-heads[chosen])));assert delta<=1e-6
                max_selection_delta=max(max_selection_delta,delta)
                with np.load(io.BytesIO(old.read(f'results/{phase}/{sid}.npz')),allow_pickle=False) as data:
                    assert np.array_equal(truth,data['truth'])
                    delta=float(np.max(np.abs(selected-data['scores'])));assert delta<=1e-6
                    max_prior_delta=max(max_prior_delta,delta)
                best=max(m['dice'] for m in ms) if truth.any() else None
                assert stored['oracle_dice_for_diagnosis_only'] is None if best is None else np.isclose(best,stored['oracle_dice_for_diagnosis_only'],atol=1e-10,rtol=0)
                rows.append(dict(variant=variant,sample_id=sid,condition=case['condition'],selected_head=chosen,
                                 fallback_used=fallback,selected=actual,heads=ms,label_based_best_dice_diagnostic_only=best))
                if variant=='balanced_v2':
                    with Image.open(io.BytesIO(p.read(case['image']))) as im:original=np.asarray(im.convert('RGB')).copy()
                    panels.append((case,original,truth,heads,chosen,ms))
        groups={}
        for variant in ('pretrained','balanced_v2'):
            groups[variant]={}
            for cond in ('authentic_control','segm_flux1dev','random_flux1dev'):
                group=[r for r in rows if r['variant']==variant and r['condition']==cond]
                strategies={}
                for strategy in ('selected','head_0','head_1','head_2','head_3'):
                    metrics=[r['selected'] if strategy=='selected' else r['heads'][int(strategy[-1])] for r in group]
                    strategies[strategy]=dict(mean_dice=float(np.mean([m['dice'] for m in metrics])) if cond!='authentic_control' else None,
                        mean_highlighted_fraction=float(np.mean([m['highlighted_fraction'] for m in metrics])),
                        images_with_highlights=sum(m['highlighted_fraction']>0 for m in metrics))
                groups[variant][cond]=dict(images=len(group),fallback_count=sum(r['fallback_used'] for r in group),strategies=strategies,
                    label_based_best_mean_dice_diagnostic_only=float(np.mean([r['label_based_best_dice_diagnostic_only'] for r in group])) if cond!='authentic_control' else None,
                    no_candidate_reaches_dice_0_5=sum(r['label_based_best_dice_diagnostic_only']<.5 for r in group) if cond!='authentic_control' else None)
        audit=dict(archive_sha256=sha(archive.read_bytes()),payloads_verified=len(expected),forward_passes=24,
            head_maps_recomputed=96,selected_maps_recomputed=24,ground_truth_verified=True,
            maximum_difference_from_previous_selected_maps=max_prior_delta,maximum_selected_head_difference=max_selection_delta,
            parameter_preservation_as_reported=True,weights_not_loaded_by_auditor=True,training_steps=0,
            groups=groups,rows=rows,release_approved=False,
            conclusion='Selection alone cannot fix these fitted cases: useful candidates are absent for multiple edits.',
            scope='Four previously fitted image families; diagnostic evidence, not independent accuracy.')
        output.mkdir(parents=True,exist_ok=False)
        for n in expected|{'SHA256.json'}:
            dest=output/n;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(n))
        (output/'AUDIT.json').write_text(json.dumps(audit,indent=2))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(12,6,figsize=(15,29))
    for row,(c,original,truth,heads,chosen,ms) in enumerate(panels):
        axes[row,0].imshow(original);axes[row,0].set_title(c['sample_id'].replace('train-',''),fontsize=8)
        axes[row,1].imshow(truth,cmap='gray',vmin=0,vmax=1);axes[row,1].set_title('Reference mask',fontsize=8)
        for h in range(4):
            axes[row,h+2].imshow(heads[h]>.5,cmap='gray',vmin=0,vmax=1)
            value=f"Dice {ms[h]['dice']:.3f}" if ms[h]['dice'] is not None else f"Area {ms[h]['highlighted_fraction']:.2%}"
            axes[row,h+2].set_title(f"Head {h}{' (selected)' if h==chosen else ''}\n{value}",fontsize=8)
        for ax in axes[row]:ax.axis('off')
    fig.suptitle('Balanced-v2: all candidates at the unchanged 0.5 threshold | fitted cases only',fontsize=13)
    fig.tight_layout(rect=(0,0,1,.985));fig.savefig(output/'ALL-CANDIDATES.png',dpi=110);plt.close(fig)
    print(json.dumps({k:v for k,v in audit.items() if k!='rows'},indent=2))


if __name__=='__main__':main()
