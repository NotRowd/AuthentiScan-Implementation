import json
from pathlib import Path
import sys
import unittest
import zipfile

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'detectivesam-training'))
import torch
import balanced_loss
import comparison_guard
import training_core
import test_detectivesam_training as prior


class V2PackageChecks(prior.PackageChecks):
    package_name='AuthentiScan-DetectiveSAM-Balanced-Loss-Loyd-v2.zip'
    return_name='Return-to-Kent-DetectiveSAM-Balanced.zip'


class LossChecks(unittest.TestCase):
    def test_authentic_and_full_foreground_match_v1_value_and_gradient(self):
        for fill in (0.,1.):
            x=torch.linspace(-3,3,16,dtype=torch.double).reshape(1,1,4,4).requires_grad_()
            y=x.detach().clone().requires_grad_();target=torch.full_like(x,fill)
            old=training_core.objective(x,target);new=balanced_loss.objective(y,target)
            self.assertTrue(torch.allclose(old,new,atol=1e-12,rtol=0))
            old.backward();new.backward()
            self.assertTrue(torch.allclose(x.grad,y.grad,atol=1e-12,rtol=0))

    def test_one_pixel_edit_has_balanced_bce_gradient_mass(self):
        for count in (1,128):
            x=torch.zeros(1,1,16,16,requires_grad=True);target=torch.zeros_like(x)
            target.flatten()[:count]=1
            balanced_loss.balanced_bce(x,target).backward()
            positive=-x.grad[target==1].sum();negative=x.grad[target==0].sum()
            self.assertAlmostEqual(float(positive),.25,places=6)
            self.assertAlmostEqual(float(negative),.25,places=6)

    def test_gradient_numerically_correct_on_small_edit(self):
        x=torch.tensor([[[[-2.,.3],[1.,-1.]]]],dtype=torch.double,requires_grad=True)
        target=torch.tensor([[[[1.,0.],[0.,0.]]]],dtype=torch.double)
        self.assertTrue(torch.autograd.gradcheck(lambda a:balanced_loss.objective(a,target),(x,),eps=1e-6,atol=1e-4))

    def test_batch_mean_does_not_weight_large_mask_more(self):
        x=torch.tensor([[[[2.,-1.],[-1.,-1.]]],[[[-2.,-2.],[-2.,1.]]]])
        target=torch.tensor([[[[1.,0.],[0.,0.]]],[[[1.,1.],[1.,0.]]]])
        combined=balanced_loss.objective(x,target)
        separate=(balanced_loss.objective(x[:1],target[:1])+balanced_loss.objective(x[1:],target[1:]))/2
        self.assertTrue(torch.allclose(combined,separate))

    def test_extreme_logits_finite_and_bad_targets_rejected(self):
        x=torch.tensor([[[[100.,-100.],[-100.,100.]]]],requires_grad=True)
        t=torch.tensor([[[[0.,1.],[0.,1.]]]])
        value=balanced_loss.objective(x,t);value.backward()
        self.assertTrue(torch.isfinite(value));self.assertTrue(torch.isfinite(x.grad).all())
        for bad in (torch.full_like(t,.5),torch.full_like(t,float('nan'))):
            with self.assertRaises(ValueError):balanced_loss.objective(x,bad)
        with self.assertRaises(ValueError):balanced_loss.objective(torch.empty(0,1,4,4),torch.empty(0,1,4,4))


class ComparisonChecks(unittest.TestCase):
    def setUp(self):
        with zipfile.ZipFile(ROOT/'handoff/AuthentiScan-DetectiveSAM-Balanced-Loss-Loyd-v2.zip') as z:
            self.ref=json.loads(z.read('V1-REFERENCE.json'))
        self.report={k:self.ref[k] for k in ('frozen_sha256_before','trainable_sha256_before')}
        self.rows=[dict(r) for r in self.ref['before']]

    def test_exact_historical_baseline_passes(self):
        result=comparison_guard.check_baseline(self.report,self.rows,self.ref)
        self.assertTrue(result['passed']);self.assertEqual(result['max_metric_delta']['dice'],0.)

    def test_wrong_weights_or_cases_refused(self):
        with self.assertRaises(ValueError):comparison_guard.check_baseline(dict(self.report,trainable_sha256_before='wrong'),self.rows,self.ref)
        with self.assertRaises(ValueError):comparison_guard.check_baseline(self.report,self.rows[:-1],self.ref)
        self.rows[0]['role']='wrong'
        with self.assertRaises(ValueError):comparison_guard.check_baseline(self.report,self.rows,self.ref)

    def test_metric_mismatch_refused(self):
        self.rows[0]['highlighted_fraction']+=.01
        with self.assertRaises(ValueError):comparison_guard.check_baseline(self.report,self.rows,self.ref)

    def test_package_is_one_training_factor_change(self):
        import hashlib
        with zipfile.ZipFile(ROOT/'handoff/AuthentiScan-DetectiveSAM-Diagnostic-Loyd-v1.zip') as old,zipfile.ZipFile(ROOT/'handoff/AuthentiScan-DetectiveSAM-Balanced-Loss-Loyd-v2.zip') as new:
            original=json.loads(old.read('PROTOCOL.json'));current=json.loads(new.read('PROTOCOL.json'))
            self.assertTrue(all(current[k]==v for k,v in original.items()))
            changed=set(json.loads(new.read('CHANGE-RECORD.json'))['changed_files'])
            manifest=json.loads(old.read('RELEASE.json'))
            for name,h in manifest['files'].items():
                if name not in changed:self.assertEqual(hashlib.sha256(new.read(name)).hexdigest(),h)
            worker=new.read('worker.py').decode()
            self.assertLess(worker.index("check_baseline(report,before,reference)"),worker.index('optimizer=torch.optim.AdamW'))
            self.assertIn('from balanced_loss import objective',worker)
            self.assertEqual(new.read('balanced_loss.py'),(ROOT/'detectivesam-training/balanced_loss.py').read_bytes())


if __name__=='__main__':unittest.main()
