import contextlib
import copy
import importlib
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import zipfile
import torch

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'detectivesam-training'))
import paired_learning as paired
import balanced_loss
import test_detectivesam_training as prior


class PairLossTests(unittest.TestCase):
    def test_control_is_average_image_loss(self):
        a=torch.randn(1,1,3,3,requires_grad=True);b=torch.randn_like(a,requires_grad=True)
        mask=torch.zeros_like(a);mask[:,:,1,1]=1
        value,base,contrast=paired.paired_objective(a,b,mask,0.)
        expected=(balanced_loss.objective(a,torch.zeros_like(mask))+balanced_loss.objective(b,mask))/2
        self.assertTrue(torch.equal(value,expected));self.assertEqual(float(contrast),0.)
        g=torch.autograd.grad(value,(a,b),retain_graph=True);h=torch.autograd.grad(expected,(a,b))
        for x,y in zip(g,h):self.assertTrue(torch.equal(x,y))

    def test_added_gradient_separates_pair_only_inside_mask(self):
        a=torch.zeros(1,1,3,3,requires_grad=True);b=torch.zeros_like(a,requires_grad=True)
        mask=torch.zeros_like(a);mask[:,:,1,1]=1
        control=paired.paired_objective(a,b,mask,0.)[0]
        revised=paired.paired_objective(a,b,mask,1.)[0]
        ga,gb=torch.autograd.grad(revised-control,(a,b))
        self.assertGreater(float(ga[0,0,1,1]),0.)
        self.assertLess(float(gb[0,0,1,1]),0.)
        self.assertEqual(float(ga[mask==0].abs().sum()),0.)
        self.assertEqual(float(gb[mask==0].abs().sum()),0.)

    def test_numerical_gradients_and_invalid_inputs(self):
        a=torch.randn(1,1,2,2,dtype=torch.double,requires_grad=True)
        b=torch.randn_like(a,requires_grad=True);mask=torch.zeros_like(a);mask[:,:,0,0]=1
        self.assertTrue(torch.autograd.gradcheck(lambda x,y:paired.paired_objective(x,y,mask,1.)[0],(a,b)))
        for weight in (-1,.5,2):
            with self.assertRaises(ValueError):paired.paired_objective(a,b,mask,weight)
        with self.assertRaises(ValueError):paired.paired_objective(a,b,mask*0,1.)
        with self.assertRaises(ValueError):paired.paired_objective(a,b,mask+.1,1.)
        with self.assertRaises(ValueError):paired.paired_objective(a,b*float('nan'),mask,1.)

    def test_single_image_model_learns_synthetic_pair(self):
        # A shared model sees only one image in each forward; labels/originals
        # are not inference inputs. This is plumbing, not real-image accuracy.
        model=torch.nn.Conv2d(1,1,1);torch.nn.init.zeros_(model.weight);torch.nn.init.zeros_(model.bias)
        original=torch.zeros(1,1,4,4);edited=original.clone();edited[:,:,1:3,1:3]=1
        optimizer=torch.optim.Adam(model.parameters(),lr=.2)
        for _ in range(80):
            optimizer.zero_grad();loss=paired.paired_objective(model(original),model(edited),edited,1.)[0]
            loss.backward();optimizer.step()
        with torch.no_grad():
            self.assertFalse((model(original)>0).any())
            self.assertTrue(torch.equal(model(edited)>0,edited.bool()))

    def test_pair_schedule_and_holdout_exclusion(self):
        cases=prior.cases();schedule=paired.paired_schedule(cases,240)
        self.assertEqual(len(schedule),240)
        self.assertEqual(sum(b['condition']=='segm_flux1dev' for a,b in schedule),120)
        for a,b in schedule:
            self.assertEqual(a['source_id'],b['source_id']);self.assertEqual(a['condition'],'authentic_control')
            self.assertEqual(a['role'],'tiny_fit');self.assertEqual(b['role'],'tiny_fit')
        cases[0]['role']='development_holdout'
        with self.assertRaises(ValueError):paired.paired_schedule(cases,240)

    def test_comparison_rejects_mismatched_baseline_and_never_approves(self):
        report=dict(completed=True,steps_completed=240,release_approved=False,
                    frozen_sha256_before='a',trainable_sha256_before='b',baseline_summary_sha256='c',
                    decision=dict(diagnostic_passed=True))
        result=paired.compare_results(report,copy.deepcopy(report))
        self.assertFalse(result['release_approved']);self.assertFalse(result['independent_accuracy_established'])
        for key,value in (('completed',False),('steps_completed',20),('baseline_summary_sha256','wrong'),('trainable_sha256_before','wrong')):
            with self.assertRaises(ValueError):paired.compare_results(report,dict(report,**{key:value}))


class PackageTests(prior.PackageChecks):
    package_name='AuthentiScan-DetectiveSAM-Paired-Loyd-v1.zip'
    return_name='Return-to-Kent-DetectiveSAM-Paired.zip'

    def test_low_memory_before_model_import(self):
        sys.modules.pop('paired_worker',None)
        try:
            worker=importlib.import_module('paired_worker')
            with patch.object(worker,'free_memory_bytes',return_value=1024),patch.object(sys,'argv',['worker','--base','unused','--arm','control','--output',str(self.root/'training-output/results')]):
                with self.assertRaisesRegex(RuntimeError,'6 GiB'):worker.main()
        finally:sys.modules.pop('paired_worker',None)

    def test_controller_sequential_arms_and_failure_stops(self):
        controller=importlib.import_module('worker');calls=[]
        def run(argv,**kwargs):
            calls.append(argv);arm=argv[argv.index('--arm')+1];dest=Path(argv[argv.index('--output')+1]);dest.mkdir()
            data=dict(completed=True,steps_completed=240,release_approved=False,
                      frozen_sha256_before='a',trainable_sha256_before='b',baseline_summary_sha256='c',decision=dict(diagnostic_passed=False))
            (dest/'RESULT.json').write_text(json.dumps(data))
        with patch.object(controller.subprocess,'run',side_effect=run),patch.object(sys,'argv',['worker','--base','base','--output',str(self.root/'training-output/results')]):
            controller.main()
        self.assertEqual([a[a.index('--arm')+1] for a in calls],['control','contrast'])
        report=json.loads((self.root/'training-output/results/RESULT.json').read_text())
        self.assertTrue(report['completed']);self.assertFalse(report['comparison']['contrast_passed_existing_checks'])
        with patch.object(controller.subprocess,'run',side_effect=subprocess.CalledProcessError(1,'fake')) as run,patch.object(sys,'argv',['worker','--base','base','--output',str(self.root/'training-output/failed')]):
            with self.assertRaises(subprocess.CalledProcessError):controller.main()
            self.assertEqual(run.call_count,1)
        self.assertEqual(json.loads((self.root/'training-output/failed/RESULT.json').read_text())['stage'],'failed')

    def test_package_preserves_model_inference_data_and_criteria(self):
        with zipfile.ZipFile(ROOT/'handoff/AuthentiScan-DetectiveSAM-Balanced-Loss-Loyd-v2.zip') as old,zipfile.ZipFile(ROOT/'handoff'/self.package_name) as new:
            for n in ('training_core.py','CASES.json','balanced_loss.py','comparison_guard.py','V1-REFERENCE.json'):
                self.assertEqual(old.read(n),new.read(n))
            for n in old.namelist():
                if n.startswith(('images/','masks/')):self.assertEqual(old.read(n),new.read(n))
            worker=new.read('paired_worker.py').decode()
            self.assertLess(worker.index('check_baseline(report,before,reference)'),worker.index('optimizer=torch.optim.AdamW'))
            self.assertIn("paired_schedule(cases,protocol['steps'])",worker)
            protocol=json.loads(new.read('PROTOCOL.json'));self.assertEqual(protocol['steps'],240)
            self.assertEqual(protocol['contrast_weights'],[0.,1.])
            self.assertFalse(json.loads(new.read('CHANGE-RECORD.json'))['inference_or_decoder_changes'])


if __name__=='__main__':unittest.main()
