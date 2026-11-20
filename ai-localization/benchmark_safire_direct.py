"""Three training examples only: measure frozen encoding and decoder optimization."""
import argparse
import json
import time
import subprocess
import sys


def main():
    from pathlib import Path
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--phase', choices=('driver', 'encode', 'optimize'), default='driver')
    args = parser.parse_args()
    if args.phase == 'driver':
        if args.output.exists():
            raise ValueError('Use a new output directory')
        for phase in ('encode', 'optimize'):
            subprocess.run([sys.executable, '-u', __file__, '--output', str(args.output),
                            '--phase', phase], check=True)
        return
    import torch
    import gc
    import numpy as np
    from evaluate_safire import free_memory, sha
    from safire_direct import (DATA, VERSION, SEED, verified_rows, prepare_model,
                              extract, target_mask, direct_loss)
    if args.phase == 'encode' and args.output.exists():
        raise ValueError('Use a new output directory')
    if free_memory() < 4 * 1024**3:
        raise RuntimeError('At least 4 GiB free RAM required; stop application AI services')
    rows, hashes = verified_rows()
    samples = [r for r in rows if r['split'] == 'train'][:3]
    if args.phase == 'encode':
        args.output.mkdir(parents=True)
    torch.manual_seed(SEED)
    model, direct = prepare_model()
    if args.phase == 'encode':
        records = []
        for row in samples:
            if free_memory() < 3 * 1024**3:
                raise RuntimeError('Insufficient memory before encoding')
            start = time.monotonic()
            features = extract(model, DATA/row['image'])
            elapsed = time.monotonic()-start
            file = args.output/(row['sample_id'] + '.npy')
            np.save(file, features.numpy(), allow_pickle=False)
            record = dict(sample_id=row['sample_id'], input_sha256=hashes[row['image']],
                          encode_seconds=elapsed, file=file.name, sha256=sha(file))
            records.append(record)
            (args.output/'encoding.json').write_text(json.dumps(records, indent=2))
            print(json.dumps(record), flush=True)
            del features
            gc.collect()
        return
    encoded = json.loads((args.output/'encoding.json').read_text())
    if [r['sample_id'] for r in encoded] != [r['sample_id'] for r in samples]:
        raise ValueError('Unexpected benchmark cache')
    frozen_before = {n: p._version for n, p in model.image_encoder.named_parameters()}
    optimizer = torch.optim.AdamW([p for p in direct.parameters() if p.requires_grad], lr=1e-5, weight_decay=.01)
    report = dict(architecture=VERSION, seed=SEED, release_approved=False,
        purpose='Runtime/gradient feasibility only, not validation', rows=[],
        manifest_sha256=sha(DATA/'training-manifest.csv'),
        trainable_parameters=sum(p.numel() for p in direct.parameters() if p.requires_grad),
        cuda_available=torch.cuda.is_available())
    for row, cached in zip(samples, encoded, strict=True):
        from evaluate_safire import checked_path
        file = checked_path(args.output, cached['file'], cached['sha256'])
        features = torch.from_numpy(np.load(file, allow_pickle=False))
        if features.shape != (1,256,64,64) or not torch.isfinite(features).all():
            raise ValueError('Invalid benchmark cache')
        encoding = cached['encode_seconds']
        target = target_mask(DATA/row['mask'])
        start = time.monotonic()
        optimizer.zero_grad(set_to_none=True)
        logits = direct(features)
        loss = direct_loss(logits, target)
        loss.backward()
        grads = [p.grad for p in direct.parameters() if p.grad is not None]
        if not grads or not all(torch.isfinite(g).all() for g in grads):
            raise ValueError('Missing/nonfinite gradients')
        grad_norm = float(torch.nn.utils.clip_grad_norm_(direct.parameters(), 1.0, error_if_nonfinite=True))
        optimizer.step()
        if any(p.grad is not None or p._version != frozen_before[n]
               for n, p in model.image_encoder.named_parameters()):
            raise ValueError('Frozen encoder changed')
        record = dict(sample_id=row['sample_id'], input_sha256=hashes[row['image']],
            encode_seconds=encoding, optimization_seconds=time.monotonic()-start,
            loss=float(loss.detach()), gradient_norm=grad_norm,
            logits_shape=list(logits.shape), free_ram_gib=free_memory()/1024**3)
        report['rows'].append(record)
        (args.output/'benchmark.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(record), flush=True)
        del features, target, logits, loss, grads
        optimizer.zero_grad(set_to_none=True)
        gc.collect()
    report['status'] = 'completed_not_a_quality_test'
    # Verify safe optimizer/model round-trip before a long checkpointed run.
    checkpoint_file = args.output/'smoke-checkpoint.pt'
    torch.save(dict(model=direct.state_dict(), optimizer=optimizer.state_dict()), checkpoint_file)
    restored = torch.load(checkpoint_file, weights_only=True, map_location='cpu')
    direct.load_state_dict(restored['model'], strict=True)
    optimizer.load_state_dict(restored['optimizer'])
    report['checkpoint_roundtrip'] = 'passed'
    report['estimated_600_image_cache_minutes'] = sum(r['encode_seconds'] for r in report['rows'])/3*600/60
    report['estimated_20_epoch_train_minutes_excluding_validation'] = sum(r['optimization_seconds'] for r in report['rows'])/3*480*20/60
    (args.output/'benchmark.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}), flush=True)


if __name__ == '__main__':
    main()
