"""Verify v2 evidence and compare with the previously audited v1 control."""
import io
import json
from pathlib import Path
import zipfile
import numpy as np
from audit_detectivesam_diagnostic import ROOT, main as audit, sha


def main():
    package=ROOT/'handoff/AuthentiScan-DetectiveSAM-Balanced-Loss-Loyd-v2.zip'
    assert sha(package.read_bytes())=='61a5ea2e3fd8cae1d0b78d472a30bf1426c2633e6d7354daa089affab42832e3'
    archive=Path('D:/Downloads/Return-to-Kent-DetectiveSAM-Balanced.zip')
    old_archive=Path('D:/Downloads/Return-to-Kent-DetectiveSAM-Diagnostic.zip')
    assert sha(old_archive.read_bytes())=='04e21a4a2e3bbdfdf0d21d2721cf9f9f374e0e4595f7418c76290529f9867067'
    output=ROOT/'runs/loyd-detectivesam-balanced-return-2026-10-28'
    result=audit(archive,package,output)
    old=json.loads((ROOT/'runs/loyd-detectivesam-diagnostic-return-2026-10-28/AUDIT.json').read_text())
    with zipfile.ZipFile(old_archive) as a,zipfile.ZipFile(archive) as b,zipfile.ZipFile(package) as p:
        baseline=json.loads(a.read('results/RESULT.json'));current=json.loads(b.read('results/RESULT.json'))
        ref=json.loads(p.read('V1-REFERENCE.json'))
        assert current['historical_v1_decision']==baseline['decision']
        assert ref['before']==json.loads(a.read('results/before/SUMMARY.json'))
        assert ref['after']==json.loads(a.read('results/after/SUMMARY.json'))
        assert current['matched_v1_baseline']['passed']
        for key in ('frozen_sha256_before','trainable_sha256_before','frozen_sha256_after'):
            assert baseline[key]==current[key]
        assert all(current['protocol'][k]==v for k,v in baseline['protocol'].items())
        cases=json.loads(p.read('CASES.json'));max_delta=0.;identical=0
        for c in cases:
            name='results/before/'+c['sample_id']+'.npz'
            with np.load(io.BytesIO(a.read(name)),allow_pickle=False) as x,np.load(io.BytesIO(b.read(name)),allow_pickle=False) as y:
                assert np.array_equal(x['truth'],y['truth'])
                identical+=bool(np.array_equal(x['scores'],y['scores']))
                max_delta=max(max_delta,float(np.max(np.abs(x['scores']-y['scores']))))
        comparisons={}
        for role in ('tiny_fit','development_holdout'):
            comparisons[role]={c:dict(v1=old['groups']['after'][role][c],v2=result['groups']['after'][role][c])
                               for c in ('authentic_control','segm_flux1dev','random_flux1dev')}
        comparison=dict(baseline_maps_identical=identical,baseline_max_absolute_score_difference=max_delta,
                        same_initial_weight_hashes=True,unchanged_old_protocol_fields=True,
                        historical_control_verified=True,comparisons=comparisons,
                        revised_objective_met_quality_checks=result['tiny_fit_passed'] and result['development_holdout_passed'],release_approved=False)
        (output/'V1-COMPARISON.json').write_text(json.dumps(comparison,indent=2))
    print(json.dumps(comparison,indent=2))


if __name__=='__main__':main()
