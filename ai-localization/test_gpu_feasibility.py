import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
import torch

HERE=Path(__file__).resolve().parent/'gpu-feasibility'
sys.path.insert(0,str(HERE))
from gpu_model import RecomputeBlock,gradient_group,loss_for
from verify_package import safe_file,verify,sha


class FeasibilityTests(unittest.TestCase):
    def test_gradient_crosses_frozen_block_to_adapter(self):
        torch.manual_seed(5)
        adapter=torch.nn.Linear(3,3)
        frozen=torch.nn.Linear(3,3).requires_grad_(False)
        x=torch.randn(2,3)
        normal=frozen(adapter(x)).square().sum()
        normal.backward()
        expected=adapter.weight.grad.clone()
        adapter.zero_grad(set_to_none=True)
        RecomputeBlock(frozen)(adapter(x)).square().sum().backward()
        torch.testing.assert_close(adapter.weight.grad,expected)
        self.assertTrue((adapter.weight.grad!=0).any())
        self.assertIsNone(frozen.weight.grad)

    def test_trainable_groups_exclude_backbone_and_prompt_encoder(self):
        self.assertEqual(gradient_group('image_encoder.hfp_patch_embed_tune.weight'),'high_frequency')
        self.assertEqual(gradient_group('image_encoder.adaptor_blocks.0.weight'),'adapters')
        self.assertIsNone(gradient_group('image_encoder.blocks.0.block.weight'))
        self.assertIsNone(gradient_group('prompt_encoder.weight'))

    def test_authentic_loss_penalizes_false_highlights(self):
        logits=torch.ones(1,1,4,4,requires_grad=True)
        loss_for(logits,torch.zeros(1,1,8,8)).backward()
        self.assertTrue((logits.grad>0).all())

    def test_path_and_checksum_protection(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);file=root/'known.txt';file.write_text('valid')
            release=dict(purpose='safire-adapter-gpu-feasibility-v1',training_images=3,
                validation_images=0,test_images=0,release_approved=False,files={'known.txt':sha(file)})
            (root/'RELEASE.json').write_text(json.dumps(release))
            verify(root)
            for name in ('../known.txt','C:/known.txt','a\\known.txt'):
                with self.assertRaises(ValueError):safe_file(root,name)
            file.write_text('modified')
            with self.assertRaises(ValueError):verify(root)


if __name__=='__main__':unittest.main()
