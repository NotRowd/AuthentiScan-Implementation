"""Review paired pixels and labels; never infer a mask from ground truth in the app."""
import hashlib
import io
import json
from pathlib import Path
import zipfile
import numpy as np
from PIL import Image, ImageFilter

ROOT=Path(__file__).resolve().parent


def main():
    output=ROOT/'runs/detectivesam-supervision-review-2026-10-28'
    output.mkdir(parents=True,exist_ok=False)
    records=[];panels=[]
    with zipfile.ZipFile(ROOT/'handoff/AuthentiScan-DetectiveSAM-Balanced-Loss-Loyd-v2.zip') as z:
        cases=json.loads(z.read('CASES.json'));families={}
        for c in cases:
            for field in ('image','mask'):
                assert hashlib.sha256(z.read(c[field])).hexdigest()==c[field+'_sha256']
            families.setdefault(c['source_id'],{})[c['condition']]=c
        def pixels(name):
            with Image.open(io.BytesIO(z.read(name))) as im:return np.asarray(im.convert('RGB')).copy()
        for source,family in families.items():
            original=pixels(family['authentic_control']['image'])
            for condition in ('segm_flux1dev','random_flux1dev'):
                case=family[condition];edited=pixels(case['image'])
                with Image.open(io.BytesIO(z.read(case['mask']))) as im:mask=np.asarray(im.convert('L'))>127
                assert original.shape==edited.shape==(448,448,3) and mask.shape==(448,448)
                delta=np.max(np.abs(original.astype(np.int16)-edited.astype(np.int16)),axis=2)
                # Bicubic image resize can spread edge differences beyond a nearest
                # resized binary mask. Two-pixel dilation is diagnostic only.
                expanded=np.asarray(Image.fromarray(mask.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(5)))>0
                changed=delta>8
                record=dict(sample_id=case['sample_id'],source_id=source,role=case['role'],condition=condition,
                    mask_fraction=float(mask.mean()),mean_rgb_max_difference_inside=float(delta[mask].mean()),
                    mean_rgb_max_difference_outside=float(delta[~mask].mean()),
                    changed_pixels_gt8=int(changed.sum()),
                    changed_fraction_inside_mask=float(changed[mask].mean()),
                    changed_fraction_outside_expanded_mask=float(changed[~expanded].mean()),
                    changed_pixel_coverage_by_expanded_mask=float((changed & expanded).sum()/changed.sum()) if changed.any() else None)
                records.append(record)
                if case['role']=='tiny_fit':panels.append((case,original,edited,mask,delta))
        summary={condition:dict(images=sum(r['condition']==condition for r in records),
                   minimum_change_coverage=min(r['changed_pixel_coverage_by_expanded_mask'] for r in records if r['condition']==condition),
                   max_outside_changed_fraction=max(r['changed_fraction_outside_expanded_mask'] for r in records if r['condition']==condition))
                 for condition in ('segm_flux1dev','random_flux1dev')}
        (output/'PIXEL-REVIEW.json').write_text(json.dumps(dict(rows=records,summary=summary,
            scope='48 already-inspected cases only; no sealed test read',
            diagnostic_difference_threshold=8,border_dilation_pixels=2,
            thresholds_are_not_detection_or_relabeling_rules=True),indent=2))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(8,4,figsize=(12,25))
    for i,(case,original,edited,mask,delta) in enumerate(panels):
        for ax,data,title in zip(axes[i],(original,edited,mask,delta),
                                 ('Original',case['sample_id'],'Supplied edit mask','Pixel difference (fixed 0-255)')):
            ax.imshow(data,cmap='gray',vmin=0,vmax=1 if data.dtype==bool else 255)
            ax.set_title(title,fontsize=8);ax.axis('off')
    fig.suptitle('Training-pair supervision review — original / edited / supplied mask / difference\nPixel differences are diagnostic evidence, not replacement labels.')
    fig.tight_layout(rect=(0,0,1,.97));fig.savefig(output/'FIT-PAIRS.png',dpi=110);plt.close(fig)
    print(json.dumps(summary,indent=2))


if __name__=='__main__':main()
