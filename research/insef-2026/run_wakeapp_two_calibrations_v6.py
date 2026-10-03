#!/usr/bin/env python3
"""Somno INSEF V6: exact V5 method, scored only after two prior paired check-ins."""
from pathlib import Path
import importlib.util, json, os
import numpy as np
import pandas as pd

HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('v5',HERE/'run_wakeapp_personal_calibration_v5.py')
v5=importlib.util.module_from_spec(spec); spec.loader.exec_module(v5)
OUT=Path(os.environ.get('SOMNO_OUT','research/insef-2026/results_v6')); OUT.mkdir(parents=True,exist_ok=True)


def main():
    att,kss=v5.v2.load(); df=v5.v4.build_longitudinal(att,kss)
    df['baseline_kss']=df['kss']-df['delta_kss']; df=df.sort_values(['id','time']).reset_index(drop=True)
    rows=[]
    for sid in sorted(df.id.unique()):
        train=df[df.id!=sid]; test=df[df.id==sid].copy().sort_values('time')
        if train.empty or test.empty: continue
        mdl=v5.model(); mdl.fit(train[v5.FEATURES],train['suffix_speed_ratio'])
        test['population_prediction']=mdl.predict(test[v5.FEATURES])
        for _,row in test.iterrows():
            prior=test[(test.time<row.time)&(test.time>=1)]
            if len(prior)<2: continue
            residuals=prior.suffix_speed_ratio.to_numpy(float)-prior.population_prediction.to_numpy(float)
            n=len(residuals); shrink=n/(n+1.0); offset=shrink*float(np.mean(residuals))
            rows.append({'id':int(sid),'time':int(row.time),'truth':float(row.suffix_speed_ratio),
                         'population_prediction':float(row.population_prediction),
                         'personalized_prediction':float(row.population_prediction+offset),
                         'n_prior':int(n),'personal_offset':float(offset)})
    p=pd.DataFrame(rows)
    if p.empty: raise RuntimeError('No sessions with two prior paired follow-ups.')
    ep=np.abs(p.truth-p.population_prediction); es=np.abs(p.truth-p.personalized_prediction)
    mae_p=float(ep.mean()); mae_s=float(es.mean())
    rmse_p=float(np.sqrt(np.mean((p.truth-p.population_prediction)**2)))
    rmse_s=float(np.sqrt(np.mean((p.truth-p.personalized_prediction)**2)))
    cp=v5.classification_metrics(p.truth,p.population_prediction); cs=v5.classification_metrics(p.truth,p.personalized_prediction)
    subj=p.assign(pop_err=ep,per_err=es).groupby('id')[['pop_err','per_err']].mean().reset_index()
    subj['improvement']=subj.pop_err-subj.per_err; vals=subj.improvement.to_numpy(float)
    rng=np.random.default_rng(6060); boots=np.empty(10000)
    for i in range(10000): boots[i]=float(np.mean(rng.choice(vals,size=len(vals),replace=True)))
    lo,hi=np.quantile(boots,[0.025,0.975]); reduction=1-mae_s/mae_p
    promotion=(reduction>=0.05 and rmse_s<rmse_p and lo>0 and
               cs['false_negative_rate']<=cp['false_negative_rate']+0.02)
    summary={'protocol':'Somno INSEF V6 two-calibration replication','n_subjects':int(p.id.nunique()),
             'n_future_sessions':int(len(p)),'population':{'mae':mae_p,'rmse':rmse_p,**cp},
             'personalized':{'mae':mae_s,'rmse':rmse_s,**cs},'mae_relative_reduction':float(reduction),
             'mean_subject_mae_improvement':float(vals.mean()),
             'bootstrap_95_ci_subject_mae_improvement':[float(lo),float(hi)],'promotion_gate':bool(promotion)}
    p.to_csv(OUT/'v6_predictions.csv',index=False); subj.to_csv(OUT/'v6_subject_metrics.csv',index=False)
    with open(OUT/'v6_summary.json','w') as f: json.dump(summary,f,indent=2)
    print('V6_PROMOTION_GATE='+('PASS' if promotion else 'FAIL')); print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
