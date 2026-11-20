"""Small source/data-only handoff; checkpoints are acquired from authors on Loyd."""
import hashlib
import json
from pathlib import Path
import zipfile
from evaluate_fused_candidate import ROOT, DATA, selected_rows, digest

PURPOSE='detectivesam-target-only-screen-v1'


def main():
    pre=ROOT/'candidates/detectivesam-preflight';entries={}
    github=json.loads((pre/'github.json').read_text());weights=json.loads((pre/'weights.json').read_text())
    for base in ('source','sam2-source','deps'):
        for path in (pre/base).rglob('*'):
            if path.is_file() and '__pycache__' not in path.parts and path.suffix!='.pyc' and 'bin' not in path.relative_to(pre/base).parts:
                entries[path.relative_to(pre).as_posix()]=path.read_bytes()
    for name in ('candidate_worker.py','setup_candidate.py'):
        entries[name]=(ROOT/'detectivesam-handoff'/name).read_bytes()
    entries['fused_platform.py']=(ROOT/'fused_platform.py').read_bytes()
    entries['process_lifecycle.py']=(ROOT.parent/'ai-scene/process_lifecycle.py').read_bytes()
    verify=(ROOT/'fused-handoff/verify_package.py').read_text().replace('fused-sofake-nine-image-cpu-evaluation-v1',PURPOSE)
    start=verify.index('    # Extra Python');end=verify.index('    return hashlib',start)
    verify=verify[:start]+'''    for folder in ('source','sam2-source','deps','images','masks'):
        for path in (ROOT/folder).rglob('*'):
            if path.is_file() and '__pycache__' not in path.parts:
                relative=path.relative_to(ROOT).as_posix()
                assets=json.loads((ROOT/'ASSETS.json').read_text())
                allowed={"source/"+a['file'] for a in assets}
                if relative not in release['files'] and relative not in allowed and not any(relative==a+'.partial' for a in allowed):
                    raise ValueError('Unexpected package file: '+relative)
''' +verify[end:]
    entries['verify_package.py']=verify.encode()
    runner=(ROOT/'fused-handoff/run_evaluation.py').read_text().replace('fused-sofake-nine-image-cpu-evaluation-v1',PURPOSE)
    runner=runner.replace("str(ROOT / 'ai-localization/evaluate_fused_candidate.py')", "str(ROOT / 'candidate_worker.py')")
    runner=runner.replace("'--require-author-runtime', '--checkpoint', 'sofake', '--output'", "'--output'")
    runner=runner.replace('Return-to-Kent-FUSED.zip','Return-to-Kent-DetectiveSAM.zip')
    entries['run_evaluation.py']=runner.encode()
    assets=[]
    for name in ('checkpoints/detective_sam_sota.pth','sam2configs/sam2.1_hiera_base_plus.pt'):
        record=next(r for r in weights['siblings'] if r['rfilename']==name)
        assets.append(dict(file=name,bytes=record['size'],sha256=record['lfs']['sha256'],
            url=f"https://huggingface.co/Gertlek/DetectiveSAM/resolve/{weights['sha']}/{name}"))
    entries['ASSETS.json']=json.dumps(assets,indent=2).encode()
    cases=[]
    for row in selected_rows():
        sample=row['sample_id'];image=ROOT/'runs/fused-failure-review-2026-10-26-r3/native-assets'/(sample+'.png');mask=DATA/row['mask']
        image_name='images/'+sample+'.png';mask_name='masks/'+sample+'.png'
        entries[image_name]=image.read_bytes();entries[mask_name]=mask.read_bytes()
        cases.append(dict(sample_id=sample,condition=row['condition'],image=image_name,mask=mask_name,image_sha256=digest(image),mask_sha256=digest(mask)))
    entries['CASES.json']=json.dumps(cases,indent=2).encode()
    entries['START-HERE.md']=(ROOT/'detectivesam-handoff/START-HERE.md').read_bytes()
    entries['THIRD-PARTY-NOTICES.md']=b'''# Evaluation sources

DetectiveSAM code: https://github.com/Gertlek/DetectiveSAM (MIT; source/LICENSE).
SAM2 1.1.0: Meta Platforms, Apache-2.0; sam2-source/LICENSE.
Bundled Python dependencies retain their distribution license notices.
Nine images/masks: TGIF2 development examples, https://github.com/IDLabMedia/tgif-dataset,
CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/ . Mask scoring copies
resized to 448 square; native image bytes preserved. Source IDs retained in CASES.
Checkpoints are NOT bundled. Acquire exact official public files using setup_candidate.py.
DetectiveSAM model card lists license other and unresolved broader redistribution terms.
This package is for isolated local academic evaluation, not public distribution of
weights or deployment. Technical success does not resolve those terms or accuracy.
'''
    release=dict(purpose=PURPOSE,source_revision=github['sha'],weights_revision=weights['sha'],
        sam2_version='1.1.0',release_approved=False,model_inference_tested=False,
        files={n:hashlib.sha256(b).hexdigest() for n,b in entries.items()})
    output=ROOT/'handoff/AuthentiScan-DetectiveSAM-Evaluation-Loyd-v1.zip'
    with zipfile.ZipFile(output,'x',zipfile.ZIP_DEFLATED) as z:
        for n,b in entries.items():z.writestr(n,b)
        z.writestr('RELEASE.json',json.dumps(release,indent=2))
    with zipfile.ZipFile(output) as z:
        for n,expected in release['files'].items():
            assert hashlib.sha256(z.read(n)).hexdigest()==expected
            if n.endswith('.py'):compile(z.read(n),n,'exec')
    metadata=dict(file=str(output),bytes=output.stat().st_size,sha256=digest(output),files=len(entries),verified=True,model_inference_tested=False)
    output.with_suffix('.json').write_text(json.dumps(metadata,indent=2));print(json.dumps(metadata,indent=2))


if __name__=='__main__':main()
