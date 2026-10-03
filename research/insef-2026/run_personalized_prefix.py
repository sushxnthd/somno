#!/usr/bin/env python3
import importlib.util, json, math
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
OUT = HERE / 'results_personalized_prefix'
OUT.mkdir(parents=True, exist_ok=True)
BUDGETS = [5,8,10,12,15,20,25]
TAU = 0.15

# Reuse the already-frozen WakeApp parser and label definition.
p = HERE / 'run_wakeapp_sequential.py'
spec = importlib.util.spec_from_file_location('frozen', p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def load_mapped():
    att, kss = m.load_data()
    ren = {}
    if 'time_point' not in att.columns and 'time' in att.columns: ren['time']='time_point'
    if 'trial_nr' not in att.columns and 'order_in_test' in att.columns: ren['order_in_test']='trial_nr'
    if 'false_response' not in att.columns and 'false_responses' in att.columns: ren['false_responses']='false_response'
    if 'sleep_condition_lag' not in att.columns and 'sd' in att.columns: ren['sd']='sleep_condition_lag'
    if 'trial_type' not in att.columns and 'stimuli_type' in att.columns: ren['stimuli_type']='trial_type'
    return att.rename(columns=ren), kss


def features(r, n):
    x = np.asarray(r['rts'][:n], dtype=float)
    logs = np.log(x)
    med = float(np.median(x))
    q90 = float(np.quantile(x, .90))
    base_med = max(float(r['base_median']), 1e-9)
    base_sd = max(float(r['base_log_sd']), 0.05)
    split = max(1, n//2)
    a = x[:split]
    b = x[split:]
    slope = (float(np.median(b))-float(np.median(a)))/base_med if len(b) else 0.0
    resp_speed = float(np.mean(1000.0/x))
    base_speed = 1000.0/base_med
    return np.array([
        math.log(max(med/base_med,1e-9)),
        float(np.mean(logs)-r['base_log_mean']),
        float(np.std(logs,ddof=1) if n>1 else 0.0)/base_sd,
        q90/base_med,
        float(np.mean(x >= base_med*(1.0+TAU))),
        resp_speed/max(base_speed,1e-9),
        slope,
    ], dtype=float)


def eval_budget(records, n):
    rr = [r for r in records if len(r['rts']) >= n]
    ids = sorted(set(r['id'] for r in rr))
    pred=[]; truth=[]; baseline=[]; rows=[]
    for held in ids:
        tr=[r for r in rr if r['id']!=held]
        te=[r for r in rr if r['id']==held]
        if not tr or not te: continue
        Xtr=np.vstack([features(r,n) for r in tr]); ytr=np.array([r['label'] for r in tr],dtype=int)
        Xte=np.vstack([features(r,n) for r in te]); yte=np.array([r['label'] for r in te],dtype=int)
        if len(np.unique(ytr))<2:
            pte=np.full(len(te), float(np.mean(ytr)))
        else:
            clf=make_pipeline(StandardScaler(), LogisticRegression(C=1.0,solver='liblinear',max_iter=2000,random_state=2026))
            clf.fit(Xtr,ytr); pte=clf.predict_proba(Xte)[:,1]
        ph=(pte>=0.5).astype(int)
        pb=np.array([int(np.median(r['rts'][:n])/r['base_median'] >= 1+TAU) for r in te],dtype=int)
        for r,y,p,b,pr in zip(te,yte,ph,pb,pte):
            rows.append({'id':r['id'],'time':r['time'],'budget':n,'label':int(y),'prediction':int(p),'fixed_median':int(b),'probability':float(pr)})
        pred.extend(ph.tolist()); truth.extend(yte.tolist()); baseline.extend(pb.tolist())
    y=np.array(truth,dtype=int); p=np.array(pred,dtype=int); b=np.array(baseline,dtype=int)
    def metr(z):
        pos=(y==1).sum(); fn=((y==1)&(z==0)).sum()
        return {'agreement':float(np.mean(y==z)), 'fnr':float(fn/pos) if pos else 0.0, 'n_positive':int(pos), 'n_false_negative':int(fn)}
    mm=metr(p); mb=metr(b)
    out={'budget':n,'n_sessions':int(len(y)),'n_subjects':int(len(set(r['id'] for r in rr))),
         'model':mm,'fixed_median':mb,'agreement_gain':float(mm['agreement']-mb['agreement'])}
    out['primary_gate_at_budget'] = bool(n<=15 and mm['agreement']>=0.95 and mm['fnr']<=0.10 and out['agreement_gain']>=0.02)
    return out,rows


def main():
    att,kss=load_mapped()
    records,_,_=m.prepare_sessions(att,kss,TAU)
    results=[]; allrows=[]
    for n in BUDGETS:
        res,rows=eval_budget(records,n); results.append(res); allrows.extend(rows)
    promoted=any(r['primary_gate_at_budget'] for r in results)
    summary={'tau':TAU,'n_followup_sessions_total':len(records),'results':results,'promotion_gate':promoted}
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2))
    pd.DataFrame(allrows).to_csv(OUT/'predictions.csv',index=False)
    pd.DataFrame([{
        'budget':r['budget'],'n_sessions':r['n_sessions'],'n_subjects':r['n_subjects'],
        'model_agreement':r['model']['agreement'],'model_fnr':r['model']['fnr'],
        'fixed_agreement':r['fixed_median']['agreement'],'fixed_fnr':r['fixed_median']['fnr'],
        'agreement_gain':r['agreement_gain'],'gate':r['primary_gate_at_budget']
    } for r in results]).to_csv(OUT/'budget_summary.csv',index=False)
    print('PERSONALIZED_PREFIX_PROMOTION_GATE=' + ('PASS' if promoted else 'FAIL'))
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
