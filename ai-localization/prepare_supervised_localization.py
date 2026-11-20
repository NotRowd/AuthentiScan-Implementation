"""Reuse cached archives; quarantine an untouched source-disjoint test cohort."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import tarfile

from prepare_tgif2_flux1dev_subset import prepare,source_ids_by_split,ARCHIVE_PATHS,sha256_file


def select_cohorts(available,previous):
    old=set().union(*map(set,previous.values()))
    if not old.issubset(available):raise ValueError('Previously inspected sources missing')
    fresh=sorted(set(available)-old,key=lambda value:hashlib.sha256(('supervised-v1|'+value).encode()).hexdigest())
    if len(fresh)<120:raise ValueError('Need 120 previously uninspected sources')
    return dict(train=sorted(old,key=int),validation=fresh[:40],test=fresh[40:120])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archives',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();archive_root=args.archives.resolve();output=args.output.resolve()
    if output.exists():raise FileExistsError(output)
    patterns=[('random_mask',r'(\d+)_mask_random\.png'),('semantic_mask',r'(\d+)_mask_segm\.png_ps_mask\.png')]
    populations=[]
    for key,pattern in patterns:
        with tarfile.open(archive_root/ARCHIVE_PATHS[key],'r:gz') as archive:
            populations.append({match.group(1) for member in archive if member.isfile() and (match:=re.fullmatch(pattern,Path(member.name).name))})
    cohorts=select_cohorts(set.intersection(*populations),source_ids_by_split())
    print('Frozen source counts:',{key:len(value) for key,value in cohorts.items()},flush=True)
    rows=prepare(archive_root,output,custom_cohorts=cohorts)
    # Check identical originals cannot cross splits, and retain every asset hash.
    original_owners={};hashes={}
    for row in rows:
        for key in ('image','mask'):hashes[row[key]]=sha256_file(output/row[key])
        if row['image_role']=='aligned_original':
            digest=hashes[row['image']]
            if digest in original_owners and original_owners[digest]!=row['split']:raise ValueError('Identical original crosses splits')
            original_owners[digest]=row['split']
    for name,splits in [('training-manifest.csv',{'train','validation'}),('sealed-test-manifest.csv',{'test'})]:
        with (output/name).open('w',newline='',encoding='utf-8') as handle:
            writer=csv.DictWriter(handle,fieldnames=rows[0]);writer.writeheader();writer.writerows(row for row in rows if row['split'] in splits)
    protocol=dict(schema_version=1,experiment='supervised-localization-v1',cohorts=cohorts,
      historical_test_reused_only_for_training=True,new_test_previously_uninspected=True,
      archive_partition_note='Custom experimental split within upstream testing archives; not an official TGIF train/test score.',
      train_sources=160,validation_sources=40,test_sources=80,
      architecture='Frozen pinned DINOv2-S/14 block 11 clean features + absolute Haar-perturbation feature difference; trained 32x32 convolutional mask head.',
      epochs=20,seed=20261009,learning_rate=.001,batch_size=8,
      threshold_selection='Validation only; maximize edited macro Dice subject to <=10% authentic images with any highlight and <=1% mean authentic highlighted area.',
      prototype_quality_gate='Validation edited macro Dice >=0.50 separately for semantic and random conditions, plus both false-highlight constraints; no automatic release.',
      test_rule='Return best head and validation report to Kent. Do not extract features for, train on, inspect, or evaluate the sealed test set on Loyd PC.',
      limitations=['FLUX.1-dev partial edits only','Coarse 32x32 grid','Small experimental cohort; results may fail','No broad AI authorship or anomaly claim'])
    (output/'protocol.json').write_text(json.dumps(protocol,indent=2),encoding='utf-8')
    (output/'asset-sha256.json').write_text(json.dumps(hashes,indent=2),encoding='utf-8')
    print('Prepared supervised experiment without evaluating held-out images.',flush=True)


if __name__=='__main__':main()
