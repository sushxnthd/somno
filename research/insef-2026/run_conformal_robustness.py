#!/usr/bin/env python3
import importlib.util, json
from pathlib import Path
import numpy as np
import pandas as pd

HERE=Path(__file__).resolve().parent
OUT=HERE/'results_conformal_robustness'; OUT.mkdir(parents=True,exist_ok=True)
SEEDS=list(range(801,851)); N=15; ALPHA=0.05; TAU=0.15

pc=HERE/'run_conformal_pvt.py'
spec=importlib.util.spec_from_file_location('cpvt',pc)
cpvt=importlib.util.module_from_spec(spec); spec.loader.exec_module(cpvt)


def main():
    att,kss=cpvt.load_mapped(); records,_,_=cpvt.base.prepare_sessions(att,kss,TAU)
    ids=sorted(set(r['id'] for r in records)); rows=[]
    for seed in SEEDS:
        rng=np.random.default_rng(seed); sh=np.array(ids,dtype=int); rng.shuffle(sh)
        fold_of={int(sid):i%5 for i,sid in enumerate(sh.tolist())}
        m,_=cpvt.evaluate_budget(records,fold_of,N,ALPHA)
        orig_gate=bool(m['singleton_accuracy']>=0.95 and m['singleton_fnr']<=0.10 and
                       m['singleton_coverage']>=0.40 and m['impaired_singleton_coverage']>=0.20)
        rows.append({'seed':seed,**m,'original_gate':orig_gate})
    df=pd.DataFrame(rows); df.to_csv(OUT/'seed_metrics.csv',index=False)
    gate_count=int(df.original_gate.sum())
    summary={
        'seeds':SEEDS,'n_seeds':len(SEEDS),'budget':N,'alpha':ALPHA,'tau':TAU,
        'gate_pass_count':gate_count,
        'median_singleton_accuracy':float(df.singleton_accuracy.median()),
        'min_singleton_accuracy':float(df.singleton_accuracy.min()),
        'q05_singleton_accuracy':float(df.singleton_accuracy.quantile(.05)),
        'median_singleton_fnr':float(df.singleton_fnr.median()),
        'q95_singleton_fnr':float(df.singleton_fnr.quantile(.95)),
        'median_singleton_coverage':float(df.singleton_coverage.median()),
        'median_impaired_singleton_coverage':float(df.impaired_singleton_coverage.median()),
        'median_conformal_coverage':float(df.conformal_coverage.median()),
        'min_conformal_coverage':float(df.conformal_coverage.min()),
        'max_conformal_coverage':float(df.conformal_coverage.max()),
        'median_fixed_median_accuracy':float(df.fixed_median_accuracy.median()),
        'median_fixed_median_fnr':float(df.fixed_median_fnr.median()),
    }
    summary['robustness_gate']=bool(summary['median_singleton_accuracy']>=0.95 and gate_count>=40 and
        summary['median_singleton_fnr']<=0.10 and summary['median_singleton_coverage']>=0.40 and
        summary['median_impaired_singleton_coverage']>=0.20)
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2))
    print('CONFORMAL_ROBUSTNESS_GATE=' + ('PASS' if summary['robustness_gate'] else 'FAIL'))
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
