#!/usr/bin/env python3
import importlib.util, json, math
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
OUT = HERE / 'results_conformal_pvt'
OUT.mkdir(parents=True, exist_ok=True)
BUDGETS = [5,8,10,12,15,20,25]
TAU = 0.15
ALPHAS = [0.05, 0.10]

# Reuse frozen WakeApp parsing/label code and frozen feature definition.
p0 = HERE / 'run_wakeapp_sequential.py'
spec0 = importlib.util.spec_from_file_location('frozen_parser', p0)
base = importlib.util.module_from_spec(spec0); spec0.loader.exec_module(base)
p1 = HERE / 'run_personalized_prefix.py'
spec1 = importlib.util.spec_from_file_location('frozen_prefix', p1)
prefix = importlib.util.module_from_spec(spec1); spec1.loader.exec_module(prefix)


def load_mapped():
    att,kss=base.load_data(); ren={}
    if 'time_point' not in att.columns and 'time' in att.columns: ren['time']='time_point'
    if 'trial_nr' not in att.columns and 'order_in_test' in att.columns: ren['order_in_test']='trial_nr'
    if 'false_response' not in att.columns and 'false_responses' in att.columns: ren['false_responses']='false_response'
    if 'sleep_condition_lag' not in att.columns and 'sd' in att.columns: ren['sd']='sleep_condition_lag'
    if 'trial_type' not in att.columns and 'stimuli_type' in att.columns: ren['stimuli_type']='trial_type'
    return att.rename(columns=ren),kss


def probs_for(model, records, n):
    X=np.vstack([prefix.features(r,n) for r in records])
    return model.predict_proba(X)[:,1]


def fit_model(records,n):
    X=np.vstack([prefix.features(r,n) for r in records]); y=np.array([r['label'] for r in records],dtype=int)
    if len(np.unique(y))<2:
        return ('constant',float(np.mean(y)))
    model=make_pipeline(StandardScaler(),LogisticRegression(C=1.0,solver='liblinear',max_iter=2000,random_state=2026))
    model.fit(X,y); return ('model',model)


def predict_prob(fitted,records,n):
    kind,obj=fitted
    if kind=='constant': return np.full(len(records),obj,dtype=float)
    return probs_for(obj,records,n)


def conformal_quantile(scores,alpha):
    scores=np.sort(np.asarray(scores,dtype=float))
    if len(scores)==0: return 1.0
    k=int(math.ceil((len(scores)+1)*(1-alpha)))
    k=max(1,min(k,len(scores)))
    return float(scores[k-1])


def evaluate_budget(records,fold_of,n,alpha):
    eligible=[r for r in records if len(r['rts'])>=n]
    rows=[]
    for f in range(5):
        test=[r for r in eligible if fold_of[r['id']]==f]
        cal=[r for r in eligible if fold_of[r['id']]==((f+1)%5)]
        train=[r for r in eligible if fold_of[r['id']] not in (f,(f+1)%5)]
        if not test or not cal or not train: continue
        model=fit_model(train,n)
        pc=predict_prob(model,cal,n); yc=np.array([r['label'] for r in cal],dtype=int)
        scores0=pc[yc==0]                 # 1-p(y=0) = p1
        scores1=(1-pc)[yc==1]            # 1-p(y=1)
        q0=conformal_quantile(scores0,alpha); q1=conformal_quantile(scores1,alpha)
        pt=predict_prob(model,test,n)
        for r,p in zip(test,pt):
            inc0=bool(p<=q0); inc1=bool((1-p)<=q1)
            if inc0 and not inc1: decision=0
            elif inc1 and not inc0: decision=1
            else: decision=-1
            fixed=int(np.median(r['rts'][:n])/r['base_median'] >= 1+TAU)
            rows.append({'id':r['id'],'time':r['time'],'fold':f,'budget':n,'alpha':alpha,'label':int(r['label']),
                         'p_impaired':float(p),'q0':q0,'q1':q1,'include_alert':int(inc0),'include_impaired':int(inc1),
                         'set_size':int(inc0)+int(inc1),'decision':decision,'fixed_median':fixed})
    df=pd.DataFrame(rows)
    if df.empty: return {},df
    decided=df.decision>=0
    truth=df.label.to_numpy(); dec=df.decision.to_numpy(); fixed=df.fixed_median.to_numpy()
    true_in=((df.label==0)&(df.include_alert==1))|((df.label==1)&(df.include_impaired==1))
    pos=(df.label==1); pos_dec=pos&decided
    neg=(df.label==0)
    metrics={
        'budget':n,'alpha':alpha,'n':int(len(df)),
        'singleton_coverage':float(decided.mean()),
        'singleton_accuracy':float((df.loc[decided,'decision']==df.loc[decided,'label']).mean()) if decided.any() else None,
        'impaired_singleton_coverage':float(pos_dec.sum()/pos.sum()) if pos.sum() else None,
        'singleton_fnr':float(((df.loc[pos_dec,'decision']==0).sum())/pos_dec.sum()) if pos_dec.sum() else None,
        'conformal_coverage':float(true_in.mean()),
        'coverage_alert_class':float(true_in[neg].mean()) if neg.sum() else None,
        'coverage_impaired_class':float(true_in[pos].mean()) if pos.sum() else None,
        'both_rate':float(((df.include_alert==1)&(df.include_impaired==1)).mean()),
        'empty_rate':float(((df.include_alert==0)&(df.include_impaired==0)).mean()),
        'fixed_median_accuracy':float(np.mean(fixed==truth)),
        'fixed_median_fnr':float(((pos)&(df.fixed_median==0)).sum()/pos.sum()) if pos.sum() else None,
        'n_positive':int(pos.sum()),'n_positive_decided':int(pos_dec.sum()),'n_decided':int(decided.sum())
    }
    fnr=metrics['singleton_fnr']
    metrics['primary_gate_at_budget']=bool(alpha==0.05 and n<=15 and metrics['singleton_accuracy'] is not None and
        metrics['singleton_accuracy']>=0.95 and fnr is not None and fnr<=0.10 and
        metrics['singleton_coverage']>=0.40 and metrics['impaired_singleton_coverage'] is not None and
        metrics['impaired_singleton_coverage']>=0.20)
    return metrics,df


def main():
    att,kss=load_mapped(); records,_,_=base.prepare_sessions(att,kss,TAU)
    ids=sorted(set(r['id'] for r in records)); fold_of={sid:i%5 for i,sid in enumerate(ids)}
    metrics=[]; frames=[]
    for alpha in ALPHAS:
        for n in BUDGETS:
            m,df=evaluate_budget(records,fold_of,n,alpha); metrics.append(m); frames.append(df)
    mdf=pd.DataFrame(metrics); mdf.to_csv(OUT/'budget_summary.csv',index=False)
    pd.concat(frames,ignore_index=True).to_csv(OUT/'prediction_sets.csv',index=False)
    primary=[m for m in metrics if m and m['alpha']==0.05 and m['budget']<=15]
    passing=[m for m in primary if m['primary_gate_at_budget']]
    headline=min(passing,key=lambda z:z['budget']) if passing else None
    summary={'tau':TAU,'n_subjects':len(ids),'n_followup_sessions':len(records),'primary_alpha':0.05,
             'promotion_gate':bool(headline),'headline_operating_point':headline,'all_metrics':metrics}
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2))
    print('CONFORMAL_PVT_PROMOTION_GATE=' + ('PASS' if headline else 'FAIL'))
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
