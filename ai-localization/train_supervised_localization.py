"""Explicit CPU/CUDA training workflow. No test-set access or automatic deployment."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import platform
import random
import subprocess
import time
import numpy as np
from PIL import Image
import torch
from torch.nn import functional as F
from torch.utils.data import Dataset,DataLoader
from supervised_localizer import (ARCHITECTURE,REVISION,CHECKPOINT_SHA,FeatureExtractor,MaskHead,
    mask_loss,relative_file,sha,training_rows,select_threshold)

SEED=20261009


def seed_everything():
    random.seed(SEED);np.random.seed(SEED);torch.manual_seed(SEED)
    if torch.cuda.is_available():torch.cuda.manual_seed_all(SEED)
    torch.set_num_threads(2)
    torch.backends.cudnn.benchmark=False
    torch.backends.cudnn.deterministic=True


def write_json(path,value):
    Path(path).write_text(json.dumps(value,indent=2,allow_nan=False),encoding='utf-8')


def target_for(data,row):
    with Image.open(relative_file(data,row['mask'])) as image:
        raw=np.array(image.convert('L').resize((448,448),Image.Resampling.NEAREST))>127
    return raw.reshape(32,14,32,14).mean(axis=(1,3)).astype(np.float32)


def validate_assets(data,rows):
    hashes=json.loads((data/'asset-sha256.json').read_text())
    for row in rows:
        for field in ('image','mask'):
            if sha(relative_file(data,row[field]))!=hashes.get(row[field]):raise ValueError('Dataset asset checksum mismatch')


def cache_features(args):
    rows=training_rows(args.data);validate_assets(args.data,rows)
    identity=dict(architecture=ARCHITECTURE,encoder_revision=REVISION,encoder_sha256=CHECKPOINT_SHA,
      training_manifest_sha256=sha(args.data/'training-manifest.csv'))
    args.cache.mkdir(parents=True,exist_ok=True);identity_path=args.cache/'identity.json'
    if identity_path.exists():
        if json.loads(identity_path.read_text())!=identity:raise ValueError('Cache belongs to a different experiment')
    elif any(args.cache.iterdir()):raise ValueError('Unidentified nonempty cache')
    else:write_json(identity_path,identity)
    extractor=FeatureExtractor(args.source,args.checkpoint,args.device)
    records=[]
    for index,row in enumerate(rows):
        path=args.cache/f'{index:05d}.npz';sidecar=path.with_suffix('.json')
        identity_row=dict(sample_id=row['sample_id'],image_sha256=sha(relative_file(args.data,row['image'])),
          mask_sha256=sha(relative_file(args.data,row['mask'])))
        if path.exists() and sidecar.exists():
            saved=json.loads(sidecar.read_text())
            if any(saved.get(k)!=v for k,v in identity_row.items()) or sha(path)!=saved['sha256']:raise ValueError('Changed cached feature; preserve and investigate')
        else:
            features=extractor(relative_file(args.data,row['image']).read_bytes())
            target=target_for(args.data,row)
            temporary=path.with_suffix('.partial')
            with temporary.open('wb') as handle:np.savez_compressed(handle,features=features,target=target)
            temporary.replace(path);saved={**identity_row,'sha256':sha(path)};write_json(sidecar,saved)
        records.append({**row,'file':path.name,'sha256':saved['sha256']})
        print(f'Features [{index+1}/{len(rows)}] {row["sample_id"]}',flush=True)
    write_json(args.cache/'index.json',{**identity,'records':records})


class CachedSamples(Dataset):
    def __init__(self,cache,records,augment=False):self.cache=cache;self.records=records;self.augment=augment
    def __len__(self):return len(self.records)
    def __getitem__(self,index):
        with np.load(relative_file(self.cache,self.records[index]['file']),allow_pickle=False) as data:
            x=torch.from_numpy(data['features'].astype(np.float32));y=torch.from_numpy(data['target'].astype(np.float32)).unsqueeze(0)
        if x.shape!=(768,32,32) or y.shape!=(1,32,32) or not torch.isfinite(x).all() or not torch.isfinite(y).all() or y.min()<0 or y.max()>1:raise ValueError('Invalid cached tensors')
        if self.augment and random.random()<.5:x=x.flip(-1);y=y.flip(-1)
        return x,y


def train(args):
    device=training_device(args.device)
    rows=training_rows(args.data);index=json.loads((args.cache/'index.json').read_text())
    if index.get('architecture')!=ARCHITECTURE or index.get('encoder_sha256')!=CHECKPOINT_SHA or index.get('training_manifest_sha256')!=sha(args.data/'training-manifest.csv'):raise ValueError('Cache provenance mismatch')
    records=index['records']
    if [r['sample_id'] for r in records]!=[r['sample_id'] for r in rows]:raise ValueError('Incomplete/reordered cache')
    for row,record in zip(rows,records,strict=True):
        if any(record.get(key)!=value for key,value in row.items()):raise ValueError('Cached split/metadata mismatch')
        if sha(relative_file(args.cache,record['file']))!=record['sha256']:raise ValueError('Cache checksum mismatch')
    args.output.mkdir(parents=True,exist_ok=False)
    split={name:[r for r in records if r['split']==name] for name in ('train','validation')}
    loaders={name:DataLoader(CachedSamples(args.cache,values,name=='train'),batch_size=8,shuffle=name=='train',num_workers=0) for name,values in split.items()}
    model=MaskHead().to(device);optimizer=torch.optim.AdamW(model.parameters(),lr=.001,weight_decay=.0001)
    environment=dict(python=platform.python_version(),torch=torch.__version__,numpy=np.__version__,device=str(device),
      threads=torch.get_num_threads(),gpu=torch.cuda.get_device_name(0) if device.type=='cuda' else None,
      vram_bytes=torch.cuda.get_device_properties(0).total_memory if device.type=='cuda' else None,seed=SEED,architecture=ARCHITECTURE,
      train_images=len(split['train']),validation_images=len(split['validation']),test_images_used=0)
    write_json(args.output/'environment.json',environment)
    freeze=subprocess.run([os.sys.executable,'-m','pip','freeze'],capture_output=True,text=True,check=True)
    (args.output/'environment-freeze.txt').write_text(freeze.stdout,encoding='utf-8')
    best=float('inf');history=[];started=time.monotonic()
    for epoch in range(1,21):
        values={}
        for name,loader in loaders.items():
            model.train(name=='train');total=0.;count=0
            for features,target in loader:
                features=features.to(device);target=target.to(device)
                with torch.set_grad_enabled(name=='train'):
                    loss=mask_loss(model(features),target)
                    if not torch.isfinite(loss):raise ValueError('Nonfinite training loss')
                    if name=='train':
                        optimizer.zero_grad(set_to_none=True);loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.);optimizer.step()
                total+=loss.item()*len(features);count+=len(features)
            values[name]=total/count
        history.append(dict(epoch=epoch,**values));write_json(args.output/'history.json',history)
        if values['validation']<best:
            best=values['validation'];state={key:value.detach().cpu() for key,value in model.state_dict().items()}
            temporary=args.output/'head.partial';torch.save(state,temporary);temporary.replace(args.output/'best-head.pt')
            write_json(args.output/'checkpoint.json',dict(architecture=ARCHITECTURE,epoch=epoch,validation_loss=best,
              head_sha256=sha(args.output/'best-head.pt'),training_manifest_sha256=sha(args.data/'training-manifest.csv'),
              encoder_sha256=CHECKPOINT_SHA,encoder_revision=REVISION,seed=SEED,release_approved=False))
        print(json.dumps(history[-1]),flush=True)
    model.load_state_dict(torch.load(args.output/'best-head.pt',map_location='cpu',weights_only=True));model.eval()
    probabilities=[];targets=[]
    with torch.inference_mode():
        for features,target in loaders['validation']:
            probabilities.extend(model(features.to(device)).sigmoid().cpu().numpy()[:,0]);targets.extend(target.numpy()[:,0])
    result=select_threshold(probabilities,targets,split['validation'])
    result.update(head_sha256=sha(args.output/'best-head.pt'),training_manifest_sha256=sha(args.data/'training-manifest.csv'),architecture=ARCHITECTURE)
    write_json(args.output/'validation-report.json',result)
    np.savez_compressed(args.output/'validation-predictions.npz',probabilities=np.asarray(probabilities),targets=np.asarray(targets))
    write_json(args.output/'validation-sample-order.json',[r['sample_id'] for r in split['validation']])
    write_json(args.output/'completion.json',dict(training_complete=True,test_evaluated=False,production_enabled=False,
      seconds=time.monotonic()-started,peak_gpu_memory_bytes=torch.cuda.max_memory_allocated() if device.type=='cuda' else None,validation_status=result['status']))
    print('Training finished. Return the complete output folder to Kent; do not deploy.',flush=True)


def smoke(args):
    rows=training_rows(args.data);row=next(r for r in rows if r['split']=='train' and r['condition']=='segm_flux1dev')
    extractor=FeatureExtractor(args.source,args.checkpoint,'cpu')
    features=torch.from_numpy(extractor(relative_file(args.data,row['image']).read_bytes()).astype(np.float32)).unsqueeze(0)
    target=torch.from_numpy(target_for(args.data,row)).unsqueeze(0).unsqueeze(0)
    model=MaskHead();optimizer=torch.optim.AdamW(model.parameters(),lr=.001);losses=[]
    for _ in range(3):
        loss=mask_loss(model(features),target);optimizer.zero_grad();loss.backward();optimizer.step();losses.append(loss.item())
    if not all(np.isfinite(losses)):raise ValueError('Smoke loss invalid')
    args.output.mkdir(parents=True,exist_ok=False)
    write_json(args.output/'smoke.json',dict(status='passed',code_smoke_only=True,real_training_completed=False,
      note='Three optimizer steps on one already-inspected training image; no checkpoint retained or accuracy claim.',
      feature_shape=list(features.shape),losses=losses,parameters=sum(p.numel() for p in model.parameters())))
    print('CPU forward/backward smoke passed. This is NOT completed model training.',flush=True)


def training_device(value):
    if value not in {'cuda','cpu'}:raise ValueError('Choose cpu or cuda explicitly')
    if value=='cuda' and not torch.cuda.is_available():raise RuntimeError('CUDA requested but unavailable; never silently fall back to CPU')
    return torch.device(value)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=['cache','train','smoke'])
    parser.add_argument('--data',type=Path,required=True);parser.add_argument('--cache',type=Path)
    parser.add_argument('--source',type=Path);parser.add_argument('--checkpoint',type=Path)
    parser.add_argument('--output',type=Path);parser.add_argument('--device',choices=['cuda','cpu'],default='cuda')
    args=parser.parse_args();seed_everything()
    required={'cache':['cache','source','checkpoint'],'train':['cache','output'],'smoke':['source','checkpoint','output']}[args.action]
    for key in required:
        if getattr(args,key) is None:parser.error('--'+key+' is required')
    training_device(args.device if args.action!='smoke' else 'cpu')
    {'cache':cache_features,'train':train,'smoke':smoke}[args.action](args)
