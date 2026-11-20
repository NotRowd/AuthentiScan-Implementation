"""Inspect three development families and saved masks; no model run or tuning."""
import argparse
import io
import json
from pathlib import Path
import tarfile
import numpy as np
from PIL import Image
from evaluate_fused_candidate import ROOT, DATA, selected_rows, metrics
from prepare_tgif2_flux1dev_subset import ARCHIVE_PATHS, FAKE_CONDITIONS, resize_rgb, resize_mask
from acquire_tgif2_flux1dev_subset import ARCHIVES, verify


def main(output):
    rows = selected_rows()
    ids = sorted({r['source_id'].split('-')[-1] for r in rows}, key=int)
    output.mkdir(parents=True, exist_ok=False)
    originals = ROOT / 'datasets/tgif2-flux1dev-archives-v1'
    wanted = {'originals': {i + '_orig.png' for i in ids}}
    for c in FAKE_CONDITIONS:
        key = 'semantic_fake' if c['mask_type'] == 'segmentation' else 'random_fake'
        wanted[key] = {i + c['fake_suffix'] for i in ids}
        wanted[c['mask_archive']] = {i + c['mask_suffix'] for i in ids}
    raw = {}
    for key, names in wanted.items():
        path = originals / ARCHIVE_PATHS[key]
        pin = next(a for a in ARCHIVES if Path(a.local_relative_path) == ARCHIVE_PATHS[key])
        verify(path, pin)
        found = {}
        with tarfile.open(path, 'r:gz') as bundle:
            for member in bundle:
                name = Path(member.name).name
                if member.isfile() and name in names:
                    assert name not in found
                    found[name] = bundle.extractfile(member).read()
                    if set(found) == names: break
        assert set(found) == names
        raw[key] = found
        print('Verified archive and read only selected images: ' + key, flush=True)
    result_dir = ROOT / 'runs/loyd-fused-return-v2-2026-10-26/results'
    result = dict(scope='Three development source families only; no inference or threshold search',
                  release_approved=False, rows=[], pairs=[])
    native = output / 'native-assets'
    native.mkdir()
    for row in rows:
        sid = row['source_id'].split('-')[-1]
        condition = row['condition']
        with Image.open(io.BytesIO(raw['originals'][sid + '_orig.png'])) as im:
            original = np.asarray(im.convert('RGB'))
        if condition == 'authentic_control':
            payload = raw['originals'][sid + '_orig.png']
            truth = np.zeros(original.shape[:2], dtype=np.uint8)
        else:
            c = next(c for c in FAKE_CONDITIONS if c['condition'] == condition)
            key = 'semantic_fake' if c['mask_type'] == 'segmentation' else 'random_fake'
            payload = raw[key][sid + c['fake_suffix']]
            with Image.open(io.BytesIO(raw[c['mask_archive']][sid + c['mask_suffix']])) as im:
                truth = np.asarray(im.convert('L'))
            # Upstream semantic masks can have soft boundary values. Preserve
            # those bytes here; prepared scoring masks use nearest + >127.
            assert truth.dtype == np.uint8 and truth.ndim == 2
        with Image.open(io.BytesIO(payload)) as im:
            image = np.asarray(im.convert('RGB'))
            orientation = im.getexif().get(274)
            original_size = im.size
        assert image.shape == original.shape and truth.shape == image.shape[:2]
        assert orientation in (None, 1)
        with Image.open(DATA / row['image']) as im:
            prepared = np.asarray(im.convert('RGB'))
        with Image.open(DATA / row['mask']) as im:
            prepared_truth = np.asarray(im.convert('L'))
        assert np.array_equal(resize_rgb(image), prepared)
        assert np.array_equal(resize_mask(truth) * 255, prepared_truth)
        direct = np.asarray(Image.fromarray(image).resize((512,512),Image.Resampling.BILINEAR)).astype(float)
        old = np.asarray(Image.fromarray(prepared).resize((512,512),Image.Resampling.BILINEAR)).astype(float)
        support = truth > 0
        delta = np.abs(image.astype(float)-original.astype(float)).mean(axis=2)
        changed = np.any(image != original, axis=2)
        sample = row['sample_id']
        with np.load(result_dir / (sample + '.npz'), allow_pickle=False) as saved:
            scores = saved['scores'].copy()
            assert np.array_equal(saved['truth'], prepared_truth)
        prediction = scores >= .5
        target = prepared_truth > 0
        tp = int((prediction & target).sum())
        summary = dict(sample_id=sample, condition=condition, source_size=list(original_size),
            exif_orientation=orientation, prepared_pixels_exact=True, prepared_mask_exact=True,
            native_soft_boundary_fraction=float(np.mean((truth>0)&(truth<255))),
            direct_vs_448_input_mean_abs_rgb=float(np.abs(direct-old).mean()),
            direct_vs_448_input_pixels_different=float(np.mean(np.any(direct!=old,axis=2))),
            changed_pixels_outside_native_mask=int((changed & ~support).sum()),
            mean_rgb_change_inside=float(delta[support].mean()) if support.any() else None,
            mean_rgb_change_outside=float(delta[~support].mean()),
            target_fraction=float(target.mean()), predicted_fraction=float(prediction.mean()),
            precision=tp/int(prediction.sum()) if prediction.any() else None,
            recall=tp/int(target.sum()) if target.any() else None,
            dice=metrics(scores,target.astype(np.uint8))['dice'])
        result['rows'].append(summary)
        # Preserve selected raw bytes as an auditable future direct-input control.
        (native / (sample + '.png')).write_bytes(payload)
        Image.fromarray(truth).save(native / (sample + '-mask.png'))
        if target.any():
            with np.load(result_dir / ('train-' + sid + '-authentic-control.npz'), allow_pickle=False) as base:
                base_scores = base['scores']
                base_mask = base_scores >= .5
            result['pairs'].append(dict(sample_id=sample,
                original_score_in_edit_region=float(base_scores[target].mean()),
                edited_score_in_edit_region=float(scores[target].mean()),
                mean_change_in_edit_region=float((scores[target]-base_scores[target]).mean()),
                fraction_predicted_pixels_also_highlighted_in_original=float((prediction & base_mask).sum()/prediction.sum()) if prediction.any() else None))
        print(json.dumps(summary),flush=True)
    (output / 'REVIEW.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    for sid in ids:
        group=[r for r in rows if r['source_id']=='tgif2-'+sid]
        fig,axes=plt.subplots(3,3,figsize=(10,10))
        fig.suptitle('FUSED SOFAKE / source '+sid+' / fixed cutoff 0.50',fontsize=15)
        for y,row in enumerate(group):
            sample=row['sample_id']
            with Image.open(DATA/row['image']) as im: image=np.asarray(im.convert('RGB'))
            with np.load(result_dir/(sample+'.npz'),allow_pickle=False) as saved:
                truth=saved['truth']>0; pred=saved['scores']>=.5
            axes[y,0].imshow(image)
            axes[y,1].imshow(image)
            if truth.any(): axes[y,1].contour(truth,levels=[.5],colors=['#00ff00'],linewidths=1.3)
            axes[y,2].imshow(image)
            if pred.any(): axes[y,2].contour(pred,levels=[.5],colors=['#ff148c'],linewidths=1.3)
            d=next(r for r in result['rows'] if r['sample_id']==sample)
            label={'authentic_control':'Original','segm_flux1dev':'Semantic edit','random_flux1dev':'Random-area edit'}[row['condition']]
            axes[y,0].set_title(label)
            axes[y,1].set_title('Known edit: green' if truth.any() else 'Known edit: none')
            axes[y,2].set_title(f"Prediction: {d['predicted_fraction']*100:.2f}% area"+('' if d['dice'] is None else f" / Dice {d['dice']:.3f}"))
            for ax in axes[y]: ax.axis('off')
        fig.tight_layout(rect=(0,0,1,.97))
        fig.savefig(output/('comparison-'+sid+'.png'),dpi=135)
        plt.close(fig)
    print('Review complete: '+str(output),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    main(parser.parse_args().output)
