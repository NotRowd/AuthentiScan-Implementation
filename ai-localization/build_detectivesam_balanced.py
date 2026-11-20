"""Derive an isolated loss-only comparison from the verified v1 diagnostic."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parent
def sha(data):return hashlib.sha256(data).hexdigest()


def main():
    base=ROOT/'handoff/AuthentiScan-DetectiveSAM-Diagnostic-Loyd-v1.zip'
    if sha(base.read_bytes())!='0449a930c29210fc605472c00c4fac652912292543423c9681333ab0887de26f':raise ValueError('v1 package changed')
    with zipfile.ZipFile(base) as z:
        release=json.loads(z.read('RELEASE.json'))
        entries={n:z.read(n) for n in release['files']}
        assert all(sha(entries[n])==h for n,h in release['files'].items())
    returned=Path('D:/Downloads/Return-to-Kent-DetectiveSAM-Diagnostic.zip')
    if sha(returned.read_bytes())!='04e21a4a2e3bbdfdf0d21d2721cf9f9f374e0e4595f7418c76290529f9867067':raise ValueError('v1 return changed')
    with zipfile.ZipFile(returned) as z:
        report=json.loads(z.read('results/RESULT.json'))
        reference={k:report[k] for k in ('frozen_sha256_before','trainable_sha256_before')}
        reference.update(before=json.loads(z.read('results/before/SUMMARY.json')),
                         after=json.loads(z.read('results/after/SUMMARY.json')),return_sha256=sha(returned.read_bytes()),
                         release_sha256=report['release_sha256'])
    entries['V1-REFERENCE.json']=json.dumps(reference,indent=2).encode()
    for name in ('balanced_loss.py','comparison_guard.py'):
        entries[name]=(ROOT/'detectivesam-training'/name).read_bytes()
    worker=entries['worker.py'].decode()
    old='        before=evaluate(\'before\')\n'
    assert worker.count(old)==1
    worker=worker.replace(old,'''        # Bind only the changed objective; sampling/model/optimizer stay v1.
        from balanced_loss import objective
        from comparison_guard import check_baseline
        reference=json.loads((ROOT/'V1-REFERENCE.json').read_text())
        before=evaluate('before')
        report['matched_v1_baseline']=check_baseline(report,before,reference)
        save()
''')
    old="        report['decision']=decision(before,after)\n"
    assert worker.count(old)==1
    worker=worker.replace(old,old+"        report['historical_v1_decision']=decision(reference['before'],reference['after'])\n")
    entries['worker.py']=worker.encode()
    entries['run_diagnostic.py']=entries['run_diagnostic.py'].replace(b'Return-to-Kent-DetectiveSAM-Diagnostic.zip',b'Return-to-Kent-DetectiveSAM-Balanced.zip')
    entries['verify_package.py']=entries['verify_package.py'].replace(b'detectivesam-paired-diagnostic-v1',b'detectivesam-balanced-loss-v2')
    protocol=json.loads(entries['PROTOCOL.json'])
    protocol.update(loss='per-image class-balanced BCE plus unchanged edited-only Dice',
                    comparison='Historical v1; same initial weights, cases, seed, schedule and settings',
                    v1_return_sha256=reference['return_sha256'])
    entries['PROTOCOL.json']=json.dumps(protocol,indent=2).encode()
    entries['START-HERE.md']=(ROOT/'detectivesam-training/BALANCED-START-HERE.md').read_bytes()
    allowed={'worker.py','run_diagnostic.py','verify_package.py','PROTOCOL.json','START-HERE.md'}
    unchanged=[n for n in release['files'] if n not in allowed]
    assert all(sha(entries[n])==release['files'][n] for n in unchanged)
    entries['CHANGE-RECORD.json']=json.dumps(dict(v1_package_sha256=sha(base.read_bytes()),
        changed_files=sorted(allowed),added_files=['balanced_loss.py','comparison_guard.py','V1-REFERENCE.json'],
        unchanged_files_verified=len(unchanged),training_core_unchanged=True,case_data_unchanged=True,
        model_or_sampling_or_optimizer_changes=False),indent=2).encode()
    release=dict(purpose='detectivesam-balanced-loss-v2',release_approved=False,actual_learning_tested=False,
                 files={n:sha(b) for n,b in entries.items()})
    target=ROOT/'handoff/AuthentiScan-DetectiveSAM-Balanced-Loss-Loyd-v2.zip'
    with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED) as z:
        for name,payload in entries.items():z.writestr(name,payload)
        z.writestr('RELEASE.json',json.dumps(release,indent=2))
    with zipfile.ZipFile(target) as z:
        for n,h in release['files'].items():
            assert sha(z.read(n))==h
            if n.endswith('.py'):compile(z.read(n),n,'exec')
    result=dict(path=str(target),bytes=target.stat().st_size,sha256=sha(target.read_bytes()),payloads=len(entries),
                full_model_run_tested=False,unchanged_v1_files=len(unchanged))
    target.with_suffix('.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))


if __name__=='__main__':main()
