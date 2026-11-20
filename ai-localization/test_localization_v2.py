from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch

import torch
import numpy as np

from train_localization_v2 import VERSION, DeltaHead, Families, moments, paired_loss
from review_supervised_validation import read_validation
from supervised_localizer import sha, operating_metrics


class V2Tests(unittest.TestCase):
    def test_head_and_pair_loss_backpropagate_without_reference_at_inference(self):
        torch.set_num_threads(2);torch.manual_seed(123)
        model=DeltaHead();x=torch.rand(2,3,384,8,8);y=torch.zeros(2,3,1,8,8)
        y[:,1:,:,2:6,2:6]=1
        logits=model(x.flatten(0,1)).reshape(y.shape)
        loss=paired_loss(logits,y);loss.backward()
        self.assertTrue(torch.isfinite(loss));self.assertIsNotNone(model.layers[0].weight.grad)
        model.eval()
        self.assertEqual(model(x[0,:1]).shape,(1,1,8,8))
        with self.assertRaises(ValueError):paired_loss(logits[:,:2],y[:,:2])

    def test_normalization_does_not_read_validation(self):
        seen=[]
        def fake(cache,row):
            seen.append(row['split'])
            return torch.full((384,32,32),2.),torch.zeros(1,32,32)
        with patch('train_localization_v2.load_sample',side_effect=fake):
            mean,std=moments(Path('.'),[{'split':'train'},{'split':'validation'}])
        self.assertEqual(seen,['train']);self.assertTrue((mean==2).all());self.assertTrue((std>0).all())

    def test_family_group_requires_each_condition(self):
        with self.assertRaises(ValueError):Families(Path('.'),[dict(source_id='1',condition='authentic_control')])

    def test_normalization_buffers_round_trip(self):
        mean=torch.ones(1,384,1,1);std=mean*2
        first=DeltaHead(mean,std);second=DeltaHead();second.load_state_dict(first.state_dict())
        first.eval();second.eval();sample=torch.rand(1,384,8,8)
        torch.testing.assert_close(first(sample),second(sample))

    def test_review_requires_explicit_v2_and_recomputes_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            rows=[dict(sample_id=str(i),split='validation',condition=c)
                  for i,c in enumerate(('authentic_control','segm_flux1dev','random_flux1dev'))]
            (root/'training-manifest.csv').write_text('fixture',encoding='utf-8')
            (root/'best-head.pt').write_bytes(b'fixture only')
            (root/'validation-sample-order.json').write_text(json.dumps(['0','1','2']))
            p=np.zeros((3,32,32),dtype=np.float32);t=p.copy()
            p[1:,2:8,2:8]=1;t[1:,2:8,2:8]=1
            np.savez_compressed(root/'validation-predictions.npz',probabilities=p,targets=t)
            report=dict(architecture=VERSION,head_sha256=sha(root/'best-head.pt'),
                        training_manifest_sha256=sha(root/'training-manifest.csv'),threshold=.5,
                        groups=operating_metrics(p,t,rows,.5))
            (root/'validation-report.json').write_text(json.dumps(report))
            with patch('review_supervised_validation.training_rows',return_value=rows):
                with self.assertRaisesRegex(ValueError,'provenance'):read_validation(root,root)
                result=read_validation(root,root,VERSION)
                self.assertEqual(result[-1]['segm_flux1dev']['dice'],1.)
                report['groups']['segm_flux1dev']['dice']=.123
                (root/'validation-report.json').write_text(json.dumps(report))
                with self.assertRaisesRegex(ValueError,'metrics'):read_validation(root,root,VERSION)


if __name__=='__main__':unittest.main()
