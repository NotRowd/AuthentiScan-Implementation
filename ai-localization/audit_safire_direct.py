"""Audit saved validation predictions without retraining or opening sealed tests."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
from evaluate_safire import ROOT, sha, checked_path
from safire_direct import DATA, verified_rows


def summarize(scores, targets, rows, cutoff):
    if (scores.shape != targets.shape or scores.ndim != 3 or len(rows) != len(scores)
            or not np.isfinite(scores).all() or scores.min()<0 or scores.max()>1
            or not np.isin(targets,[0,1]).all() or not 0<cutoff<1):
        raise ValueError('Invalid audit inputs')
    groups={}
    for condition in ('authentic_control','segm_flux1dev','random_flux1dev'):
        indices=[i for i,r in enumerate(rows) if r['condition']==condition]
        if not indices: raise ValueError('Missing condition')
        predicted=scores[indices]>=cutoff
        truth=targets[indices].astype(bool)
        tp=np.logical_and(predicted,truth).sum(axis=(1,2))
        count=predicted.sum(axis=(1,2))+truth.sum(axis=(1,2))
        dice=np.divide(2*tp,count,out=np.zeros(len(indices),dtype=float),where=count>0)
        groups[condition]=dict(images=len(indices),empty_masks=int((~predicted.any(axis=(1,2))).sum()),
            images_with_highlights=int(predicted.any(axis=(1,2)).sum()),
            highlighted_area_mean=float(predicted.mean()),
            dice=None if condition=='authentic_control' else float(dice.mean()))
    return groups


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',type=Path,default=ROOT/'runs/safire-direct-v1-2026-10-21')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if args.output.exists():raise ValueError('Use a fresh audit directory')
    rows,hashes=verified_rows()
    rows=[r for r in rows if r['split']=='validation']
    saved_order=json.loads((args.run/'validation-order.json').read_text())
    if rows!=saved_order:raise ValueError('Validation order mismatch')
    decision=json.loads((args.run/'validation-report.json').read_text())
    if sha(args.run/'best-decoder.pt')!=decision['best_checkpoint_sha256']:
        raise ValueError('Best checkpoint hash mismatch')
    with np.load(args.run/'validation-predictions.npz',allow_pickle=False) as arrays:
        scores=arrays['probabilities']; targets=arrays['targets']
    if scores.shape!=(120,448,448):raise ValueError('Unexpected prediction shape')
    for i,row in enumerate(rows):
        with Image.open(checked_path(DATA,row['mask'],hashes[row['mask']])) as mask:
            original=np.asarray(mask.convert('L'))//255
        if not np.array_equal(original,targets[i]):raise ValueError('Saved target differs from source mask')
    reproduced=summarize(scores,targets,rows,decision['threshold'])
    for condition,group in reproduced.items():
        for key,value in group.items():
            if value is not None and not np.isclose(value,decision['groups'][condition][key],rtol=1e-7,atol=1e-10):
                raise ValueError('Reported metric does not reproduce')
    history=json.loads((args.run/'history.json').read_text())
    best=min(history,key=lambda x:x['validation_loss'])
    if best['epoch']!=decision['best_epoch']:raise ValueError('Wrong checkpoint selected')
    args.output.mkdir(parents=True)
    curves=[]
    for cutoff in np.linspace(.01,.99,99):
        groups=summarize(scores,targets,rows,float(cutoff))
        curves.append(dict(threshold=float(cutoff),groups=groups,
            edited_macro_dice=float(np.mean([groups[c]['dice'] for c in ('segm_flux1dev','random_flux1dev')]))))
    optimistic=max(curves,key=lambda x:x['edited_macro_dice'])
    report=dict(release_approved=False,validation_only=True,targets_match_source=True,
        recorded_metrics_reproduced=True,best_epoch=best['epoch'],history=history,
        reported_operating_point=decision,
        best_overlap_ignoring_false_highlight_gate=optimistic,
        curve=curves,predictions_sha256=sha(args.run/'validation-predictions.npz'))
    (args.output/'audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    figure,axes=plt.subplots(1,2,figsize=(12,4))
    for field,label in [('train_loss','Training'),('validation_loss','Validation')]:
        axes[0].plot([h['epoch'] for h in history],[h[field] for h in history],label=label)
    axes[0].set(title='Loss by epoch (lower is better)',xlabel='Epoch',ylabel='Loss')
    axes[0].legend()
    axes[1].plot([c['threshold'] for c in curves],[c['edited_macro_dice'] for c in curves],label='Edited mask Dice')
    axes[1].plot([c['threshold'] for c in curves],
        [c['groups']['authentic_control']['images_with_highlights']/40 for c in curves],label='Authentic images falsely highlighted')
    axes[1].set(title='Validation trade-off (not an independent test)',xlabel='Score cutoff',ylim=(0,1.05))
    axes[1].legend();figure.tight_layout();figure.savefig(args.output/'curves.png',dpi=130);plt.close(figure)
    # Fixed first three families, never selected for favorable predictions.
    for family in range(3):
        figure,axes=plt.subplots(3,5,figsize=(15,9))
        for j in range(3):
            i=family*3+j; row=rows[i]
            with Image.open(checked_path(DATA,row['image'],hashes[row['image']])) as source:
                pixels=np.asarray(source.convert('RGB'))
            displays=[pixels,targets[i],scores[i],scores[i]>=.5,scores[i]>=decision['threshold']]
            titles=[row['condition'],'Known edit mask','Raw model score (0–1)','Diagnostic cutoff 0.50',f'Locked cutoff {decision["threshold"]:.2f}']
            for ax,value,title in zip(axes[j],displays,titles):
                ax.imshow(value,**({} if value.ndim==3 else dict(cmap='gray',vmin=0,vmax=1)))
                ax.set_title(title,fontsize=9);ax.axis('off')
        figure.suptitle(f'Validation source {rows[family*3]["source_id"]} — diagnostic only')
        figure.tight_layout();figure.savefig(args.output/f'family-{family+1}.png',dpi=110);plt.close(figure)
    print(json.dumps(dict(targets_match_source=True,recorded_metrics_reproduced=True,
        best_epoch=best['epoch'],best_unconstrained=optimistic,
        cutoff_050=next(c for c in curves if np.isclose(c['threshold'],.5))),indent=2))


if __name__=='__main__':main()
