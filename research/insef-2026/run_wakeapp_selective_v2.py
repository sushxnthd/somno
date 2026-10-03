#!/usr/bin/env python3
"""Somno INSEF V2: subject-disjoint selective early PVT decisions.

Protocol is frozen in HYPOTHESIS_V2_SELECTIVE.md. This script deliberately
separates the first 8 follow-up trials (features) from the last 10 trials
(reference outcome), uses time-0 as the personal baseline, and chooses
abstention thresholds on training subjects only.
"""
from pathlib import Path
import json, math, os
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

OUT = Path(os.environ.get('SOMNO_OUT', 'research/insef-2026/results_v2'))
OUT.mkdir(parents=True, exist_ok=True)
ATT_URL = 'https://raw.githubusercontent.com/benholding/WakeApp/master/simple_attention_data.csv'
KSS_URL = 'https://raw.githubusercontent.com/benholding/WakeApp/master/KSS_data.csv'
PREFIX_N = 8
SUFFIX_N = 10
MIN_SESSION_N = PREFIX_N + SUFFIX_N
SLOW_FACTOR = 1.15
SPEED_CUTOFF = 1.0 / SLOW_FACTOR
LOW_GRID = [0.02,0.05,0.10,0.15,0.20,0.25,0.30,0.35,0.40,0.45]
HIGH_GRID = [0.55,0.60,0.65,0.70,0.75,0.80,0.85,0.90,0.95,0.98]


def response_speed(rt):
    a = np.asarray(rt, dtype=float)
    return float(np.mean(1000.0 / a))

def med(rt):
    return float(np.median(np.asarray(rt, dtype=float)))

def cv(rt):
    a = np.asarray(rt, dtype=float)
    m = float(np.mean(a))
    return float(np.std(a, ddof=1) / m) if len(a) > 1 and m > 0 else 0.0


def load():
    att = pd.read_csv(ATT_URL)
    kss = pd.read_csv(KSS_URL)
    att.columns = [str(c).lower() for c in att.columns]
    kss.columns = [str(c).lower() for c in kss.columns]
    return att, kss


def build_kss(kss):
    for c in ['id','time','rating1']:
        kss[c] = pd.to_numeric(kss[c], errors='coerce')
    z = kss[kss.id.notna() & kss.time.notna() & kss.rating1.notna()].copy()
    rt = (z[z.test_type.astype(str).str.lower() == 'reactiontime']
          .groupby(['id','time']).rating1.median().rename('kss_rt'))
    md = z.groupby(['id','time']).rating1.median().rename('kss_med')
    q = pd.concat([rt, md], axis=1).reset_index()
    q['kss'] = q.kss_rt.fillna(q.kss_med)
    return {(int(r.id), int(r.time)): float(r.kss) for r in q.itertuples()}


def build_records(att, kss):
    # Exact WakeApp source schema confirmed before V2 scoring.
    for c in ['id','time','reaction_time','order_in_test','false_responses']:
        att[c] = pd.to_numeric(att[c], errors='coerce')
    valid = att[
        (att.stimuli_type.astype(str).str.lower() == 'p') &
        att.id.notna() & att.time.notna() & att.reaction_time.notna() &
        (att.reaction_time > 0) &
        (att.false_responses.isna() | (att.false_responses == 0))
    ].copy()
    valid = valid.sort_values(['id','time','order_in_test'])
    sessions = {}
    for (sid,t), g in valid.groupby(['id','time']):
        sessions[(int(sid),int(t))] = g.reaction_time.astype(float).to_numpy()
    kmap = build_kss(kss.copy())

    rows=[]
    for sid in sorted({k[0] for k in sessions}):
        base = sessions.get((sid,0))
        if base is None or len(base) < MIN_SESSION_N:
            continue
        bs = response_speed(base); bm = med(base)
        bk = kmap.get((sid,0), np.nan)
        for t in sorted(tt for (ss,tt) in sessions if ss == sid and tt > 0):
            cur = sessions[(sid,t)]
            if len(cur) < MIN_SESSION_N:
                continue
            pre = cur[:PREFIX_N]
            suf = cur[-SUFFIX_N:]
            ps = response_speed(pre)
            sm = response_speed(suf)
            first = float(np.mean(pre[:PREFIX_N//2])); last = float(np.mean(pre[PREFIX_N//2:]))
            ck = kmap.get((sid,t), np.nan)
            rows.append({
                'id':sid, 'time':t,
                'label':int(sm / bs <= SPEED_CUTOFF),
                'suffix_speed_ratio':sm/bs,
                'prefix_speed_ratio':ps/bs,
                'prefix_median_ratio':med(pre)/bm,
                'prefix_lapse500_frac':float(np.mean(pre > 500.0)),
                'prefix_cv':cv(pre),
                'prefix_slope_norm':(last-first)/bm,
                'log_baseline_median':math.log(bm),
                'kss':ck,
                'delta_kss':ck-bk if np.isfinite(ck) and np.isfinite(bk) else np.nan,
                'baseline_speed':bs,
                'baseline_median':bm,
                'n_current':len(cur),
            })
    return pd.DataFrame(rows)

OBJ = ['prefix_speed_ratio','prefix_median_ratio','prefix_lapse500_frac',
       'prefix_cv','prefix_slope_norm','log_baseline_median']
CTX = OBJ + ['kss','delta_kss']


def fit_model(X, y):
    y = np.asarray(y, dtype=int)
    if len(np.unique(y)) < 2:
        return ('constant', float(np.mean(y)))
    p = make_pipeline(SimpleImputer(strategy='median'), StandardScaler(),
                      LogisticRegression(C=1.0, solver='liblinear', max_iter=2000, random_state=2026))
    p.fit(X, y)
    return ('model', p)

def predict(model, X):
    if model[0] == 'constant':
        return np.full(len(X), model[1], dtype=float)
    return model[1].predict_proba(X)[:,1]


def selective_stats(y, p, low, high):
    y = np.asarray(y, dtype=int); p=np.asarray(p,float)
    decided = (p <= low) | (p >= high)
    pred = np.where(p >= high, 1, 0)
    n = len(y); nd=int(decided.sum()); pos=int((y==1).sum())
    if nd:
        acc=float(np.mean(pred[decided] == y[decided]))
    else:
        acc=float('nan')
    fn=int(np.sum((y==1) & decided & (pred==0)))
    tp=int(np.sum((y==1) & decided & (pred==1)))
    tn=int(np.sum((y==0) & decided & (pred==0)))
    return {
        'n':n, 'n_positive':pos, 'n_decided':nd,
        'coverage':float(nd/n) if n else 0.0,
        'selective_accuracy':acc,
        'false_reassurance_rate':float(fn/pos) if pos else 0.0,
        'false_reassurances':fn,
        'impaired_early_detection_rate':float(tp/pos) if pos else 0.0,
        'safe_early_clearance_rate':float(tn/max(1,int((y==0).sum()))),
        'low':float(low), 'high':float(high),
    }


def choose_thresholds(y, p):
    candidates=[]
    for lo in LOW_GRID:
        for hi in HIGH_GRID:
            if lo >= hi: continue
            s=selective_stats(y,p,lo,hi)
            if s['n_decided'] == 0 or not np.isfinite(s['selective_accuracy']):
                continue
            if s['selective_accuracy'] >= 0.95 and s['false_reassurance_rate'] <= 0.02:
                candidates.append(s)
    if not candidates:
        return 0.0, 1.0, None
    candidates.sort(key=lambda s:(-s['coverage'], s['false_reassurance_rate'],
                                  -s['selective_accuracy'], -(s['high']-s['low'])))
    s=candidates[0]
    return s['low'],s['high'],s


def group_oof(train, feats, seed):
    groups=train.id.to_numpy(); y=train.label.to_numpy(dtype=int)
    probs=np.full(len(train), np.nan)
    n_groups=len(np.unique(groups)); nsplit=min(4,n_groups)
    if nsplit < 2:
        return np.full(len(train), float(np.mean(y)))
    gkf=GroupKFold(n_splits=nsplit, shuffle=True, random_state=seed)
    X=train[feats]
    for tr,va in gkf.split(X,y,groups):
        m=fit_model(X.iloc[tr],y[tr]); probs[va]=predict(m,X.iloc[va])
    if np.isnan(probs).any():
        probs[np.isnan(probs)] = float(np.mean(y))
    return probs


def evaluate_model(df, feats, name):
    groups=df.id.to_numpy(); y=df.label.to_numpy(dtype=int)
    outer=GroupKFold(n_splits=5, shuffle=True, random_state=2026)
    probs=np.full(len(df), np.nan); decisions=np.zeros(len(df),dtype=bool); preds=np.zeros(len(df),dtype=int)
    lows=np.zeros(len(df)); highs=np.ones(len(df)); fold_rows=[]
    for fold,(tr,te) in enumerate(outer.split(df[feats],y,groups),start=1):
        train=df.iloc[tr].reset_index(drop=True); test=df.iloc[te]
        inner_p=group_oof(train,feats,2027+fold)
        lo,hi,sel=choose_thresholds(train.label.to_numpy(dtype=int),inner_p)
        model=fit_model(train[feats],train.label.to_numpy(dtype=int))
        pt=predict(model,test[feats])
        probs[te]=pt; lows[te]=lo; highs[te]=hi
        d=(pt<=lo)|(pt>=hi); decisions[te]=d; preds[te]=np.where(pt>=hi,1,0)
        fs=selective_stats(test.label.to_numpy(dtype=int),pt,lo,hi)
        fold_rows.append({'model':name,'fold':fold,'train_n':len(tr),'test_n':len(te),
                          'low':lo,'high':hi,'inner_eligible':sel is not None,**{f'test_{k}':v for k,v in fs.items() if k not in ('low','high')}})
    # Aggregate using each held-out case's training-chosen thresholds.
    decided=decisions; pos=int((y==1).sum()); nd=int(decided.sum())
    fn=int(np.sum((y==1)&decided&(preds==0))); tp=int(np.sum((y==1)&decided&(preds==1))); tn=int(np.sum((y==0)&decided&(preds==0)))
    agg={
        'model':name,'n':len(df),'n_positive':pos,'n_decided':nd,
        'coverage':float(nd/len(df)),
        'selective_accuracy':float(np.mean(preds[decided]==y[decided])) if nd else float('nan'),
        'false_reassurance_rate':float(fn/pos) if pos else 0.0,
        'false_reassurances':fn,
        'impaired_early_detection_rate':float(tp/pos) if pos else 0.0,
        'safe_early_clearance_rate':float(tn/max(1,int((y==0).sum()))),
    }
    pred_df=df[['id','time','label','suffix_speed_ratio']].copy()
    pred_df['model']=name; pred_df['probability']=probs; pred_df['decided']=decided.astype(int); pred_df['prediction']=preds; pred_df['low']=lows; pred_df['high']=highs
    return agg,pd.DataFrame(fold_rows),pred_df


def main():
    att,kss=load(); df=build_records(att,kss)
    if df.empty: raise RuntimeError('No eligible sessions after frozen filtering.')
    a,fa,pa=evaluate_model(df,OBJ,'objective_only')
    b,fb,pb=evaluate_model(df,CTX,'somno_context')
    promotion=(np.isfinite(b['selective_accuracy']) and b['selective_accuracy']>=0.95 and
               b['false_reassurance_rate']<=0.02 and b['coverage']>=0.20 and
               b['coverage']>=a['coverage']+0.05)
    summary={'protocol':'Somno INSEF V2 selective-risk','prefix_trials':PREFIX_N,'suffix_trials':SUFFIX_N,
             'speed_cutoff_ratio':SPEED_CUTOFF,'n_subjects':int(df.id.nunique()),'n_sessions':int(len(df)),
             'prevalence':float(df.label.mean()),'objective_only':a,'somno_context':b,
             'coverage_gain_pp':100*(b['coverage']-a['coverage']),'promotion_gate':bool(promotion)}
    df.to_csv(OUT/'v2_session_manifest.csv',index=False)
    pd.concat([fa,fb],ignore_index=True).to_csv(OUT/'v2_fold_metrics.csv',index=False)
    pd.concat([pa,pb],ignore_index=True).to_csv(OUT/'v2_predictions.csv',index=False)
    pd.DataFrame([a,b]).to_csv(OUT/'v2_summary.csv',index=False)
    with open(OUT/'v2_summary.json','w') as f: json.dump(summary,f,indent=2)
    print('V2_PROMOTION_GATE=' + ('PASS' if promotion else 'FAIL'))
    print(json.dumps(summary,indent=2))

if __name__=='__main__':
    main()
