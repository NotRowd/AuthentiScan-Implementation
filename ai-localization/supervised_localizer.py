"""Small mask-supervised research head. Never replaces the working classifier."""
from __future__ import annotations
import csv
import hashlib
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageOps
import torch
from torch import nn
from torch.nn import functional as F

ARCHITECTURE='dinov2s14-clean-delta-maskhead-v1'
REVISION='7764ea0f912e53c92e82eb78a2a1631e92725fc8'
CHECKPOINT_SHA='b938bf1bc15cd2ec0feacfe3a1bb553fe8ea9ca46a7e1d8d00217f29aef60cd9'


def sha(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda:handle.read(1<<20),b''):digest.update(block)
    return digest.hexdigest()


def relative_file(root,value):
    root=Path(root).resolve();relative=Path(value)
    if relative.is_absolute() or '..' in relative.parts:raise ValueError('Unsafe relative asset path')
    path=(root/relative).resolve()
    if not path.is_relative_to(root) or not path.is_file():raise ValueError('Missing/outside asset')
    return path


def training_rows(data):
    with (data/'training-manifest.csv').open(newline='',encoding='utf-8') as handle:rows=list(csv.DictReader(handle))
    if not rows or len({r['sample_id'] for r in rows})!=len(rows):raise ValueError('Empty/duplicate samples')
    owners={}
    for row in rows:
        if row['split'] not in {'train','validation'}:raise ValueError('Test data must not enter training')
        if owners.setdefault(row['source_id'],row['split'])!=row['split']:raise ValueError('Source leakage across splits')
    if {r['split'] for r in rows}!={'train','validation'}:raise ValueError('Both train and validation required')
    return rows


def image_tensor(payload):
    with Image.open(io.BytesIO(payload)) as image:
        image=ImageOps.exif_transpose(image).convert('RGBA')
        image=Image.alpha_composite(Image.new('RGBA',image.size,'white'),image).convert('RGB')
        value=np.array(image.resize((448,448),Image.Resampling.BICUBIC),copy=True)
    return torch.from_numpy(value).permute(2,0,1).float().div(255)


class FeatureExtractor:
    def __init__(self,source,checkpoint,device='cuda'):
        self.device=torch.device(device)
        if self.device.type=='cuda' and not torch.cuda.is_available():raise RuntimeError('CUDA required; do not silently train on CPU')
        if sha(checkpoint)!=CHECKPOINT_SHA:raise ValueError('Pinned encoder checkpoint mismatch')
        # Local source and explicitly supplied weights: no torch.hub download.
        self.model=torch.hub.load(str(Path(source).resolve()),'dinov2_vits14',source='local',pretrained=False)
        self.model.load_state_dict(torch.load(checkpoint,map_location='cpu',weights_only=True),strict=True)
        self.model.to(self.device).eval().requires_grad_(False)
        self.mean=torch.tensor([.485,.456,.406],device=self.device).view(1,3,1,1)
        self.std=torch.tensor([.229,.224,.225],device=self.device).view(1,3,1,1)

    @torch.inference_mode()
    def __call__(self,payload):
        clean=image_tensor(payload).unsqueeze(0).to(self.device)
        low=F.interpolate(F.avg_pool2d(clean,4),scale_factor=4,mode='nearest')
        changed=(clean-.2*(clean-low)).clamp(0,1)
        inputs=(torch.cat([clean,changed])-self.mean)/self.std
        features=self.model.get_intermediate_layers(inputs,n=[10],reshape=True,norm=True)[0]
        result=torch.cat([features[0],(features[0]-features[1]).abs()],dim=0)
        if result.shape!=(768,32,32) or not torch.isfinite(result).all():raise ValueError('Invalid frozen features')
        return result.cpu().half().numpy()


class MaskHead(nn.Module):
    def __init__(self):
        super().__init__()
        self.layers=nn.Sequential(nn.Conv2d(768,64,1),nn.GroupNorm(8,64),nn.GELU(),
          nn.Conv2d(64,64,3,padding=1),nn.GroupNorm(8,64),nn.GELU(),
          nn.Conv2d(64,32,3,padding=1),nn.GELU(),nn.Conv2d(32,1,1))
    def forward(self,features):return self.layers(features)


def mask_loss(logits,target):
    # Authentic controls receive BCE. Dice is averaged over edited samples only;
    # empty controls cannot earn a perfect Dice reward for hiding all edits.
    bce=F.binary_cross_entropy_with_logits(logits,target,pos_weight=torch.tensor(4.,device=logits.device))
    p=logits.sigmoid().flatten(1);t=target.flatten(1);edited=t.sum(1)>0
    dice=1-(2*(p*t).sum(1)+1e-6)/(p.sum(1)+t.sum(1)+1e-6)
    return bce+(dice[edited].mean() if edited.any() else logits.sum()*0)


def operating_metrics(probabilities,targets,rows,threshold):
    groups={}
    for p,t,row in zip(probabilities,targets,rows,strict=True):
        pred=p>=threshold;truth=t>=.5;intersection=int((pred&truth).sum());union=int((pred|truth).sum())
        count=int(pred.sum())+int(truth.sum())
        value=dict(dice=2*intersection/count if count else None,iou=intersection/union if union else None,
          area=float(pred.mean()),any_highlight=bool(pred.any()),empty=not bool(pred.any()))
        groups.setdefault(row['condition'],[]).append(value)
    results={}
    for condition,values in groups.items():
        result=dict(images=len(values),empty_masks=sum(v['empty'] for v in values),
          highlighted_area_mean=float(np.mean([v['area'] for v in values])),
          images_with_highlights=sum(v['any_highlight'] for v in values))
        if condition!='authentic_control':
            result['dice']=float(np.mean([v['dice'] if v['dice'] is not None else 0 for v in values]))
            result['iou']=float(np.mean([v['iou'] if v['iou'] is not None else 0 for v in values]))
        results[condition]=result
    return results


def select_threshold(probabilities,targets,rows):
    if not rows or any(r['split']!='validation' for r in rows):raise ValueError('Threshold may use validation only')
    probabilities=np.asarray(probabilities);targets=np.asarray(targets)
    if probabilities.shape!=targets.shape or probabilities.shape!=(len(rows),32,32) or not np.isfinite(probabilities).all() or not np.isfinite(targets).all() or probabilities.min()<0 or probabilities.max()>1 or targets.min()<0 or targets.max()>1:raise ValueError('Invalid validation tensors')
    if {r['condition'] for r in rows}!={'authentic_control','segm_flux1dev','random_flux1dev'}:raise ValueError('Missing validation conditions')
    choices=[]
    for threshold in np.linspace(.01,.99,99):
        groups=operating_metrics(probabilities,targets,rows,float(threshold));controls=groups['authentic_control']
        fpr=controls['images_with_highlights']/controls['images']
        if fpr<=.10 and controls['highlighted_area_mean']<=.01:
            mean=np.mean([groups[c]['dice'] for c in ('segm_flux1dev','random_flux1dev')])
            choices.append((float(mean),float(threshold),groups))
    if not choices:return dict(status='no_acceptable_validation_threshold',threshold=None,release_approved=False)
    score,threshold,groups=max(choices,key=lambda choice:(choice[0],choice[1]))
    passed=all(groups[c]['dice']>=.5 for c in ('segm_flux1dev','random_flux1dev'))
    return dict(status='validation_gate_passed_needs_fresh_test' if passed else 'validation_gate_failed',
      threshold=threshold,edited_macro_dice=score,groups=groups,release_approved=False,
      note='Validation selection only; scores are not calibrated probabilities. No production approval.')
