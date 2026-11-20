"""Offline parity check of the service pipeline against frozen benchmark maps.

This does not start HTTP, create an approved policy, or enable the web adapter.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
from localizer_service import FrozenPipeline


def verify(job_root: Path) -> dict:
    sys.path.insert(0,str(Path(__file__).parent/'vendor/trail-image-edit-localization/src'))
    from trail.core import median3
    from trail.data import read_manifest,resolve_relative,sha256_file
    run_root=job_root/'inference'
    run=json.loads((run_root/'run.json').read_text())
    manifest=job_root/'prepared/manifest.csv'
    if sha256_file(manifest)!=run['manifest_sha256'] or not run['mask_blind_inference']:
        raise ValueError('Inference provenance mismatch')
    if run['model']['model_key']!='dinov2_vits14' or run['model']['layers']!=[11]:
        raise ValueError('Unexpected model')
    if any(run['configuration'].get(k)!=v for k,v in dict(family='haar',strength=.2,application='global',replicates=1).items()):
        raise ValueError('Unexpected frozen configuration')
    records={r['sample_id']:r for r in run['records']}
    selected=[r for r in read_manifest(manifest) if r['split']=='dev'][:3]
    pipeline=FrozenPipeline();checks=[]
    for row in selected:
        artifact=resolve_relative(run_root,records[row['sample_id']]['file'])
        if sha256_file(artifact)!=records[row['sample_id']]['sha256']:raise ValueError('Artifact checksum mismatch')
        with np.load(artifact,allow_pickle=False) as data:expected=median3(data['scores'][0])
        payload=resolve_relative(job_root/'prepared',row['image']).read_bytes()
        start=time.perf_counter();actual,size,digest=pipeline.score(payload);duration=time.perf_counter()-start
        np.testing.assert_allclose(actual,expected,rtol=0,atol=1e-6)
        if size!=(448,448) or digest!=hashlib.sha256(payload).hexdigest():raise ValueError('Input identity mismatch')
        checks.append(dict(sample_id=row['sample_id'],maximum_absolute_difference=float(np.max(np.abs(actual-expected))),seconds=duration))
    result=dict(status='passed',production_enabled=False,scope='First three frozen development samples only; not an accuracy test',checks=checks)
    output=job_root/'runtime-parity.json'
    if output.exists():raise FileExistsError(output)
    output.write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf-8')
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--job-root',type=Path,required=True)
    print(json.dumps(verify(parser.parse_args().job_root.resolve()),indent=2))
