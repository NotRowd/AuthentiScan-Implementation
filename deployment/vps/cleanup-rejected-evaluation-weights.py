"""Remove only exact, verified public candidate weights created by this task."""
from pathlib import Path
import hashlib

root=(Path.home()/'authentiscan-private-vision-eval-20261108').resolve()
expected={
 'gemma-3-4b-it-Q4_K_M.gguf':'882e8d2db44dc554fb0ea5077cb7e4bc49e7342a1f0da57901c0802ea21a0863',
 'mmproj-model-f16.gguf':'8c0fb064b019a6972856aaae2c7e4792858af3ca4561be2dbf649123ba6c40cb',
 'Qwen3.5-4B-UD-Q4_K_XL.gguf':'b252c5610a42ca82d20fe2a12813e9d069eed89292907e26c783eeb0bc961bc7',
 'mmproj-F16.gguf':'cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864',
}
targets=[]
for name,digest in expected.items():
    target=root/name
    if target.is_symlink() or target.resolve().parent!=root or not target.is_file():
        raise SystemExit('Unexpected target; no cleanup performed.')
    with target.open('rb') as stream:
        if hashlib.file_digest(stream,'sha256').hexdigest()!=digest:
            raise SystemExit('Unexpected candidate hash; no cleanup performed.')
    targets.append(target)
for target in targets:
    target.unlink()
    print('Removed rejected public evaluation weight: '+target.name)
