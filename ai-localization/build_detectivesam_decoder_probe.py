"""Read-only handoff to discriminate a concrete decoder-selection hypothesis."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parent
def sha(b):return hashlib.sha256(b).hexdigest()


def main():
    prior=ROOT/'handoff/AuthentiScan-DetectiveSAM-Balanced-Loss-Loyd-v2.zip'
    assert sha(prior.read_bytes())=='61a5ea2e3fd8cae1d0b78d472a30bf1426c2633e6d7354daa089affab42832e3'
    returned=Path('D:/Downloads/Return-to-Kent-DetectiveSAM-Balanced.zip')
    assert sha(returned.read_bytes())=='b1aa6f5751e6b7778f88c90c3dbce3b9debcf378154735db81857e9a582dbb82'
    with zipfile.ZipFile(prior) as p,zipfile.ZipFile(returned) as r:
        record=json.loads(r.read('results/RESULT.json'));cases=[c for c in json.loads(p.read('CASES.json')) if c['role']=='tiny_fit']
        entries={name:p.read(name) for name in ('training_core.py','fused_platform.py','process_lifecycle.py','THIRD-PARTY-NOTICES.md')}
        for case in cases:
            for field in ('image','mask'):entries[case[field]]=p.read(case[field])
        entries['CASES.json']=json.dumps(cases,indent=2).encode()
        entries['REFERENCE.json']=json.dumps({phase:[c for c in json.loads(r.read('results/'+phase+'/SUMMARY.json')) if c['role']=='tiny_fit'] for phase in ('before','after')},indent=2).encode()
        protocol=dict(base_release_sha256=record['protocol']['base_release_sha256'],
            adapter_checkpoint_sha256=record['adapter_checkpoint_sha256'],frozen_sha256=record['frozen_sha256_before'],
            initial_adapter_parameter_sha256=record['trainable_sha256_before'],trained_adapter_parameter_sha256=record['trainable_sha256_after'],
            trained_return_sha256=sha(returned.read_bytes()),training_steps=0,release_approved=False)
        entries['PROTOCOL.json']=json.dumps(protocol,indent=2).encode()
        entries['verify_package.py']=p.read('verify_package.py').replace(b'detectivesam-balanced-loss-v2',b'detectivesam-decoder-probe-v1').replace(b'training-output',b'probe-output')
        launcher=p.read('run_diagnostic.py').decode()
        launcher=launcher.replace("parser.add_argument('--base',type=Path,required=True);args=parser.parse_args()",
            "parser.add_argument('--base',type=Path,required=True);parser.add_argument('--adapters',type=Path,required=True);args=parser.parse_args()")
        launcher=launcher.replace("str(ROOT/'worker.py')","str(ROOT/'decoder_probe.py')").replace("'--output',str(output/'results')","'--adapters',str(args.adapters.resolve()),'--output',str(output/'results')")
        launcher=launcher.replace('training-output','probe-output').replace('1800','900').replace('Return-to-Kent-DetectiveSAM-Balanced.zip','Return-to-Kent-DetectiveSAM-Decoder.zip')
        launcher=launcher.replace('One diagnostic started.','One read-only decoder probe started.')
        entries['run_probe.py']=launcher.encode()
    entries['decoder_probe.py']=(ROOT/'detectivesam-training/decoder_probe.py').read_bytes()
    entries['START-HERE.md']=(ROOT/'detectivesam-training/DECODER-START-HERE.md').read_bytes()
    release=dict(purpose='detectivesam-decoder-probe-v1',release_approved=False,model_probe_executed=False,
                 files={n:sha(b) for n,b in entries.items()})
    target=ROOT/'handoff/AuthentiScan-DetectiveSAM-Decoder-Probe-Loyd-v1.zip'
    with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED) as z:
        for n,b in entries.items():z.writestr(n,b)
        z.writestr('RELEASE.json',json.dumps(release,indent=2))
    with zipfile.ZipFile(target) as z:
        for n,h in release['files'].items():
            assert sha(z.read(n))==h
            if n.endswith('.py'):compile(z.read(n),n,'exec')
    info=dict(path=str(target),bytes=target.stat().st_size,sha256=sha(target.read_bytes()),payloads=len(entries),actual_model_probe_run=False)
    target.with_suffix('.json').write_text(json.dumps(info,indent=2));print(json.dumps(info,indent=2))


if __name__=='__main__':main()
