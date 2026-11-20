"""One-command local GPU workflow; no deployment and no final-test access."""
import json
from pathlib import Path
import subprocess
import sys
import zipfile
from verify_localization_package import verify

root=Path(__file__).resolve().parent


def run(stage,arguments):
    (root/'RUN-STATUS.json').write_text(json.dumps(dict(stage=stage,production_enabled=False),indent=2))
    with (root/f'{stage}.log').open('w',encoding='utf-8') as log:
        process=subprocess.Popen([sys.executable,'-u',str(root/'train_supervised_localization.py'),*arguments],cwd=root,
          stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
        for line in process.stdout:print(line,end='',flush=True);log.write(line);log.flush()
        if process.wait():raise RuntimeError(f'{stage} failed; see {stage}.log. Do not change the data split or silently switch to CPU.')


def main():
    verify(root)
    import torch
    if not torch.cuda.is_available():raise RuntimeError('CUDA is unavailable. Set up the isolated GPU environment first.')
    if (root/'training-output').exists():raise FileExistsError('training-output already exists; preserve it and inspect completion.json before attempting another run')
    run('feature-cache',['cache','--data','data','--cache','feature-cache','--source','encoder-source','--checkpoint','dinov2_vits14_pretrain.pth'])
    run('training',['train','--data','data','--cache','feature-cache','--output','training-output'])
    output=root/'AuthentiScan-Localization-Return-Kent.zip'
    with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted((root/'training-output').iterdir()):
            if path.is_file():archive.write(path,path.relative_to(root).as_posix())
        for name in ['feature-cache.log','training.log','RELEASE.json']:archive.write(root/name,name)
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:raise ValueError('Return ZIP verification failed')
    (root/'RUN-STATUS.json').write_text(json.dumps(dict(stage='training_complete_return_to_kent',return_zip=output.name,
      final_test_evaluated=False,production_enabled=False),indent=2))
    print('Return this ZIP privately to Kent:',output,flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        (root/'RUN-STATUS.json').write_text(json.dumps(dict(stage='failed',error=str(error),production_enabled=False),indent=2))
        raise
