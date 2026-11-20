"""Build matched paired-loss arms from the verified balanced-v2 package."""
import json
import zipfile
from pathlib import Path
import hashlib

ROOT=Path(__file__).resolve().parent
def sha(b):return hashlib.sha256(b).hexdigest()


def main():
    source=ROOT/'handoff/AuthentiScan-DetectiveSAM-Balanced-Loss-Loyd-v2.zip'
    assert sha(source.read_bytes())=='61a5ea2e3fd8cae1d0b78d472a30bf1426c2633e6d7354daa089affab42832e3'
    with zipfile.ZipFile(source) as z:
        release=json.loads(z.read('RELEASE.json'))
        entries={n:z.read(n) for n in release['files']}
        assert all(sha(entries[n])==h for n,h in release['files'].items())
    worker=entries['worker.py'].decode()
    def replace(old,new):
        nonlocal worker
        assert worker.count(old)==1,old
        worker=worker.replace(old,new)
    replace("parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()",
            "parser.add_argument('--output',type=Path,required=True);parser.add_argument('--arm',choices=('control','contrast'),required=True);args=parser.parse_args()")
    replace("method='custom adapter-only paired diagnostic; not author training reproduction')",
            "method='matched paired-learning comparison; custom adapter-only diagnostic',arm=args.arm,contrast_weight=1.0 if args.arm=='contrast' else 0.0)")
    replace('        params=configure(model,True)\n',
            "        report['baseline_summary_sha256']=digest(out/'before/SUMMARY.json')\n        from paired_learning import paired_objective,paired_schedule\n        params=configure(model,True)\n")
    replace("for step,case in enumerate(schedule(cases,protocol['steps']),1):",
            "for step,(original_case,case) in enumerate(paired_schedule(cases,protocol['steps']),1):")
    replace("                logits=model(orig,streams);loss=objective(logits,truth)",
            """                original,original_streams=inputs(original_case)
                # Same pass order and RNG consumption in both arms. Each inference
                # sees one image; only the training loss knows the correspondence.
                original_logits=model(original,original_streams)
                logits=model(orig,streams)
                loss,base_loss,contrast_loss=paired_objective(original_logits,logits,truth,report['contrast_weight'])""")
    replace("record=dict(step=step,sample_id=case['sample_id'],condition=case['condition'],loss=float(loss.detach()),gradient_norm=grad_norm)",
            "record=dict(step=step,sample_id=case['sample_id'],original_sample_id=original_case['sample_id'],condition=case['condition'],loss=float(loss.detach()),base_loss=float(base_loss),contrast_loss=float(contrast_loss),gradient_norm=grad_norm)")
    replace('                del orig,streams,truth,logits,loss',
            '                del orig,streams,truth,logits,loss,original,original_streams,original_logits,base_loss,contrast_loss')
    entries['paired_worker.py']=worker.encode()
    entries['worker.py']=(ROOT/'detectivesam-training/paired_controller.py').read_bytes()
    entries['paired_learning.py']=(ROOT/'detectivesam-training/paired_learning.py').read_bytes()
    entries['START-HERE.md']=(ROOT/'detectivesam-training/PAIRED-START-HERE.md').read_bytes()
    entries['run_diagnostic.py']=entries['run_diagnostic.py'].replace(b'Return-to-Kent-DetectiveSAM-Balanced.zip',b'Return-to-Kent-DetectiveSAM-Paired.zip')
    entries['verify_package.py']=entries['verify_package.py'].replace(b'detectivesam-balanced-loss-v2',b'detectivesam-paired-contrast-v1')
    protocol=json.loads(entries['PROTOCOL.json'])
    protocol.update(steps=240,images_per_optimizer_update=2,arms=['control','contrast'],
        contrast_weights=[0.,1.],contrast_margin_logits=1.,
        loss='mean pair balanced losses; contrast arm adds within-edit softplus(1 - edited_logit + original_logit)',
        comparison='Fresh matched control versus paired contrast; same original weights and schedule',
        shared_worker_timeout_seconds=1800)
    entries['PROTOCOL.json']=json.dumps(protocol,indent=2).encode()
    allowed={'worker.py','START-HERE.md','run_diagnostic.py','verify_package.py','PROTOCOL.json','CHANGE-RECORD.json'}
    unchanged=[n for n in release['files'] if n not in allowed]
    assert all(sha(entries[n])==release['files'][n] for n in unchanged)
    entries['CHANGE-RECORD.json']=json.dumps(dict(parent_package_sha256=sha(source.read_bytes()),
        changed_files=sorted(allowed),added_files=['paired_worker.py','paired_learning.py'],
        unchanged_files_verified=len(unchanged),case_data_unchanged=True,training_core_unchanged=True,
        inference_or_decoder_changes=False,single_image_inference=True,
        control_required_because_optimizer_schedule_changes=True),indent=2).encode()
    manifest=dict(purpose='detectivesam-paired-contrast-v1',release_approved=False,actual_learning_tested=False,
                  files={n:sha(b) for n,b in entries.items()})
    target=ROOT/'handoff/AuthentiScan-DetectiveSAM-Paired-Loyd-v1.zip'
    with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED) as z:
        for n,b in entries.items():z.writestr(n,b)
        z.writestr('RELEASE.json',json.dumps(manifest,indent=2))
    with zipfile.ZipFile(target) as z:
        for n,h in manifest['files'].items():
            assert sha(z.read(n))==h
            if n.endswith('.py'):compile(z.read(n),n,'exec')
    result=dict(path=str(target),bytes=target.stat().st_size,sha256=sha(target.read_bytes()),
                payloads=len(entries),full_model_run_tested=False)
    target.with_suffix('.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))


if __name__=='__main__':main()
