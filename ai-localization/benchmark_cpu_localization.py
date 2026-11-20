"""Bounded CPU timing check, using training assets only. No model is saved."""
import argparse
import ctypes
import gc
import io
import json
import math
import os
from pathlib import Path
import platform
import time

import numpy as np
import torch

from supervised_localizer import FeatureExtractor, MaskHead, REVISION, mask_loss, relative_file, training_rows
from train_supervised_localization import seed_everything, target_for, validate_assets

ROOT = Path(__file__).resolve().parent


def memory_bytes():
    if os.name != 'nt':
        return None
    class Counters(ctypes.Structure):
        _fields_ = [('cb', ctypes.c_ulong), ('faults', ctypes.c_ulong)] + [
            (name, ctypes.c_size_t) for name in ('peak', 'working', 'pool_peak', 'pool',
                                                'nonpool_peak', 'nonpool', 'page', 'page_peak')]
    counters = Counters()
    counters.cb = ctypes.sizeof(counters)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    psapi = ctypes.WinDLL('psapi', use_last_error=True)
    psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_ulong]
    if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        raise ctypes.WinError(ctypes.get_last_error())
    return {'peak_working_set': counters.peak, 'working_set': counters.working}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    started = time.perf_counter()
    seed_everything()  # Two CPU threads, same seed and architecture as the GPU experiment.
    data = ROOT / 'datasets/supervised-localization-v1'
    rows = training_rows(data)
    samples = [row for row in rows if row['split'] == 'train'][:6]
    if len(samples) != 6:
        raise ValueError('Expected six training samples')
    validate_assets(data, samples)
    print('Loading existing pinned encoder; CPU only, two threads.', flush=True)
    extractor = FeatureExtractor(ROOT / f'weights/hub/facebookresearch_dinov2_{REVISION}',
                                 ROOT / 'weights/hub/checkpoints/dinov2_vits14_pretrain.pth', 'cpu')
    load_seconds = time.perf_counter() - started
    records, features, targets = [], [], []
    for row in samples:
        tick = time.perf_counter()
        feature = extractor(relative_file(data, row['image']).read_bytes())
        target = target_for(data, row)
        extraction_seconds = time.perf_counter() - tick
        tick = time.perf_counter()
        buffer = io.BytesIO()
        np.savez_compressed(buffer, features=feature, target=target)
        compression_seconds = time.perf_counter() - tick
        record = dict(sample_id=row['sample_id'], split=row['split'], extraction_seconds=extraction_seconds,
                      compression_seconds=compression_seconds, compressed_bytes=buffer.tell())
        records.append(record)
        features.append(feature)
        targets.append(target)
        print(json.dumps(record), flush=True)
    del extractor
    gc.collect()
    # Repeated samples measure batch-8 compute, NOT accuracy or generalization.
    x = torch.from_numpy(np.stack([features[i % 6] for i in range(8)]).astype(np.float32))
    y = torch.from_numpy(np.stack([targets[i % 6] for i in range(8)])).unsqueeze(1)
    model = MaskHead()
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=.0001)
    train_times, eval_times = [], []
    for index in range(6):
        tick = time.perf_counter()
        model.train()
        loss = mask_loss(model(x), y)
        if not torch.isfinite(loss):
            raise ValueError('Nonfinite benchmark loss')
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.)
        optimizer.step()
        train_times.append(time.perf_counter() - tick)
        tick = time.perf_counter()
        model.eval()
        with torch.inference_mode():
            mask_loss(model(x), y)
        eval_times.append(time.perf_counter() - tick)
        print(f'Batch timing {index + 1}/6 complete', flush=True)
    ntrain = sum(row['split'] == 'train' for row in rows)
    nval = sum(row['split'] == 'validation' for row in rows)
    cache_estimate = len(rows) * float(np.mean([r['extraction_seconds'] + r['compression_seconds'] for r in records]))
    train_estimate = 20 * (math.ceil(ntrain / 8) * float(np.mean(train_times[1:])) +
                           math.ceil(nval / 8) * float(np.mean(eval_times[1:])))
    result = dict(status='passed', benchmark_only=True, training_complete=False, production_enabled=False,
                  test_images_used=0, validation_images_used=0, threads=torch.get_num_threads(),
                  python=platform.python_version(), torch=torch.__version__, samples=records,
                  encoder_load_seconds=load_seconds, batch8_train_seconds=train_times,
                  batch8_eval_seconds=eval_times, memory=memory_bytes(),
                  estimated_cache_bytes=int(len(rows) * np.mean([r['compressed_bytes'] for r in records])),
                  estimated_cache_minutes=cache_estimate / 60,
                  estimated_20_epochs_compute_minutes=train_estimate / 60,
                  elapsed_seconds=time.perf_counter() - started,
                  caveat='Six training images only. Estimates exclude cache reads, checkpoints, final validation selection and thermal slowdown. No model retained.')
    (args.output / 'benchmark.json').write_text(json.dumps(result, indent=2, allow_nan=False), encoding='utf-8')
    print(json.dumps(result, indent=2), flush=True)


if __name__ == '__main__':
    main()
