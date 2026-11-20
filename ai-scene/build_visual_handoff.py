"""Build a self-contained diagnostic for Loyd, with no private scan images."""
import hashlib
import json
from pathlib import Path
import zipfile
from prepare_visual_candidate import PLAN,DEST,digest
from run_visual_candidate import verify_assets

ROOT=Path(__file__).resolve().parent
PROJECT=ROOT.parent


def main():
    exe=verify_assets()
    output=ROOT/'handoff/AuthentiScan-Visual-Review-Loyd-v1.zip'
    if output.exists() or output.with_suffix('.json').exists(): raise FileExistsError(output)
    files={}
    for name in ('qwen_service.py','scene_service.py','visual_errors.py','prepare_model.py','process_lifecycle.py',
                 'prepare_visual_candidate.py','run_visual_candidate.py','evaluate_visual_candidate.py','visual-candidate.json'):
        files['ai-scene/'+name]=ROOT/name
    files['ai-scene/fused_platform.py']=PROJECT/'ai-localization/fused_platform.py'
    files['process_lifecycle.py']=ROOT/'process_lifecycle.py'
    files['visual_worker.py']=ROOT/'loyd-handoff/visual_worker.py'
    files['verify_package.py']=ROOT/'loyd-handoff/verify_package.py'
    files['licenses/LLAMA-LICENSE.txt']=ROOT/'loyd-handoff/licenses/LLAMA-LICENSE.txt'
    files['licenses/APACHE-2.0.txt']=PROJECT/'ai-localization/candidates/fused-v1/runtime-2.9/Lib/site-packages/packaging-26.3.dist-info/licenses/LICENSE.APACHE'
    prefix='ai-scene/weights/'+PLAN['candidate_id']+'/'
    for record in PLAN['files']: files[prefix+record['name']]=DEST/record['name']
    files[prefix+PLAN['runtime']['file']]=DEST/PLAN['runtime']['file']
    with zipfile.ZipFile(DEST/PLAN['runtime']['file']) as z:
        for entry in z.infolist():
            if not entry.is_dir():
                files[prefix+'runtime-'+PLAN['runtime']['release']+'/'+entry.filename]=exe.parent/entry.filename
    data=PROJECT/'ai-localization/datasets/supervised-localization-v1'
    hashes=json.loads((data/'asset-sha256.json').read_text())
    cases=[]
    selections=[('project-logo',PROJECT/'firebase-local/src/assets/logo.png',
        'Describe a stylized shield/logo. Do not invent photographic anatomy or lighting defects; artwork is not evidence of manipulation.'),
        ('sheep-original',data/'assets/train/real/5992.png',
        'Describe sheep near a brick wall. Do not invent a physical inconsistency from wool texture, shadows or occlusion.'),
        ('fence-original',data/'assets/train/real/11122.png',
        'Describe a chain-link fence and sign. Fence occlusion and a post alone are not evidence of edits. Do not invent scene details.'),
        ('fence-edited',data/'assets/train/fake/segm_flux1dev/11122.png',
        'Describe the visible fence and altered sign without claiming AI provenance. A plausible edited sign need not have a visible physical inconsistency; do not force a concern.')]
    for sample,path,expectation in selections:
        if sample!='project-logo':
            assert digest(path)==hashes[path.relative_to(data).as_posix()]
        name='images/'+sample+'.png';files[name]=path
        cases.append(dict(sample_id=sample,file=name,sha256=digest(path),human_review_expectation=expectation))
    runner=(PROJECT/'ai-localization/fused-handoff/run_evaluation.py').read_text()
    runner=runner.replace('fused-sofake-nine-image-cpu-evaluation-v1','visual-service-diagnostic-loyd-v1')
    runner=runner.replace("str(ROOT / 'ai-localization/evaluate_fused_candidate.py')", "str(ROOT / 'visual_worker.py')")
    runner=runner.replace("'--require-author-runtime', '--checkpoint', 'sofake', '--output'", "'--output'")
    runner=runner.replace('Return-to-Kent-FUSED.zip','Return-to-Kent-Visual-Review.zip')
    guide='''# Visual-review service diagnostic for Loyd

This is a separate test of the current Qwen visual reviewer, NOT FUSED training.
It checks the real HTTP adapter, startup, browser-origin blocking, a busy response,
shared description/features cache, and actual observations on four fixed public
development images. The model/prompt remain unchanged. This is not a complete
anomaly-quality benchmark and does not establish readiness for publication.

1. Extract into a NEW folder. Keep previous FUSED folders and results intact.
2. Close unused apps. Need >=4 GiB free RAM and about 5 GiB free disk space.
   Ports 5005 and 5007 must be free; never stop an unrelated process automatically.
3. Use Python 3.11 and Pillow 12.1.0 from the existing FUSED .venv. No PyTorch
   or CUDA is used by this test. All visual weights and Windows runtime are included.
4. In PowerShell inside this NEW folder (adjust the existing .venv path if needed):

   & 'E:\\Download\\AuthentiScan-FUSED-Evaluation-Loyd-v1\\.venv\\Scripts\\python.exe' -c "import sys,PIL; assert sys.version_info[:2]==(3,11); assert PIL.__version__=='12.1.0'; print('Runtime ready')"
   & 'E:\\Download\\AuthentiScan-FUSED-Evaluation-Loyd-v1\\.venv\\Scripts\\python.exe' verify_package.py
   & 'E:\\Download\\AuthentiScan-FUSED-Evaluation-Loyd-v1\\.venv\\Scripts\\python.exe' -u run_visual_test.py

Run once. Keep the launcher and PC awake until it exits. One worker is bounded to
30 minutes. It only terminates its owned processes and preserves failure evidence.
Do not change settings, use GPU, install dependencies, download models, train,
retry automatically, or modify AuthentiScan/Grad-CAM. If the existing environment
is missing/incompatible, stop and report; do not substitute versions silently.

Progress: evaluation-output/results/RESULT.json
Send Kent: evaluation-output/Return-to-Kent-Visual-Review.zip, even on failure.
The return includes model text and diagnostic logs, not model weights or photos.

The first case deliberately sends a second request while the model is busy.
The current adapter may answer that probe with HTTP 503. It is recorded separately
from the normal sequential requests; do not treat it as an instruction to retry.
Each successful sequential description/features/cache group should need exactly
one model inference. Claims about actual image content require human review;
successful HTTP/JSON/cache checks alone do not establish factual reliability.
No remote inference, Firebase writes, user accounts, credits or classifier calls.
'''
    notices='''# Provenance and scope

Qwen3-VL-2B-Instruct-GGUF (Qwen contributors), revision
52d6c8ffea26cc873ac5ad116f8631268d7eb503. Repository metadata records Apache-2.0;
the included standard Apache-2.0 text applies as indicated by that distribution.
https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF
Weights and projector are unchanged; pins are in ai-scene/visual-candidate.json.

llama.cpp Windows CPU release b11696, ggml-org/llama.cpp. The upstream MIT license
is included with its copyright notice. The pinned binary archive and every
extracted file are preserved, including LICENSE-LLVM-OpenMP.
https://github.com/ggml-org/llama.cpp/tree/b11696

Three TGIF2 development images (sources 5992 and 11122), from IDLabMedia/tgif-dataset,
metadata commit fc5c557bd1a2d49a5dabc3676a54cfc44798f4ea. Prepared derivatives were
RGB bicubic resized to 448-square. License CC BY-SA 4.0:
https://creativecommons.org/licenses/by-sa/4.0/
https://github.com/IDLabMedia/tgif-dataset
The AuthentiScan project logo is supplied by Kent's project for private team testing.
No private classroom photo or saved user scan is included. No sealed-test samples.
This package is for the project-team diagnostic, not public product distribution.
'''
    memory={'run_visual_test.py':runner.encode(),'START-HERE.md':guide.encode(),
        'THIRD-PARTY-NOTICES.md':notices.encode(),'CASES.json':json.dumps(cases,indent=2).encode()}
    release=dict(purpose='visual-service-diagnostic-loyd-v1',deployment_approved=False,
        accuracy_validated=False,model_or_prompt_changed=False,files={n:digest(p) for n,p in files.items()})
    release['files'].update({n:hashlib.sha256(b).hexdigest() for n,b in memory.items()})
    output.parent.mkdir(parents=True,exist_ok=True)
    partial=output.with_suffix('.zip.partial')
    print('Packaging '+str(len(release['files']))+' verified files; weights streamed from disk.',flush=True)
    with zipfile.ZipFile(partial,'x',zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as z:
        for name,path in files.items():
            print('Adding '+name,flush=True);z.write(path,name)
        for name,body in memory.items():z.writestr(name,body)
        z.writestr('RELEASE.json',json.dumps(release,indent=2))
    print('Verifying every compressed payload...',flush=True)
    with zipfile.ZipFile(partial) as z:
        assert len(z.namelist())==len(release['files'])+1
        for name,expected in release['files'].items():
            with z.open(name) as f:assert hashlib.file_digest(f,'sha256').hexdigest()==expected
            if name.endswith('.py'):compile(z.read(name),name,'exec')
        identity=hashlib.sha256(z.read('RELEASE.json')).hexdigest()
    partial.rename(output)
    metadata=dict(file=str(output),bytes=output.stat().st_size,sha256=digest(output),
        release_sha256=identity,verified=True,inference_executed=False)
    with output.with_suffix('.json').open('x') as f:json.dump(metadata,f,indent=2)
    print(json.dumps(metadata,indent=2),flush=True)


if __name__=='__main__':main()
