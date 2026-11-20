"""Build a small, self-verifying add-on reusing Loyd's existing model package."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parent


def sha(data): return hashlib.sha256(data).hexdigest()


def main():
    old=ROOT/'handoff/AuthentiScan-DetectiveSAM-Evaluation-Loyd-v1.zip'
    if sha(old.read_bytes())!='9dce1317292331acbfcf30fe80b4c86c9db0f4a74860a515340cae1647013ac2':
        raise ValueError('Base handoff changed')
    with zipfile.ZipFile(old) as z:base_release=sha(z.read('RELEASE.json'))
    source=ROOT/'detectivesam-training'
    entries={p.name:p.read_bytes() for p in source.iterdir() if p.is_file() and p.suffix in ('.py','.md')}
    entries['fused_platform.py']=(ROOT/'fused_platform.py').read_bytes()
    entries['process_lifecycle.py']=(ROOT.parent/'ai-scene/process_lifecycle.py').read_bytes()
    manifest=ROOT/'runs/detectivesam-training-readiness-2026-10-27/PROPOSED-CASES.json'
    original=json.loads(manifest.read_text());data=ROOT/'datasets/supervised-localization-v1'
    ledger=json.loads((data/'asset-sha256.json').read_text());cases=[]
    for row in original:
        item={k:row[k] for k in ('sample_id','source_id','role','condition','split')}
        for field,folder in (('image','images'),('mask','masks')):
            payload=(data/row[field]).read_bytes()
            if sha(payload)!=ledger[row[field]]:raise ValueError('Data hash mismatch')
            name=folder+'/'+row['sample_id']+'.png';entries[name]=payload
            item[field]=name;item[field+'_sha256']=sha(payload)
        cases.append(item)
    entries['CASES.json']=json.dumps(cases,indent=2).encode()
    protocol=dict(base_release_sha256=base_release,seed=20261028,steps=480,learning_rate=1e-5,weight_decay=.01,
                  batch_size=1,device='cuda',dtype='float32',threshold=.5,train_sources=4,holdout_sources=12,
                  paired_case_plan_sha256=sha(manifest.read_bytes()),release_approved=False,custom_training=True,
                  independent_test=False,train_to_authentic_sampling='50 percent original; 25 percent each edit type',
                  diagnostic_rules='Fixed in training_core.decision; no threshold tuning or production integration')
    entries['PROTOCOL.json']=json.dumps(protocol,indent=2).encode()
    entries['THIRD-PARTY-NOTICES.md']=b'''# Local academic diagnostic

TGIF2 data: https://github.com/IDLabMedia/tgif-dataset, CC BY-SA 4.0,
https://creativecommons.org/licenses/by-sa/4.0/ . Image/mask copies resized to 448
square. Original source IDs and conditions preserved in CASES.json.
Existing DetectiveSAM source retains its MIT notice; bundled SAM2 is Apache-2.0.
No model weights are distributed by this add-on. Checkpoint terms for derivatives
and public use remain unresolved; this local diagnostic does not authorize release.
'''
    release=dict(purpose='detectivesam-paired-diagnostic-v1',release_approved=False,gpu_training_tested=False,
                 files={n:sha(b) for n,b in entries.items()})
    target=ROOT/'handoff/AuthentiScan-DetectiveSAM-Diagnostic-Loyd-v1.zip'
    with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED) as z:
        for name,payload in entries.items():z.writestr(name,payload)
        z.writestr('RELEASE.json',json.dumps(release,indent=2))
    with zipfile.ZipFile(target) as z:
        for name,expected in release['files'].items():
            if sha(z.read(name))!=expected:raise ValueError('ZIP verification failed')
            if name.endswith('.py'):compile(z.read(name),name,'exec')
    result=dict(path=str(target),bytes=target.stat().st_size,sha256=sha(target.read_bytes()),payloads=len(entries),
                actual_checkpoint_training_tested=False)
    target.with_suffix('.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))


if __name__=='__main__':main()
