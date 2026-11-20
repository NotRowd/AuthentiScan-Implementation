"""One predeclared v2 experiment: standardized delta features + paired supervision.

Uses only the existing train/validation cache. No test access or live deployment.
"""
import argparse
import json
from pathlib import Path
import time

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from torch.utils.data import DataLoader, Dataset

from supervised_localizer import (ARCHITECTURE, CHECKPOINT_SHA, REVISION, mask_loss,
                                  operating_metrics, relative_file, select_threshold, sha, training_rows)
from train_supervised_localization import SEED, seed_everything, write_json

VERSION = 'dinov2s14-standardized-delta-paired-v2'
CONDITIONS = ('authentic_control', 'segm_flux1dev', 'random_flux1dev')


def verify_cache(data, cache):
    rows = training_rows(data)
    index = json.loads((cache / 'index.json').read_text())
    if (index.get('architecture') != ARCHITECTURE or index.get('encoder_revision') != REVISION
            or index.get('encoder_sha256') != CHECKPOINT_SHA
            or index.get('training_manifest_sha256') != sha(data / 'training-manifest.csv')):
        raise ValueError('Cache provenance mismatch')
    records = index['records']
    if len(records) != len(rows):
        raise ValueError('Incomplete cache')
    for row, record in zip(rows, records, strict=True):
        if any(record.get(k) != v for k, v in row.items()):
            raise ValueError('Cache metadata/order mismatch')
        if sha(relative_file(cache, record['file'])) != record['sha256']:
            raise ValueError('Cache checksum mismatch')
    return records


def load_sample(cache, record):
    with np.load(relative_file(cache, record['file']), allow_pickle=False) as value:
        x = value['features'][384:].astype(np.float32)
        y = value['target'].astype(np.float32)
    if (x.shape != (384, 32, 32) or y.shape != (32, 32) or not np.isfinite(x).all()
            or not np.isfinite(y).all() or x.min() < 0 or y.min() < 0 or y.max() > 1):
        raise ValueError('Invalid cached sample')
    return torch.from_numpy(x), torch.from_numpy(y).unsqueeze(0)


def moments(cache, records):
    total = torch.zeros(384, dtype=torch.float64)
    square = total.clone()
    count = 0
    for record in records:
        if record['split'] != 'train':
            continue
        x, _ = load_sample(cache, record)
        x = x.double()
        total += x.sum((1, 2)); square += x.square().sum((1, 2)); count += 1024
    if not count:
        raise ValueError('No training data for feature statistics')
    mean = total / count
    std = (square / count - mean.square()).clamp_min(1e-6).sqrt()
    return mean.float().reshape(1, 384, 1, 1), std.float().reshape(1, 384, 1, 1)


class DeltaHead(nn.Module):
    def __init__(self, mean=None, std=None):
        super().__init__()
        self.register_buffer('mean', torch.zeros(1, 384, 1, 1) if mean is None else mean)
        self.register_buffer('std', torch.ones(1, 384, 1, 1) if std is None else std)
        self.layers = nn.Sequential(nn.Conv2d(384, 32, 1), nn.GELU(), nn.Dropout2d(.2),
                                    nn.Conv2d(32, 16, 3, padding=1), nn.GELU(), nn.Conv2d(16, 1, 1))

    def forward(self, x):
        return self.layers(((x - self.mean) / self.std).clamp(-8, 8))


class Families(Dataset):
    def __init__(self, cache, records):
        self.cache = cache
        groups = {}
        for row in records:
            groups.setdefault(row['source_id'], {})[row['condition']] = row
        if any(set(group) != set(CONDITIONS) for group in groups.values()):
            raise ValueError('Each training source needs authentic and both edited examples')
        self.groups = list(groups.values())

    def __len__(self):
        return len(self.groups)

    def __getitem__(self, index):
        pairs = [load_sample(self.cache, self.groups[index][name]) for name in CONDITIONS]
        x = torch.stack([p[0] for p in pairs]); y = torch.stack([p[1] for p in pairs])
        if torch.rand(()) < .5:
            x = x.flip(-1); y = y.flip(-1)
        return x, y


def paired_loss(logits, target):
    if logits.shape != target.shape or logits.ndim != 5 or logits.shape[1:3] != (3, 1):
        raise ValueError('Expected source-aligned triplets')
    base = mask_loss(logits.flatten(0, 1), target.flatten(0, 1))
    scores = logits.sigmoid()
    edited = target[:, 1:]
    # Authentic reference is used ONLY for training, never for image-only inference.
    difference = scores[:, 1:] - scores[:, :1]
    ranking = (F.relu(.15 - difference) * edited).sum() / edited.sum().clamp_min(1)
    outside = 1 - edited
    consistency = (difference.square() * outside).sum() / outside.sum().clamp_min(1)
    return base + .5 * ranking + .1 * consistency


@torch.inference_mode()
def predict_validation(model, cache, records):
    model.eval(); probabilities = []; targets = []; losses = []
    for start in range(0, len(records), 8):
        pairs = [load_sample(cache, r) for r in records[start:start+8]]
        x = torch.stack([p[0] for p in pairs]); y = torch.stack([p[1] for p in pairs])
        logits = model(x)
        losses.append((float(mask_loss(logits, y)), len(pairs)))
        probabilities.extend(logits.sigmoid().numpy()[:, 0]); targets.extend(y.numpy()[:, 0])
    return np.asarray(probabilities), np.asarray(targets), sum(v*n for v,n in losses)/len(records)


def baseline_diagnostic(data, output, returned):
    rows = [r for r in training_rows(data) if r['split'] == 'validation']
    if json.loads((returned/'validation-sample-order.json').read_text()) != [r['sample_id'] for r in rows]:
        raise ValueError('Baseline validation order mismatch')
    with np.load(returned/'validation-predictions.npz', allow_pickle=False) as archive:
        p, t = archive['probabilities'], archive['targets']
    write_json(output/'v1-threshold-diagnostic.json', dict(
        diagnostic_only=True, test_images_used=0, live_threshold_changed=False,
        groups_at_050=operating_metrics(p,t,rows,.5),
        groups_at_selected_097=operating_metrics(p,t,rows,.97)))


def run(args):
    args.output.mkdir(parents=True, exist_ok=False)
    seed_everything()
    write_json(args.output/'protocol.json', dict(architecture=VERSION, seed=SEED, epochs=20,
        batch_source_families=2, images_per_family=3, learning_rate=.001, weight_decay=.01,
        features='delta channels only, training-only per-channel standardization, clamp +/-8',
        dropout=.2, loss='BCE(posweight4)+edited Dice + .5 paired margin(.15) + .1 outside consistency',
        checkpoint_selection='minimum validation BCE+edited Dice; no epoch threshold search',
        acceptance='unchanged: Dice >=.50 per edit group, controls <=10% any and <=1% area',
        validation_reused_for_model_development=True, final_test_used=False,
        production_enabled=False, reason='Bounded attempt to reduce semantic shortcuts and overfitting; no success guarantee'))
    records = verify_cache(args.data, args.cache)
    if len(records) != 600:
        raise ValueError('Expected original 600-record train/validation cache')
    train_rows = [r for r in records if r['split'] == 'train']
    validation_rows = [r for r in records if r['split'] == 'validation']
    if len(train_rows) != 480 or len(validation_rows) != 120:
        raise ValueError('Unexpected split sizes')
    baseline_diagnostic(args.data, args.output, args.cache.parent/'training-output')
    print('Cache verified. Computing training-only feature statistics.', flush=True)
    mean, std = moments(args.cache, records)
    model = DeltaHead(mean, std)
    loader = DataLoader(Families(args.cache, train_rows), batch_size=2, shuffle=True, num_workers=0)
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=.01)
    write_json(args.output/'environment.json', dict(torch=torch.__version__, device='cpu',
        threads=torch.get_num_threads(), parameters=sum(p.numel() for p in model.parameters()),
        train_sources=len(loader.dataset), validation_sources=40, test_images=0,
        feature_index_sha256=sha(args.cache/'index.json')))
    history=[]; best=float('inf'); started=time.monotonic()
    for epoch in range(1, 21):
        model.train(); total=0.; count=0
        for x,y in loader:
            logits=model(x.flatten(0,1)).reshape(y.shape)
            loss=paired_loss(logits,y)
            if not torch.isfinite(loss):raise ValueError('Nonfinite training loss')
            optimizer.zero_grad(set_to_none=True);loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(),1.);optimizer.step()
            total+=float(loss.detach())*len(x);count+=len(x)
        _,_,validation_loss=predict_validation(model,args.cache,validation_rows)
        history.append(dict(epoch=epoch,train=total/count,validation=validation_loss))
        write_json(args.output/'history.json',history)
        if validation_loss<best:
            best=validation_loss
            temporary=args.output/'head.partial';torch.save(model.state_dict(),temporary)
            temporary.replace(args.output/'best-head.pt')
            write_json(args.output/'checkpoint.json',dict(architecture=VERSION,epoch=epoch,validation_loss=best,
                head_sha256=sha(args.output/'best-head.pt'),encoder_sha256=CHECKPOINT_SHA,encoder_revision=REVISION,
                training_manifest_sha256=sha(args.data/'training-manifest.csv'),release_approved=False))
        print(json.dumps(history[-1]),flush=True)
    model.load_state_dict(torch.load(args.output/'best-head.pt',map_location='cpu',weights_only=True))
    p,t,_=predict_validation(model,args.cache,validation_rows)
    report=select_threshold(p,t,validation_rows)
    report.update(architecture=VERSION,head_sha256=sha(args.output/'best-head.pt'),
                  training_manifest_sha256=sha(args.data/'training-manifest.csv'))
    write_json(args.output/'validation-report.json',report)
    np.savez_compressed(args.output/'validation-predictions.npz',probabilities=p,targets=t)
    write_json(args.output/'validation-sample-order.json',[r['sample_id'] for r in validation_rows])
    write_json(args.output/'completion.json',dict(training_complete=True,validation_status=report['status'],
        test_evaluated=False,production_enabled=False,seconds=time.monotonic()-started))
    print(json.dumps(report,indent=2),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ('data','cache','output'):parser.add_argument('--'+key,type=Path,required=True)
    run(parser.parse_args())
