import contextlib
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
sys.path.insert(0,str(ROOT/'detectivesam-training'))
import training_core as core
import torch


def cases():
    return [dict(sample_id=f'{i}-{c}',source_id=str(i),role='tiny_fit' if i<4 else 'development_holdout',condition=c)
            for i in range(16) for c in core.CONDITIONS]


class NumericalChecks(unittest.TestCase):
    def test_training_policy_preserves_frozen_weights(self):
        torch.manual_seed(7)
        model=torch.nn.Module()
        model.encoder=torch.nn.Linear(2,2)
        model.decoder=torch.nn.Linear(2,1)
        model.adapters=torch.nn.Linear(2,2)
        model.mask_adapter=torch.nn.Module()
        model.mask_adapter.head=torch.nn.Linear(2,2)
        model.mask_adapter.coarse_processor=torch.nn.Module()
        model.mask_adapter.coarse_processor.pos_embed_conv=torch.nn.Linear(2,2)
        model.mask_adapter.coarse_processor.cached_pos_encodings={'stale':torch.ones(2)}
        model.no_mem_embed=torch.nn.Parameter(torch.ones(2))
        params=core.configure(model,True)
        self.assertFalse(model.encoder.training);self.assertFalse(model.decoder.training)
        self.assertTrue(model.adapters.training);self.assertTrue(model.mask_adapter.training)
        self.assertEqual(model.mask_adapter.coarse_processor.cached_pos_encodings,{})
        self.assertFalse(model.no_mem_embed.requires_grad)
        self.assertFalse(model.mask_adapter.coarse_processor.pos_embed_conv.weight.requires_grad)
        before=core.parameter_digest(model,False)
        active_before=core.parameter_digest(model,True)
        optimizer=torch.optim.SGD(list(params.values()),lr=.1)
        logits=model.decoder(model.mask_adapter.head(model.adapters(model.encoder(torch.ones(1,2))))).reshape(1,1,1,1)
        core.objective(logits,torch.ones_like(logits)).backward()
        core.check_gradients(params);optimizer.step()
        self.assertEqual(core.parameter_digest(model,False),before)
        self.assertNotEqual(core.parameter_digest(model,True),active_before)
        core.configure(model,False)
        self.assertFalse(model.adapters.training);self.assertFalse(model.mask_adapter.training)

    def test_false_highlight_gradient_and_edit_gradient(self):
        negative=torch.full((1,1,4,4),3.,requires_grad=True)
        core.objective(negative,torch.zeros_like(negative)).backward()
        self.assertTrue((negative.grad>0).all())  # descent lowers original logits
        edited=torch.full((1,1,4,4),-3.,requires_grad=True)
        core.objective(edited,torch.ones_like(edited)).backward()
        self.assertTrue((edited.grad<0).all())  # descent raises edited logits
        with self.assertRaises(ValueError):core.objective(torch.zeros(1,1,4,4),torch.full((1,1,4,4),.5))

    def test_leakage_and_balanced_schedule(self):
        items=cases();scheduled=core.schedule(items,480)
        self.assertTrue(all(c['role']=='tiny_fit' for c in scheduled))
        self.assertEqual(sum(c['condition']=='authentic_control' for c in scheduled),240)
        self.assertEqual(sum(c['condition']=='segm_flux1dev' for c in scheduled),120)
        items[0]['role']='development_holdout'
        with self.assertRaises(ValueError):core.validate_cases(items)

    def test_empty_collapse_and_false_highlights_fail(self):
        good=[dict(**c,highlighted_fraction=0 if c['condition']=='authentic_control' else .1,
                   dice=None if c['condition']=='authentic_control' else .95) for c in cases()]
        self.assertTrue(core.decision(good,good)['diagnostic_passed'])
        collapsed=[dict(r,highlighted_fraction=0,dice=None if r['dice'] is None else 0) for r in good]
        self.assertFalse(core.decision(good,collapsed)['diagnostic_passed'])
        false_positive=[dict(r,highlighted_fraction=.2) if r['condition']=='authentic_control' else r for r in good]
        self.assertFalse(core.decision(good,false_positive)['diagnostic_passed'])
        with self.assertRaises(ValueError):core.decision(good,good[:-1])

    def test_disconnected_and_nonfinite_gradient_refused(self):
        a=torch.nn.Parameter(torch.ones(2));b=torch.nn.Parameter(torch.ones(2))
        params={'adapters.a':a,'mask_adapter.b':b}
        with self.assertRaises(RuntimeError):core.check_gradients(params)
        a.grad=torch.ones(2);b.grad=torch.full((2,),float('nan'))
        with self.assertRaises(RuntimeError):core.check_gradients(params)
        b.grad=torch.ones(2);self.assertEqual(core.check_gradients(params)['adapters.'],2)


class PackageChecks(unittest.TestCase):
    package_name='AuthentiScan-DetectiveSAM-Diagnostic-Loyd-v1.zip'
    return_name='Return-to-Kent-DetectiveSAM-Diagnostic.zip'
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT);self.root=Path(self.temp.name)
        with zipfile.ZipFile(ROOT/'handoff'/self.package_name) as z:
            for name in z.namelist():
                p=(self.root/name).resolve();self.assertTrue(p.is_relative_to(self.root.resolve()))
                p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(z.read(name))
        self.old_path=sys.path.copy();sys.path.insert(0,str(self.root))
        self.modules={n:sys.modules.pop(n,None) for n in ('verify_package','run_diagnostic','worker','fused_platform')}
        self.verify=importlib.import_module('verify_package');self.launcher=importlib.import_module('run_diagnostic')

    def tearDown(self):
        sys.path[:]=self.old_path
        for name,old in self.modules.items():
            sys.modules.pop(name,None)
            if old is not None:sys.modules[name]=old
        self.temp.cleanup()

    def test_integrity_and_base_refusal(self):
        self.verify.verify()
        with self.assertRaises(FileNotFoundError):self.verify.verify_base(self.root/'missing-base')
        (self.root/'training_core.py').write_text('changed')
        with self.assertRaises(ValueError):self.verify.verify()

    def test_low_memory_before_model_import(self):
        worker=importlib.import_module('worker')
        with patch.object(worker,'free_memory_bytes',return_value=1024),patch.object(sys,'argv',['worker','--base','unused','--output',str(self.root/'training-output/results')]):
            with self.assertRaisesRegex(RuntimeError,'6 GiB'):worker.main()
        report=json.loads((self.root/'training-output/results/RESULT.json').read_text())
        self.assertFalse(report['completed'])

    def test_launcher_failure_archive_and_duplicate_refusal(self):
        class Child:
            returncode=1
            def __init__(self,*args,**kwargs):pass
            def wait(self,timeout):return 1
            def poll(self):return 1
        with patch('process_lifecycle.protect_process_tree'),patch.object(self.launcher.subprocess,'Popen',Child),patch.object(sys,'argv',['launcher','--base','missing']),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.launcher.main(),1)
            with self.assertRaises(FileExistsError):self.launcher.main()
        with zipfile.ZipFile(self.root/'training-output'/self.return_name) as z:
            import hashlib
            for name,expected in json.loads(z.read('SHA256.json')).items():self.assertEqual(hashlib.sha256(z.read(name)).hexdigest(),expected)

    def test_timeout_archive(self):
        class Child:
            returncode=None
            def __init__(self,*args,**kwargs):pass
            def wait(self,timeout):
                if self.returncode is None:raise subprocess.TimeoutExpired('fake',timeout)
                return self.returncode
            def poll(self):return self.returncode
            def terminate(self):self.returncode=1
        with patch('process_lifecycle.protect_process_tree'),patch.object(self.launcher.subprocess,'Popen',Child),patch.object(sys,'argv',['launcher','--base','missing']),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.launcher.main(),1)
        self.assertTrue(json.loads((self.root/'training-output/LAUNCHER.json').read_text())['timed_out'])


if __name__=='__main__':unittest.main()
