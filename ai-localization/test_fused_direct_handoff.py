import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import zipfile

ROOT=Path(__file__).resolve().parent


def module(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


class DirectSourceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.folder=Path(self.tmp.name)/'comparison'; self.folder.mkdir()
        with zipfile.ZipFile(ROOT/'handoff/AuthentiScan-FUSED-Direct-Source-Loyd-v1.zip') as z:
            z.extractall(self.folder)  # Locally generated, verified package only.
        self.package=Path(self.tmp.name)/'original'; self.package.mkdir()

    def launcher_check(self, timeout=False):
        verifier=module(self.folder/'verify_package.py','direct_verifier_fixture')
        lifecycle=types.SimpleNamespace(protect_process_tree=lambda:None)
        with patch.dict(sys.modules,{'verify_package':verifier,'process_lifecycle':lifecycle}):
            launcher=module(self.folder/'run_comparison.py','direct_launcher_fixture')
            owner=self
            class Worker:
                stopped=False
                def __init__(self,command,**kwargs):
                    owner.assertEqual(Path(command[2]).name,'direct_source_worker.py')
                    owner.assertEqual(command[3:5],['--package',str(owner.package.resolve())])
                    out=Path(command[-1]);out.mkdir()
                    (out/'RESULT.json').write_text(json.dumps({'stage':'development_screen_complete'}))
                def wait(self,timeout):
                    if timeout==1800 and owner.timeout and not self.stopped:
                        raise subprocess.TimeoutExpired('fixture',timeout)
                    return 0
                def poll(self): return 0 if self.stopped or not owner.timeout else None
                def terminate(self): self.stopped=True
                def kill(self): self.stopped=True
            self.timeout=timeout
            with patch.object(launcher,'verify',return_value=('a'*64,{})) as verification, patch.object(launcher.subprocess,'Popen',Worker), patch.object(sys,'argv',['run_comparison.py','--package',str(self.package)]):
                code=launcher.main()
                verification.assert_called_once_with(self.package.resolve())
                with self.assertRaises(FileExistsError): launcher.main()
            with zipfile.ZipFile(self.folder/'evaluation-output/Return-to-Kent-FUSED-Direct.zip') as z:
                report=json.loads(z.read('LAUNCHER.json'))
            self.assertFalse(report['release_approved'])
            self.assertEqual(report['completed'],not timeout)
            self.assertEqual(code,1 if timeout else 0)

    def test_launcher_success_and_duplicate_refusal(self): self.launcher_check()
    def test_launcher_timeout_preserves_failure(self): self.launcher_check(timeout=True)

    def test_worker_uses_direct_input_and_keeps_original_scoring_masks(self):
        import torch
        import numpy as np
        from PIL import Image
        from torchvision import transforms
        import evaluate_fused_candidate as evaluator
        torch.set_num_threads(2)
        rows=evaluator.selected_rows()
        # Known fixed baseline evidence copied to a temporary fixture.
        base=self.package/'evaluation-output-v2/results';base.mkdir(parents=True)
        for row in rows:
            sample=row['sample_id']
            (base/(sample+'.npz')).write_bytes((ROOT/'runs/loyd-fused-return-v2-2026-10-26/results'/(sample+'.npz')).read_bytes())
        transform=transforms.Compose([transforms.Resize([512,512]),transforms.ToTensor(),
            transforms.Normalize([.485,.456,.406],[.229,.224,.225])])
        expected=[]
        for row in rows:
            with Image.open(self.folder/'images'/(row['sample_id']+'.png')) as im:
                direct=transform(im.convert('RGB')).unsqueeze(0)
            with Image.open(evaluator.DATA/row['image']) as im:
                old=transform(im.convert('RGB')).unsqueeze(0)
            self.assertFalse(torch.equal(direct,old))
            expected.append(direct)
        owner=self
        class FakeModel:
            calls=0
            def __call__(self,tensor):
                owner.assertTrue(torch.equal(tensor,expected[self.calls]))
                self.calls+=1
                return {'logits':torch.zeros((1,1,512,512))}
        model=FakeModel()
        worker=module(self.folder/'direct_source_worker.py','direct_worker_fixture')
        out=self.folder/'worker-fixture'
        with patch.object(evaluator,'memory_guard',return_value=7), patch.object(evaluator,'load_model',return_value=(model,{'test_fixture':True})), patch.object(sys,'argv',['worker','--package',str(self.package),'--output',str(out)]):
            worker.main()
        self.assertEqual(model.calls,9)
        report=json.loads((out/'RESULT.json').read_text())
        self.assertEqual(report['stage'],'development_screen_complete')
        self.assertFalse(report['release_approved'])
        for row in rows:
            with np.load(out/(row['sample_id']+'.npz'),allow_pickle=False) as saved, Image.open(evaluator.DATA/row['mask']) as im:
                self.assertEqual(saved['scores'].shape,(448,448))
                self.assertTrue(np.array_equal(saved['truth'],np.asarray(im.convert('L'))))


if __name__=='__main__': unittest.main()
