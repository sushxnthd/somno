#!/usr/bin/env python3
"""Somno INSEF V3: conservative subject-level conformal-style early clearance."""
from pathlib import Path
import importlib.util, json, math, os
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

HERE = Path(__file__).parent
V2 = HERE / 'run_wakeapp_selective_v2.py'
spec = importlib.util.spec_from_file_location('somno_v2', V2)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

OUT = Path(os.environ.get('SOMNO_OUT', 'research/insef-2026/results_v3'))
OUT.mkdir(parents=True, exist_ok=True)
ALPHA = 0.05


def calibrate_threshold(cal, probs):
    q = cal[['id','label']].copy()
    q['p'] = probs
    pos = q[q.label == 1]
    mins = pos.groupby('id').p.min().sort_values().to_numpy(dtype=float)
    mm = len(mins)
    k = int(math.floor(ALPHA * (mm + 1)))
    if k < 1 or mm == 0:
        return -math.inf, mm, k, mins
    return float(mins[k-1]), mm, k, mins


def metrics(df, probs, thresholds):
    y = df.label.to_numpy(dtype=int)
    clear = probs < thresholds
    n = len(df); pos = int((y==1).sum()); neg = int((y==0).sum())
    false = (y==1) & clear
    tnclear = (y==0) & clear
    impaired_subjects = set(df.loc[y==1,'id'].astype(int).tolist())
    false_subjects = set(df.loc[false,'id'].astype(int).tolist())
    nclear = int(clear.sum()); nfalse=int(false.sum()); nt=int(tnclear.sum())
    return {
        'n':n, 'n_positive_sessions':pos, 'n_negative_sessions':neg,
        'n_cleared':nclear, 'n_false_reassurances':nfalse,
        'coverage':float(nclear/n) if n else 0.0,
        'safe_session_clearance_rate':float(nt/neg) if neg else 0.0,
        'session_false_reassurance_rate':float(nfalse/pos) if pos else 0.0,
        'n_impaired_subjects':len(impaired_subjects),
        'n_false_reassured_subjects':len(false_subjects),
        'subject_false_reassurance_rate':float(len(false_subjects)/len(impaired_subjects)) if impaired_subjects else 0.0,
        'npv_cleared':float(nt/nclear) if nclear else float('nan'),
    }


def evaluate(df, feats, name):
    groups=df.id.to_numpy(); y=df.label.to_numpy(dtype=int)
    outer=GroupKFold(n_splits=5,shuffle=True,random_state=3030)
    probs=np.full(len(df),np.nan); thresholds=np.full(len(df),-math.inf); foldrows=[]
    for fold,(tr,te) in enumerate(outer.split(df[feats],y,groups),start=1):
        train=df.iloc[tr].reset_index(drop=True); test=df.iloc[te]
        gtrain=train.id.to_numpy(); ytrain=train.label.to_numpy(dtype=int)
        inner=GroupKFold(n_splits=4,shuffle=True,random_state=4040+fold)
        proper_idx,cal_idx=next(inner.split(train[feats],ytrain,gtrain))
        proper=train.iloc[proper_idx]; cal=train.iloc[cal_idx]
        model=m.fit_model(proper[feats],proper.label.to_numpy(dtype=int))
        cp=m.predict(model,cal[feats]); tp=m.predict(model,test[feats])
        thr,n_cal_pos_subj,k,mins=calibrate_threshold(cal,cp)
        probs[te]=tp; thresholds[te]=thr
        fs=metrics(test,tp,np.full(len(test),thr))
        foldrows.append({'model':name,'fold':fold,'proper_train_subjects':int(proper.id.nunique()),
                         'calibration_subjects':int(cal.id.nunique()),'impaired_calibration_subjects':int(n_cal_pos_subj),
                         'conformal_k':int(k),'threshold':thr if np.isfinite(thr) else None,**{f'test_{kk}':vv for kk,vv in fs.items()}})
    agg=metrics(df,probs,thresholds)
    pred=df[['id','time','label','suffix_speed_ratio']].copy()
    pred['model']=name; pred['probability']=probs; pred['threshold']=thresholds; pred['cleared']=(probs<thresholds).astype(int)
    return {'model':name,**agg},pd.DataFrame(foldrows),pred


def main():
    att,kss=m.load(); df=m.build_records(att,kss)
    a,fa,pa=evaluate(df,m.OBJ,'objective_only')
    b,fb,pb=evaluate(df,m.CTX,'somno_context')
    gain=100*(b['safe_session_clearance_rate']-a['safe_session_clearance_rate'])
    promotion=(b['session_false_reassurance_rate']<=0.05 and
               b['subject_false_reassurance_rate']<=0.05 and
               np.isfinite(b['npv_cleared']) and b['npv_cleared']>=0.95 and
               b['safe_session_clearance_rate']>=0.15 and gain>=5.0)
    summary={'protocol':'Somno INSEF V3 subject-level conformal-style clearance','alpha':ALPHA,
             'prefix_trials':m.PREFIX_N,'suffix_trials':m.SUFFIX_N,
             'n_subjects':int(df.id.nunique()),'n_sessions':int(len(df)),'prevalence':float(df.label.mean()),
             'objective_only':a,'somno_context':b,'safe_clearance_gain_pp':gain,'promotion_gate':bool(promotion)}
    pd.concat([fa,fb],ignore_index=True).to_csv(OUT/'v3_fold_metrics.csv',index=False)
    pd.concat([pa,pb],ignore_index=True).to_csv(OUT/'v3_predictions.csv',index=False)
    pd.DataFrame([a,b]).to_csv(OUT/'v3_summary.csv',index=False)
    with open(OUT/'v3_summary.json','w') as f: json.dump(summary,f,indent=2)
    print('V3_PROMOTION_GATE=' + ('PASS' if promotion else 'FAIL'))
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
