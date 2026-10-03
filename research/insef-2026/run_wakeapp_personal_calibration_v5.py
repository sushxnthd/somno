#!/usr/bin/env python3
"""Somno INSEF V5: forward-only personal calibration of KSS-to-vigilance mapping."""
from pathlib import Path
import importlib.util, json, math, os
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.metrics import balanced_accuracy_score

HERE=Path(__file__).parent

def loadmod(name,path):
    s=importlib.util.spec_from_file_location(name,path); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); return m

v2=loadmod('somno_v2',HERE/'run_wakeapp_selective_v2.py')
v4=loadmod('somno_v4',HERE/'run_wakeapp_longitudinal_v4.py')
OUT=Path(os.environ.get('SOMNO_OUT','research/insef-2026/results_v5')); OUT.mkdir(parents=True,exist_ok=True)
FEATURES=['kss','delta_kss','baseline_kss','log_baseline_median']
CUTOFF=v2.SPEED_CUTOFF


def model():
    return make_pipeline(SimpleImputer(strategy='median'),StandardScaler(),Ridge(alpha=1.0))


def classification_metrics(y_cont,pred_cont):
    y=(np.asarray(y_cont)<=CUTOFF).astype(int); p=(np.asarray(pred_cont)<=CUTOFF).astype(int)
    pos=int(y.sum()); fn=int(np.sum((y==1)&(p==0)))
    return {
        'n_positive':pos,'false_negatives':fn,
        'false_negative_rate':float(fn/pos) if pos else 0.0,
        'balanced_accuracy':float(balanced_accuracy_score(y,p)) if len(np.unique(y))>1 else float('nan')
    }


def main():
    att,kss=v2.load(); df=v4.build_longitudinal(att,kss)
    df['baseline_kss']=df['kss']-df['delta_kss']
    df=df.sort_values(['id','time']).reset_index(drop=True)
    pred_rows=[]
    for sid in sorted(df.id.unique()):
        train=df[df.id!=sid]
        test=df[df.id==sid].copy().sort_values('time')
        if train.empty or test.empty: continue
        mdl=model(); mdl.fit(train[FEATURES],train['suffix_speed_ratio'])
        test['population_prediction']=mdl.predict(test[FEATURES])
        # Forward-only: score only sessions with at least one earlier follow-up.
        for ix,row in test.iterrows():
            t=int(row.time)
            prior=test[(test.time<t)&(test.time>=1)]
            if t<2 or prior.empty: continue
            residuals=prior['suffix_speed_ratio'].to_numpy(float)-prior['population_prediction'].to_numpy(float)
            n=len(residuals); shrink=n/(n+1.0); offset=shrink*float(np.mean(residuals))
            pred_rows.append({
                'id':int(sid),'time':t,'truth':float(row.suffix_speed_ratio),
                'population_prediction':float(row.population_prediction),
                'personalized_prediction':float(row.population_prediction+offset),
                'n_prior':int(n),'residual_mean':float(np.mean(residuals)),'shrinkage':float(shrink),
                'personal_offset':float(offset),'kss':row.kss,'delta_kss':row.delta_kss
            })
    p=pd.DataFrame(pred_rows)
    if p.empty: raise RuntimeError('No forward-scored sessions available.')
    err_pop=np.abs(p.truth-p.population_prediction); err_per=np.abs(p.truth-p.personalized_prediction)
    rmse_pop=float(np.sqrt(np.mean((p.truth-p.population_prediction)**2)))
    rmse_per=float(np.sqrt(np.mean((p.truth-p.personalized_prediction)**2)))
    mae_pop=float(err_pop.mean()); mae_per=float(err_per.mean())
    cp=classification_metrics(p.truth,p.population_prediction); cs=classification_metrics(p.truth,p.personalized_prediction)
    subj=(p.assign(pop_err=err_pop,per_err=err_per).groupby('id')[['pop_err','per_err']].mean().reset_index())
    subj['improvement']=subj.pop_err-subj.per_err
    rng=np.random.default_rng(5050); vals=subj.improvement.to_numpy(float); boots=np.empty(10000)
    for i in range(10000): boots[i]=float(np.mean(rng.choice(vals,size=len(vals),replace=True)))
    lo,hi=np.quantile(boots,[0.025,0.975]); mean_imp=float(vals.mean())
    reduction=1-mae_per/mae_pop
    promotion=(reduction>=0.05 and rmse_per<rmse_pop and lo>0 and
               cs['false_negative_rate']<=cp['false_negative_rate']+0.02)
    summary={
        'protocol':'Somno INSEF V5 personal KSS calibration','n_subjects':int(p.id.nunique()),
        'n_future_sessions':int(len(p)),'speed_cutoff_ratio':float(CUTOFF),
        'population':{'mae':mae_pop,'rmse':rmse_pop,**cp},
        'personalized':{'mae':mae_per,'rmse':rmse_per,**cs},
        'mae_relative_reduction':float(reduction),'mean_subject_mae_improvement':mean_imp,
        'bootstrap_95_ci_subject_mae_improvement':[float(lo),float(hi)],
        'promotion_gate':bool(promotion)
    }
    p.to_csv(OUT/'v5_predictions.csv',index=False); subj.to_csv(OUT/'v5_subject_metrics.csv',index=False)
    with open(OUT/'v5_summary.json','w') as f: json.dump(summary,f,indent=2)
    print('V5_PROMOTION_GATE='+('PASS' if promotion else 'FAIL'))
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
