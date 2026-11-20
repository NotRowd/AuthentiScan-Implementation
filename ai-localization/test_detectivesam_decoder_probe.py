import contextlib
import hashlib
import importlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT=Path(__file__).resolve().parent
PRE=ROOT/'candidates/detectivesam-preflight'
sys.path[:0]=[str(ROOT/'detectivesam-training'),str(PRE/'deps'),str(PRE/'sam2-source')]
import torch
from sam2.modeling.sam.mask_decoder import MaskDecoder
from decoder_probe import selected_index


class SelectionTests(unittest.TestCase):
    def run_case(self,primary,training=False,enabled=True):
        decoder=MaskDecoder(transformer_dim=8,transformer=torch.nn.Identity(),dynamic_multimask_via_stability=enabled)
        decoder.train(training)
        raw=torch.stack([torch.tensor(primary,dtype=torch.float32),torch.ones(2,2),torch.full((2,2),2.),torch.full((2,2),3.)])[None]
        iou=torch.tensor([[.1,.4,.9,.6]])
        observed=selected_index(decoder,raw,iou)
        result_tuple=(raw,iou,torch.zeros(1,4,8),torch.ones(1,1))
        with patch.object(decoder,'predict_masks',return_value=result_tuple):
            out=decoder(torch.empty(1,8,2,2),torch.empty(1,8,2,2),torch.empty(1,0,8),torch.empty(1,8,2,2),False,False)
        self.assertTrue(torch.equal(out[0],raw[:,observed[0]:observed[0]+1]))
        return observed

    def test_stable_primary_kept_despite_alternative_quality(self):
        self.assertEqual(self.run_case([[2,2],[2,2]])[0],0)

    def test_unstable_primary_uses_quality_selected_alternative(self):
        result=self.run_case([[-.01,.01],[-.01,.01]])
        self.assertEqual(result[0],2);self.assertTrue(result[2])

    def test_empty_primary_is_stable(self):
        result=self.run_case([[-2,-2],[-2,-2]])
        self.assertEqual(result[0],0);self.assertEqual(result[1],1.)

    def test_disabled_or_training_keeps_primary(self):
        for training,enabled in ((True,True),(False,False)):
            self.assertEqual(self.run_case([[-.01,.01],[-.01,.01]],training,enabled)[0],0)


class ProbePackageTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT);self.root=Path(self.temp.name)
        with zipfile.ZipFile(ROOT/'handoff/AuthentiScan-DetectiveSAM-Decoder-Probe-Loyd-v1.zip') as z:
            for n in z.namelist():
                p=(self.root/n).resolve();self.assertTrue(p.is_relative_to(self.root.resolve()))
                p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(z.read(n))
        self.old_path=sys.path.copy();sys.path.insert(0,str(self.root))
        self.old={n:sys.modules.pop(n,None) for n in ('verify_package','decoder_probe','run_probe','fused_platform')}
        self.verifier=importlib.import_module('verify_package');self.launcher=importlib.import_module('run_probe')
    def tearDown(self):
        sys.path[:]=self.old_path
        for n,v in self.old.items():
            sys.modules.pop(n,None)
            if v is not None:sys.modules[n]=v
        self.temp.cleanup()

    def test_package_data_and_no_optimizer(self):
        self.verifier.verify()
        cases=json.loads((self.root/'CASES.json').read_text())
        self.assertEqual(len(cases),12);self.assertTrue(all(c['role']=='tiny_fit' for c in cases))
        code=(self.root/'decoder_probe.py').read_text()
        self.assertNotIn('optimizer',code);self.assertNotIn('.backward(',code)
        (self.root/'decoder_probe.py').write_text('changed')
        with self.assertRaises(ValueError):self.verifier.verify()

    def test_wrong_adapter_refused_before_model(self):
        worker=importlib.import_module('decoder_probe')
        with patch.object(worker,'free_memory_bytes',return_value=8*2**30),patch.object(sys,'argv',['probe','--base','unused','--adapters','missing','--output',str(self.root/'probe-output/results')]):
            with self.assertRaisesRegex(ValueError,'balanced-v2'):worker.main()
        self.assertFalse(json.loads((self.root/'probe-output/results/RESULT.json').read_text())['completed'])

    def test_launcher_arguments_success_archive_and_duplicate_lock(self):
        root=self.root
        class Child:
            returncode=0
            def __init__(self,command,**kwargs):
                assert command[2]==str(root/'decoder_probe.py') and '--adapters' in command
                dest=Path(command[command.index('--output')+1]);dest.mkdir()
                (dest/'RESULT.json').write_text(json.dumps({'completed':True,'training_steps':0}))
            def wait(self,timeout):assert timeout==900;return 0
            def poll(self):return 0
        with patch('process_lifecycle.protect_process_tree'),patch.object(self.launcher.subprocess,'Popen',Child),patch.object(sys,'argv',['launcher','--base','base','--adapters','adapters']),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.launcher.main(),0)
            with self.assertRaises(FileExistsError):self.launcher.main()
        with zipfile.ZipFile(self.root/'probe-output/Return-to-Kent-DetectiveSAM-Decoder.zip') as z:
            for n,h in json.loads(z.read('SHA256.json')).items():self.assertEqual(hashlib.sha256(z.read(n)).hexdigest(),h)

    def test_timeout_preserves_return(self):
        class Child:
            returncode=None
            def __init__(self,*a,**k):pass
            def wait(self,timeout):
                if self.returncode is None:raise subprocess.TimeoutExpired('probe',timeout)
                return 1
            def poll(self):return self.returncode
            def terminate(self):self.returncode=1
        with patch('process_lifecycle.protect_process_tree'),patch.object(self.launcher.subprocess,'Popen',Child),patch.object(sys,'argv',['launcher','--base','base','--adapters','adapters']),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.launcher.main(),1)
        self.assertTrue(json.loads((self.root/'probe-output/LAUNCHER.json').read_text())['timed_out'])
        self.assertTrue((self.root/'probe-output/Return-to-Kent-DetectiveSAM-Decoder.zip').is_file())


if __name__=='__main__':unittest.main()
