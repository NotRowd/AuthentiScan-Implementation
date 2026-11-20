"""Resumable, isolated CPU fine-tuning. Never updates application models or records."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time
import shutil


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.partial')
    temporary.write_text(json.dumps(value, indent=2), encoding='utf-8')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--stage', choices=('all', 'cache', 'train'), default='all')
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    if args.stage == 'all':
        for stage in ('cache', 'train'):
            command = [sys.executable, '-u', __file__, '--output', str(args.output), '--stage', stage]
            if args.resume or stage == 'train':
                command.append('--resume')
            result = subprocess.run(command)
            if result.returncode:
                if args.output.is_dir():
                    status = args.output/'STATUS.json'
                    previous = json.loads(status.read_text()) if status.exists() else None
                    write_json(status, dict(stage='stopped_with_error',failed_stage=stage,
                        exit_code=result.returncode,last_progress=previous,release_approved=False))
                raise SystemExit(result.returncode)
        return

    import gc
    import numpy as np
    import torch
    from torch.nn import functional as F
    from evaluate_safire import free_memory, sha, checked_path, WEIGHT_HASH, REVISION
    from safire_direct import (DATA, VERSION, SEED, verified_rows, prepare_model,
        extract, target_mask, direct_loss, choose_threshold)

    if free_memory() < 4 * 1024**3:
        raise RuntimeError('Need 4 GiB free RAM; close heavy apps and retry with --resume')
    if args.output.exists() and not args.resume:
        raise ValueError('Output exists; explicitly use --resume for this run')
    if args.resume and not args.output.is_dir():
        raise ValueError('No run to resume')
    if args.stage == 'cache' and shutil.disk_usage(args.output.resolve().parent).free < 4*1024**3:
        raise RuntimeError('At least 4 GiB free disk space required for the feature cache')
    rows, hashes = verified_rows()
    if (len(rows) != 600 or sum(r['split']=='train' for r in rows) != 480
            or sum(r['split']=='validation' for r in rows) != 120):
        raise ValueError('Unexpected declared dataset size')
    root = Path(__file__).parent
    identity = dict(architecture=VERSION, checkpoint_sha256=WEIGHT_HASH,
        source_revision=REVISION, manifest_sha256=sha(DATA/'training-manifest.csv'),
        asset_ledger_sha256=sha(DATA/'asset-sha256.json'),
        code_sha256={f:sha(root/f) for f in ('safire_direct.py','train_safire_direct.py','evaluate_safire.py')},
        seed=SEED, epochs=20, learning_rate=1e-5, weight_decay=.01, batch_size=1,
        cache_dtype='float32', cpu_threads=2, release_approved=False)
    args.output.mkdir(parents=True, exist_ok=True)
    protocol = args.output/'protocol.json'
    if protocol.exists():
        if json.loads(protocol.read_text()) != identity:
            raise ValueError('Run provenance changed; cannot resume')
    else:
        write_json(protocol, identity)
    cache = args.output/'cache'
    cache.mkdir(exist_ok=True)
    index_file = args.output/'cache-index.json'
    index = json.loads(index_file.read_text()) if index_file.exists() else []
    if len(index)>len(rows):
        raise ValueError('Unexpected cache length')
    for expected, record in zip(rows, index):
        if record['row'] != expected or record['input_sha256'] != hashes[expected['image']]:
            raise ValueError('Cache input/order mismatch')
        checked_path(cache, record['file'], record['sha256'])

    status_file = args.output/'STATUS.json'
    if args.stage == 'cache' and len(index) == len(rows):
        print('Complete feature cache verified.', flush=True)
        return
    if args.stage == 'train' and len(index) != len(rows):
        raise ValueError('Complete verified cache required')
    torch.manual_seed(SEED)
    model, direct = prepare_model()
    print('Pinned pretrained checkpoint loaded strictly. Production files unchanged.', flush=True)
    if args.stage == 'cache':
        started = time.monotonic()
        for i in range(len(index), len(rows)):
            if free_memory() < 3*1024**3:
                raise RuntimeError('Less than 3 GiB free RAM; cache saved, resume after freeing memory')
            row = rows[i]
            write_json(status_file, dict(stage='encoding', completed=i, total=len(rows),
                current_sample=row['sample_id'], release_approved=False))
            start = time.monotonic()
            features = extract(model, DATA/row['image'])
            file = cache/f'{i:04d}.npy'
            # A file left between save and index commit belongs to this same
            # checksum-verified run; recompute and replace only that exact file.
            temporary = file.with_suffix('.npy.partial')
            with temporary.open('wb') as handle:
                np.save(handle, features.numpy(), allow_pickle=False)
            temporary.replace(file)
            record = dict(row=row, input_sha256=hashes[row['image']], file=file.name,
                          sha256=sha(file), seconds=time.monotonic()-start)
            index.append(record)
            write_json(index_file,index)
            print(json.dumps(dict(stage='encoding',completed=i+1,total=len(rows),
                                  seconds=record['seconds'])),flush=True)
            del features
            gc.collect()
        write_json(status_file,dict(stage='cache_complete',completed=len(rows),
                                    seconds_this_session=time.monotonic()-started,release_approved=False))
        return

    # Separate process: encoder extraction allocations cannot accumulate
    # alongside decoder optimizer state. Retain only decoder and constants.
    del model
    gc.collect()
    train = [r for r in index if r['row']['split']=='train']
    validation = [r for r in index if r['row']['split']=='validation']
    optimizer = torch.optim.AdamW([p for p in direct.parameters() if p.requires_grad],lr=1e-5,weight_decay=.01)
    best = float('inf')
    first_epoch = 1
    history = []
    last = args.output/'last.pt'
    best_file = args.output/'best-decoder.pt'
    if last.exists():
        checkpoint = torch.load(last,weights_only=True,map_location='cpu')
        if checkpoint['identity'] != identity:
            raise ValueError('Checkpoint provenance mismatch')
        direct.load_state_dict(checkpoint['model'],strict=True)
        optimizer.load_state_dict(checkpoint['optimizer'])
        first_epoch=checkpoint['epoch']+1
        best=checkpoint['best_loss']
        history=checkpoint['history']

    def sample(record):
        path=checked_path(cache,record['file'],record['sha256'])
        values=np.load(path,allow_pickle=False)
        if values.dtype!=np.float32 or values.shape!=(1,256,64,64) or not np.isfinite(values).all():
            raise ValueError('Invalid cached embedding')
        return torch.from_numpy(values),target_mask(DATA/record['row']['mask'])

    def save_checkpoint(path,value):
        temporary=path.with_suffix('.pt.partial')
        torch.save(value,temporary)
        temporary.replace(path)

    def evaluate(collect=False):
        direct.eval()
        losses=[];probabilities=[];targets=[]
        with torch.no_grad():
            for record in validation:
                x,y=sample(record)
                logits=direct(x)
                losses.append(float(direct_loss(logits,y)))
                if collect:
                    p=F.interpolate(logits,(448,448),mode='bilinear',align_corners=False).sigmoid()
                    probabilities.append(p[0,0].numpy()); targets.append(y[0,0].numpy().astype(np.uint8))
        return float(np.mean(losses)),probabilities,targets

    for epoch in range(first_epoch,21):
        if free_memory()<2*1024**3:
            raise RuntimeError('Insufficient decoder-training RAM; resume from last completed epoch')
        start=time.monotonic();losses=[]
        direct.train()
        order=np.random.default_rng(SEED+epoch).permutation(len(train))
        for step,position in enumerate(order,1):
            x,y=sample(train[position])
            optimizer.zero_grad(set_to_none=True)
            loss=direct_loss(direct(x),y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(direct.parameters(),1.0,error_if_nonfinite=True)
            optimizer.step()
            losses.append(float(loss.detach()))
            del x,y,loss
            if step%40==0:
                state=dict(stage='training',epoch=epoch,epochs=20,step=step,total=len(train),release_approved=False)
                write_json(status_file,state);print(json.dumps(state),flush=True)
        optimizer.zero_grad(set_to_none=True)
        validation_loss,_,_=evaluate()
        if validation_loss<best:
            best=validation_loss
            save_checkpoint(best_file,dict(identity=identity,model=direct.state_dict(),epoch=epoch,validation_loss=best))
        entry=dict(epoch=epoch,train_loss=float(np.mean(losses)),validation_loss=validation_loss,
                   seconds=time.monotonic()-start)
        history.append(entry)
        save_checkpoint(last,dict(identity=identity,model=direct.state_dict(),optimizer=optimizer.state_dict(),
            epoch=epoch,best_loss=best,history=history))
        write_json(args.output/'history.json',history)
        print(json.dumps(entry),flush=True)
    best_checkpoint=torch.load(best_file,weights_only=True,map_location='cpu')
    direct.load_state_dict(best_checkpoint['model'],strict=True)
    _,p,t=evaluate(collect=True)
    np.savez_compressed(args.output/'validation-predictions.npz',probabilities=np.asarray(p),targets=np.asarray(t))
    write_json(args.output/'validation-order.json',[r['row'] for r in validation])
    decision=choose_threshold(p,t,[r['row'] for r in validation])
    decision.update(best_epoch=best_checkpoint['epoch'],best_checkpoint_sha256=sha(best_file))
    write_json(args.output/'validation-report.json',decision)
    write_json(status_file,dict(stage='completed',decision=decision,release_approved=False))
    print(json.dumps(decision),flush=True)


if __name__=='__main__':
    main()
