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
PACKAGE=ROOT/'handoff/AuthentiScan-DetectiveSAM-Evaluation-Loyd-v1.zip'


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT);self.root=Path(self.temp.name)
        with zipfile.ZipFile(PACKAGE) as z:
            for name in z.namelist():
                dest=(self.root/name).resolve()
                self.assertTrue(dest.is_relative_to(self.root.resolve()))
                dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(name))
        self.old_path=sys.path.copy();self.old_modules={n:sys.modules.pop(n,None) for n in ('verify_package','run_evaluation','candidate_worker','fused_platform')}
        sys.path.insert(0,str(self.root))
        self.verify=importlib.import_module('verify_package');self.launcher=importlib.import_module('run_evaluation')

    def tearDown(self):
        sys.path[:]=self.old_path
        for n,value in self.old_modules.items():
            sys.modules.pop(n,None)
            if value is not None:sys.modules[n]=value
        self.temp.cleanup()

    def test_integrity_and_corruption(self):
        _,release=self.verify.verify();self.assertEqual(len(release['files']),395)
        with (self.root/'source/LICENSE').open('ab') as stream:stream.write(b'bad')
        with self.assertRaises(ValueError):self.verify.verify()

    def test_launcher_completion_and_duplicate_refusal(self):
        root=self.root
        class Child:
            returncode=None
            def __init__(self,command,**kwargs):
                assert command[2]==str(root/'candidate_worker.py')
                assert command[3]=='--output'
                dest=Path(command[4]);dest.mkdir();(dest/'RESULT.json').write_text(json.dumps({'stage':'development_screen_complete'}))
            def wait(self,timeout):self.returncode=0;return 0
            def poll(self):return self.returncode
        with patch('process_lifecycle.protect_process_tree'),patch.object(self.launcher.subprocess,'Popen',Child),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.launcher.main(),0)
            with self.assertRaises(FileExistsError):self.launcher.main()
        with zipfile.ZipFile(root/'evaluation-output/Return-to-Kent-DetectiveSAM.zip') as z:
            for name,expected in json.loads(z.read('SHA256.json')).items():self.assertEqual(hashlib.sha256(z.read(name)).hexdigest(),expected)

    def test_launcher_timeout_is_packaged(self):
        class Child:
            returncode=None
            def __init__(self,*args,**kwargs):pass
            def wait(self,timeout):
                if self.returncode is None:raise subprocess.TimeoutExpired('fake',timeout)
                return self.returncode
            def poll(self):return self.returncode
            def terminate(self):self.returncode=1
        with patch('process_lifecycle.protect_process_tree'),patch.object(self.launcher.subprocess,'Popen',Child),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.launcher.main(),1)
        report=json.loads((self.root/'evaluation-output/LAUNCHER.json').read_text())
        self.assertTrue(report['timed_out']);self.assertFalse(report['completed'])
        self.assertTrue((self.root/'evaluation-output/Return-to-Kent-DetectiveSAM.zip').exists())

    def test_worker_memory_guard_before_model_import(self):
        worker=importlib.import_module('candidate_worker')
        with patch.object(worker,'free_memory_bytes',return_value=1024),patch.object(sys,'argv',['worker','--output',str(self.root/'low-memory')]):
            with self.assertRaisesRegex(RuntimeError,'6 GiB'):worker.main()
        result=json.loads((self.root/'low-memory/RESULT.json').read_text());self.assertFalse(result['completed'])

    def test_metrics_and_original_control_rejection(self):
        import numpy as np
        worker=importlib.import_module('candidate_worker')
        truth=np.array([[1,0],[0,1]],dtype=np.uint8)
        self.assertEqual(worker.metrics(truth.astype(float),truth)['dice'],1)
        self.assertEqual(worker.metrics(1-truth.astype(float),truth)['dice'],0)
        with self.assertRaises(ValueError):worker.metrics(np.full((2,2),np.nan),truth)
        rows=[dict(condition=c,dice=1 if c!='authentic_control' else None,highlighted_fraction=0) for c in ('authentic_control','segm_flux1dev','random_flux1dev') for _ in range(3)]
        self.assertTrue(worker.screen_decision(rows)[1])
        rows[0]['highlighted_fraction']=.00001
        self.assertFalse(worker.screen_decision(rows)[1])


if __name__=='__main__':unittest.main()
