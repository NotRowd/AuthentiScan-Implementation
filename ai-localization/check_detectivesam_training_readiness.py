"""Read-only dataset/gradient-structure checks. No checkpoints, training or network."""
import collections
import csv
import hashlib
import json
from pathlib import Path
import sys
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'datasets/supervised-localization-v1'
PRE = ROOT / 'candidates/detectivesam-preflight'
OUT = ROOT / 'runs/detectivesam-training-readiness-2026-10-27'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def check_data():
    import numpy as np
    from PIL import Image
    with (DATA/'training-manifest.csv').open(newline='') as stream:
        rows = list(csv.DictReader(stream))
    # Only source identities from the sealed manifest, never its images/masks.
    with (DATA/'sealed-test-manifest.csv').open(newline='') as stream:
        sealed_sources = {r['source_id'] for r in csv.DictReader(stream)}
    ledger = json.loads((DATA/'asset-sha256.json').read_text())
    families = {}; hashes = {}; split_sources = collections.defaultdict(set)
    counts = collections.Counter(); mask_areas = collections.defaultdict(list)
    for row in rows:
        family = families.setdefault(row['source_id'], {})
        assert row['condition'] not in family
        family[row['condition']] = row
        split_sources[row['split']].add(row['source_id'])
        counts[row['split']+'/'+row['condition']] += 1
        for field in ('image','mask'):
            path = (DATA/row[field]).resolve()
            assert path.is_relative_to(DATA.resolve()) and digest(path) == ledger[row[field]]
        image_hash = ledger[row['image']]
        hashes.setdefault(image_hash, set()).add(row['split'])
        with Image.open(DATA/row['image']) as image:
            assert image.size == (448,448)
        with Image.open(DATA/row['mask']) as image:
            mask = np.asarray(image.convert('L'))
        assert mask.shape == (448,448) and np.isin(mask,[0,255]).all()
        area = float((mask>0).mean())
        assert area == 0 if row['condition'] == 'authentic_control' else 0 < area < 1
        mask_areas[row['condition']].append(area)
    assert all(set(f) == {'authentic_control','segm_flux1dev','random_flux1dev'} for f in families.values())
    assert not split_sources['train'] & split_sources['validation']
    assert not (split_sources['train'] | split_sources['validation']) & sealed_sources
    assert all(len(splits)==1 for splits in hashes.values())
    # Reserve a deterministic tiny-fit and development holdout plan; no inference.
    fit_sources = sorted(split_sources['train'], key=lambda s: hashlib.sha256(('detectivesam-fit-v1/'+s).encode()).hexdigest())[:4]
    holdout_sources = sorted(split_sources['validation'], key=lambda s: hashlib.sha256(('detectivesam-holdout-v1/'+s).encode()).hexdigest())[:12]
    planned = [dict(role='tiny_fit' if r['source_id'] in fit_sources else 'development_holdout', **r)
               for r in rows if r['source_id'] in fit_sources+holdout_sources]
    return dict(rows=len(rows), counts=dict(counts), sources={k:len(v) for k,v in split_sources.items()},
                checksums_verified=True, authentic_masks_empty=True, edited_masks_nonempty=True,
                source_disjoint=True, cross_split_exact_image_duplicates=0,
                sealed_pixels_read=False, prior_validation_reused=True,
                scope='FLUX.1-dev partial edits only; not new independent validation; prepared 448-square images',
                training_manifest_sha256=digest(DATA/'training-manifest.csv'),
                limitations=['No perceptual-duplicate check', 'No human verification of mask boundaries',
                             'Existing validation set already informed prior model development']), planned


def check_graph():
    sys.path[:0] = [str(PRE/'deps'),str(PRE/'sam2-source'),str(PRE/'source')]
    import torch
    from detectivesam_inference.runtime import initialize_sam2_config
    from detectivesam_inference.models import forgerylocalizer as localizer
    initialize_sam2_config(PRE/'source/sam2configs')
    build = localizer.build_sam2
    linspace = torch.linspace
    # Only Hiera's construction-time scalar schedule needs real values. Learned
    # positional encoding explicitly asks for meta and remains on meta.
    def shape_linspace(*args, **kwargs):
        kwargs.setdefault('device','cpu')
        return linspace(*args, **kwargs)
    with patch.object(localizer,'build_sam2',side_effect=lambda config, checkpoint, **kwargs: build(config,None,**kwargs)), patch.object(torch,'linspace',side_effect=shape_linspace):
        with torch.device('meta'):
            model=localizer.ForgeryLocalizer('sam2.1_hiera_b+.yaml','UNUSED',prompt_dim=64,
                downscale=16,dropout_rate=.2,max_streams=2,device='meta')
            model.train(); model.encoder.eval()
            original=torch.empty(1,3,512,512)
            output=model(original,[torch.empty_like(original),torch.empty_like(original)])
            loss=output.square().mean()
            loss.backward()
    trainable={n:p for n,p in model.named_parameters() if p.requires_grad}
    missing=[n for n,p in trainable.items() if p.grad is None]
    frozen_with_grad=[n for n,p in model.named_parameters() if not p.requires_grad and p.grad is not None]
    assert tuple(output.shape)==(1,1,512,512) and not frozen_with_grad
    groups={prefix:sum(p.numel() for n,p in trainable.items() if n.startswith(prefix) and p.grad is not None)
            for prefix in ('adapters.','mask_adapter.')}
    assert all(count>0 for count in groups.values())
    return dict(shape_only=True, numerical_gradients_tested=False, checkpoint_loaded=False,
                memory_fit_tested=False, optimizer_step_run=False, source_modified=False,
                output_shape=list(output.shape), total_parameters=sum(p.numel() for p in model.parameters()),
                trainable_parameters=sum(p.numel() for p in trainable.values()),
                connected_trainable_parameters=groups, trainable_without_gradient=missing,
                frozen_parameters_with_gradient=frozen_with_grad,
                caveat='Custom direct forward in train mode; not author training reproduction or accuracy evidence')


if __name__ == '__main__':
    data, planned = check_data()
    print('Data checks passed: '+str(data['rows'])+' images.', flush=True)
    graph = check_graph()
    result=dict(data=data, graph=graph, training_ready=False, release_approved=False,
                blockers=['Authors publish inference-only code; no official training recipe',
                          'Checkpoint derivative/publication terms unresolved',
                          'No real-weight gradient/optimizer/memory test',
                          'Source-disjoint untouched final evaluation still needed'])
    OUT.mkdir(parents=True,exist_ok=False)
    (OUT/'READINESS.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    (OUT/'PROPOSED-CASES.json').write_text(json.dumps(planned,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))
