import csv
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
import numpy as np
import torch
from prepare_supervised_localization import select_cohorts
from supervised_localizer import MaskHead,mask_loss,select_threshold,training_rows,relative_file
from train_supervised_localization import training_device


class SupervisedTests(unittest.TestCase):
    def test_cpu_is_explicit_and_missing_cuda_does_not_fall_back(self):
        self.assertEqual(training_device('cpu').type,'cpu')
        with patch('torch.cuda.is_available',return_value=False):
            with self.assertRaisesRegex(RuntimeError,'never silently'):training_device('cuda')
        with self.assertRaises(ValueError):training_device('auto')

    def test_fresh_sources_are_held_out_and_deterministic(self):
        prior={'dev':list(map(str,range(80))),'test':list(map(str,range(80,160)))}
        a=select_cohorts(set(map(str,range(343))),prior)
        self.assertEqual(a,select_cohorts(set(map(str,reversed(range(343)))),prior))
        self.assertEqual({key:len(value) for key,value in a.items()},{'train':160,'validation':40,'test':80})
        self.assertTrue(set(a['train']).isdisjoint(a['test']));self.assertTrue(set(a['validation']).isdisjoint(a['test']))

    def test_head_backpropagates_and_empty_masks_do_not_fake_perfect_dice(self):
        torch.set_num_threads(2);torch.manual_seed(123)
        model=MaskHead();features=torch.randn(2,768,8,8);target=torch.zeros(2,1,8,8);target[1,:,2:6,2:6]=1
        before=model.layers[0].weight.detach().clone();optimizer=torch.optim.AdamW(model.parameters(),lr=.001)
        loss=mask_loss(model(features),target);optimizer.zero_grad();loss.backward();optimizer.step()
        self.assertTrue(torch.isfinite(loss));self.assertFalse(torch.equal(before,model.layers[0].weight))
        empty_loss=mask_loss(torch.zeros(1,1,8,8),torch.zeros(1,1,8,8))
        self.assertAlmostEqual(float(empty_loss),float(np.log(2)),places=5)

    def fixtures(self):
        rows=[dict(split='validation',condition=c) for c in ['authentic_control','segm_flux1dev','random_flux1dev']]
        target=np.zeros((3,32,32),dtype=np.float32);target[1:,8:24,8:24]=1
        return rows,target

    def test_empty_prediction_policy_fails_even_without_false_positives(self):
        rows,target=self.fixtures();result=select_threshold(np.zeros_like(target),target,rows)
        self.assertEqual(result['status'],'validation_gate_failed');self.assertEqual(result['edited_macro_dice'],0)
        self.assertFalse(result['release_approved'])

    def test_good_validation_is_not_deployment_approval(self):
        rows,target=self.fixtures();result=select_threshold(target*.8+.1,target,rows)
        self.assertEqual(result['status'],'validation_gate_passed_needs_fresh_test');self.assertFalse(result['release_approved'])
        rows[0]['split']='test'
        with self.assertRaises(ValueError):select_threshold(target,target,rows)

    def test_training_rejects_test_rows_and_split_leakage(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);path=root/'training-manifest.csv'
            def write(rows):
                with path.open('w',newline='') as handle:
                    writer=csv.DictWriter(handle,fieldnames=['sample_id','source_id','split']);writer.writeheader();writer.writerows(rows)
            write([dict(sample_id='a',source_id='1',split='train'),dict(sample_id='b',source_id='1',split='validation')])
            with self.assertRaisesRegex(ValueError,'leakage'):training_rows(root)
            write([dict(sample_id='a',source_id='1',split='test')])
            with self.assertRaisesRegex(ValueError,'Test data'):training_rows(root)
            with self.assertRaises(ValueError):relative_file(root,'../secret')


if __name__=='__main__':unittest.main()
