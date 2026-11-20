import unittest
import csv
import hashlib
import json
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image
from review_tgif2 import bootstrap_source_mean, create_review


class ReviewTests(unittest.TestCase):
    def test_bootstrap_groups_repeated_source_families(self):
        rows=[{"source_id":"a","dice":0.}, {"source_id":"a","dice":0.},
              {"source_id":"b","dice":1.}]
        result=bootstrap_source_mean(rows,"dice")
        self.assertEqual(result["sources"],2)
        self.assertEqual(result["mean"],.5)
        self.assertEqual(result,bootstrap_source_mean(list(reversed(rows)),"dice"))
        self.assertLessEqual(result["lower_95"],.5)
        self.assertGreaterEqual(result["upper_95"],.5)

    def test_invalid_values_are_not_perfect_scores(self):
        self.assertIsNone(bootstrap_source_mean([{"source_id":"a","dice":float("nan")}],"dice"))

    def test_complete_review_uses_actual_maps_without_approving_them(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for part in ('prepared','inference','evaluation'):(root/part).mkdir()
            rows=[];records=[]
            for split in ('dev','test'):
                for role in ('aligned_original','edited'):
                    sample=f'{split}-{role}'
                    row=dict(sample_id=sample,source_id=split,split=split,image=f'{sample}.png',mask=f'{sample}-mask.png',
                             image_role=role,condition='authentic_control' if role=='aligned_original' else 'segm_flux1dev')
                    rows.append(row)
                    Image.new('RGB',(448,448),'gray').save(root/'prepared'/row['image'])
                    mask=np.zeros((448,448),dtype=np.uint8)
                    if role=='edited':mask[112:336,112:336]=255
                    Image.fromarray(mask).save(root/'prepared'/row['mask'])
                    scores=np.zeros((1,32,32),dtype=np.float32);scores[:,8:24,8:24]=1
                    artifact=root/'inference'/f'{sample}.npz';np.savez(artifact,scores=scores)
                    records.append(dict(sample_id=sample,file=artifact.name,sha256=hashlib.sha256(artifact.read_bytes()).hexdigest()))
            manifest=root/'prepared/manifest.csv'
            with manifest.open('w',newline='') as handle:
                writer=csv.DictWriter(handle,fieldnames=rows[0]);writer.writeheader();writer.writerows(rows)
            run=dict(manifest_sha256=hashlib.sha256(manifest.read_bytes()).hexdigest(),mask_blind_inference=True,model={'layers':[11]},records=records)
            (root/'inference/run.json').write_text(json.dumps(run))
            (root/'evaluation/summary.json').write_text(json.dumps(dict(threshold_source='fit on splits dev',threshold=.5,layer=11,median3=True)))
            with (root/'evaluation/per_image.csv').open('w',newline='') as handle:
                writer=csv.DictWriter(handle,fieldnames=['sample_id','source_id','split']);writer.writeheader()
                writer.writerows({key:row[key] for key in writer.fieldnames} for row in rows)
            result=create_review(root)
            self.assertFalse(result['release_approved'])
            self.assertFalse(result['threshold_retuned'])
            self.assertEqual(len(result['groups']),4)
            control=next(g for g in result['groups'] if g['split']=='test' and g['role']=='aligned_original')
            self.assertEqual(control['images_with_false_highlights'],1)
            self.assertNotIn('dice',control)
            document=(root/'review/visual-review.html').read_text(encoding='utf-8')
            self.assertEqual(document.count('<section>'),4)
            self.assertIn('data:image/png;base64,',document)
            with self.assertRaises(FileExistsError):create_review(root)


if __name__ == "__main__":unittest.main()
