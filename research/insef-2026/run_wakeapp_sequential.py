#!/usr/bin/env python3
import json, math, os
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer

OUT = Path(os.environ.get('SOMNO_OUT', 'research/insef-2026/results'))
OUT.mkdir(parents=True, exist_ok=True)
ATT_URL = 'https://raw.githubusercontent.com/benholding/WakeApp/master/simple_attention_data.csv'
KSS_URL = 'https://raw.githubusercontent.com/benholding/WakeApp/master/KSS_data.csv'
BOUNDARIES = [0.95, 0.975, 0.99]
MIN_TRIALS = 5
TAUS = [0.15, 0.10, 0.20, 0.25]


def logit(p):
    p = min(max(float(p), 1e-8), 1-1e-8)
    return math.log(p/(1-p))

def sigmoid(z):
    if z >= 0:
        e = math.exp(-z); return 1/(1+e)
    e = math.exp(z); return e/(1+e)


def load_data():
    att = pd.read_csv(ATT_URL)
    kss = pd.read_csv(KSS_URL)
    att.columns = [c.lower() for c in att.columns]
    kss.columns = [c.lower() for c in kss.columns]
    return att, kss


def prepare_sessions(att, kss, tau):
    # Vigilance trial stream.
    att['id'] = pd.to_numeric(att['id'], errors='coerce')
    att['time_point'] = pd.to_numeric(att['time_point'], errors='coerce')
    att['reaction_time'] = pd.to_numeric(att['reaction_time'], errors='coerce')
    att['trial_nr'] = pd.to_numeric(att['trial_nr'], errors='coerce')
    if 'false_response' in att:
        att['false_response'] = pd.to_numeric(att['false_response'], errors='coerce')
    else:
        att['false_response'] = np.nan
    valid = att[(att['trial_type'].astype(str).str.lower() == 'p') &
                att['reaction_time'].notna() & (att['reaction_time'] > 0) &
                (att['false_response'].isna() | (att['false_response'] == 0)) &
                att['id'].notna() & att['time_point'].notna()].copy()
    valid = valid.sort_values(['id','time_point','trial_nr'])

    # KSS nearest to the reaction-time task; fallback is within-session median.
    kss['id'] = pd.to_numeric(kss['id'], errors='coerce')
    kss['time'] = pd.to_numeric(kss['time'], errors='coerce')
    kss['rating1'] = pd.to_numeric(kss['rating1'], errors='coerce')
    km = kss[kss['id'].notna() & kss['time'].notna() & kss['rating1'].notna()].copy()
    rt_kss = (km[km['test_type'].astype(str).str.lower() == 'reactiontime']
              .groupby(['id','time'])['rating1'].median().rename('kss_rt'))
    med_kss = km.groupby(['id','time'])['rating1'].median().rename('kss_med')
    kk = pd.concat([rt_kss, med_kss], axis=1).reset_index()
    kk['kss'] = kk['kss_rt'].fillna(kk['kss_med'])
    kk['kss_fallback'] = kk['kss_rt'].isna().astype(int)
    kss_map = {(int(r.id), int(r.time)): (float(r.kss), int(r.kss_fallback))
               for r in kk.itertuples()}

    grouped = {}
    for (sid,tp), g in valid.groupby(['id','time_point']):
        sid, tp = int(sid), int(tp)
        rts = g['reaction_time'].astype(float).to_numpy()
        if len(rts) < 10: continue
        logs = np.log(rts)
        kval = kss_map.get((sid,tp), (np.nan, 1))
        grouped[(sid,tp)] = {
            'id':sid, 'time':tp, 'rts':rts, 'logs':logs,
            'median_rt':float(np.median(rts)),
            'log_mean':float(np.mean(logs)),
            'log_sd':float(np.std(logs, ddof=1)) if len(logs)>1 else np.nan,
            'kss':kval[0], 'kss_fallback':kval[1],
            'condition':str(g['sleep_condition_lag'].iloc[0]) if 'sleep_condition_lag' in g else 'Unknown'
        }

    records=[]
    for sid in sorted({k[0] for k in grouped}):
        base = grouped.get((sid,0))
        if not base: continue
        base_kss = base['kss']
        for tp in sorted(t for (s,t) in grouped if s==sid and t>0):
            cur = grouped[(sid,tp)]
            ratio = cur['median_rt']/base['median_rt']
            records.append({
                **cur,
                'base_median':base['median_rt'],
                'base_log_mean':base['log_mean'],
                'base_log_sd':max(base['log_sd'] if np.isfinite(base['log_sd']) else 0.05, 0.05),
                'base_kss':base_kss,
                'delta_kss':cur['kss']-base_kss if np.isfinite(cur['kss']) and np.isfinite(base_kss) else np.nan,
                'ratio':ratio,
                'label':int(ratio >= 1+tau)
            })
    return records, valid, kk


def Xmat(records):
    return np.array([[r['kss'], r['delta_kss'], math.log(r['base_median'])] for r in records], dtype=float)

def fit_prior(records):
    y=np.array([r['label'] for r in records], dtype=int)
    if len(np.unique(y)) < 2:
        p=float(np.mean(y)) if len(y) else 0.5
        return ('constant', min(max(p,0.2),0.8))
    model=make_pipeline(SimpleImputer(strategy='median'), StandardScaler(),
                        LogisticRegression(C=1.0, solver='liblinear', max_iter=2000, random_state=2026))
    model.fit(Xmat(records), y)
    return ('model', model)

def prior_prob(fitted, records):
    kind,obj=fitted
    if kind=='constant': return np.full(len(records), obj, dtype=float)
    return np.clip(obj.predict_proba(Xmat(records))[:,1], 0.20, 0.80)


def sequential_one(r, p0, boundary, tau):
    mu0=r['base_log_mean']; mu1=mu0+math.log1p(tau); sd=max(r['base_log_sd'],0.05)
    lod=logit(p0)
    hi=logit(boundary); lo=logit(1-boundary)
    for i,x in enumerate(r['logs'], start=1):
        lod += ((x-mu0)**2 - (x-mu1)**2)/(2*sd*sd)
        if i < MIN_TRIALS: continue
        if lod >= hi: return 1,i,0,sigmoid(lod)
        if lod <= lo: return 0,i,0,sigmoid(lod)
    # Explicit abstention from early classification: consume complete session/reference.
    return r['label'],len(r['logs']),1,sigmoid(lod)


def metrics(records, probs, boundary, tau):
    out=[]
    for r,p in zip(records, probs):
        pred,n,abst,post=sequential_one(r,p,boundary,tau)
        out.append((r['id'],r['time'],r['label'],pred,n,abst,post))
    y=np.array([x[2] for x in out]); ph=np.array([x[3] for x in out]); n=np.array([x[4] for x in out])
    pos=(y==1).sum(); fn=((y==1)&(ph==0)).sum()
    return {
        'agreement':float(np.mean(y==ph)) if len(y) else np.nan,
        'fnr':float(fn/pos) if pos else 0.0,
        'median_trials':float(np.median(n)) if len(n) else np.nan,
        'mean_trials':float(np.mean(n)) if len(n) else np.nan,
        'early_stop_rate':float(np.mean(np.array([x[5] for x in out])==0)) if len(out) else np.nan,
        'n':len(out), 'n_positive':int(pos), 'decisions':out
    }


def choose_boundary(train_records, probs, tau):
    rows=[]
    for b in BOUNDARIES:
        m=metrics(train_records, probs, b, tau); rows.append((b,m))
    eligible=[z for z in rows if z[1]['agreement']>=0.95]
    if not eligible: return 0.99
    eligible.sort(key=lambda z:(z[1]['fnr'], z[1]['median_trials'], -z[1]['agreement']))
    return eligible[0][0]


def oof_prior_probs(records):
    probs=np.full(len(records),0.5)
    ids=sorted(set(r['id'] for r in records))
    for sid in ids:
        tr=[r for r in records if r['id']!=sid]
        idx=[i for i,r in enumerate(records) if r['id']==sid]
        fit=fit_prior(tr)
        vals=prior_prob(fit,[records[i] for i in idx])
        probs[idx]=vals
    return probs


def fixed_metrics(records, N, tau):
    ys=[]; ps=[]; ns=[]
    for r in records:
        k=min(N,len(r['rts']))
        pred=int(np.median(r['rts'][:k])/r['base_median'] >= 1+tau)
        ys.append(r['label']); ps.append(pred); ns.append(k)
    y=np.array(ys); p=np.array(ps); pos=(y==1).sum()
    return {'agreement':float(np.mean(y==p)), 'fnr':float((((y==1)&(p==0)).sum())/pos) if pos else 0.0,
            'median_trials':float(np.median(ns)), 'mean_trials':float(np.mean(ns)), 'n':len(y), 'n_positive':int(pos)}


def run_tau(att,kss,tau):
    rec,valid,kk=prepare_sessions(att.copy(),kss.copy(),tau)
    ids=sorted(set(r['id'] for r in rec))
    all_neutral=[]; all_prior=[]
    fold_rows=[]
    for held in ids:
        train=[r for r in rec if r['id']!=held]; test=[r for r in rec if r['id']==held]
        if not test or not train: continue
        prior_oof=oof_prior_probs(train)
        b_neutral=choose_boundary(train,np.full(len(train),0.5),tau)
        b_prior=choose_boundary(train,prior_oof,tau)
        fit=fit_prior(train); test_prior=prior_prob(fit,test)
        mn=metrics(test,np.full(len(test),0.5),b_neutral,tau)
        mp=metrics(test,test_prior,b_prior,tau)
        all_neutral.extend(mn['decisions']); all_prior.extend(mp['decisions'])
        fold_rows.append({'held_id':held,'n_test':len(test),'boundary_neutral':b_neutral,'boundary_prior':b_prior,
                          'prior_min':float(np.min(test_prior)),'prior_max':float(np.max(test_prior))})
    def aggregate(dec):
        y=np.array([x[2] for x in dec]); p=np.array([x[3] for x in dec]); n=np.array([x[4] for x in dec]); a=np.array([x[5] for x in dec])
        pos=(y==1).sum(); fn=((y==1)&(p==0)).sum()
        return {'agreement':float(np.mean(y==p)), 'fnr':float(fn/pos) if pos else 0.0,
                'median_trials':float(np.median(n)), 'mean_trials':float(np.mean(n)),
                'early_stop_rate':float(np.mean(a==0)), 'n':len(y),'n_positive':int(pos), 'n_false_negative':int(fn)}
    result={'tau':tau,'n_subjects':len(ids),'n_followup_sessions':len(rec),
            'neutral':aggregate(all_neutral),'prior':aggregate(all_prior),
            'fixed5':fixed_metrics(rec,5,tau),'fixed10':fixed_metrics(rec,10,tau),'fixed15':fixed_metrics(rec,15,tau),
            'folds':fold_rows}
    result['promotion_gate']=(result['prior']['median_trials'] < result['neutral']['median_trials'] and
                              result['prior']['fnr'] <= result['neutral']['fnr'] + 0.02 and
                              result['prior']['agreement'] >= 0.95)
    # Decision-level output for primary analysis.
    if abs(tau-0.15)<1e-12:
        cols=['id','time','label','prediction','trials','abstained','posterior']
        pd.DataFrame(all_neutral,columns=cols).assign(policy='neutral').to_csv(OUT/'neutral_decisions.csv',index=False)
        pd.DataFrame(all_prior,columns=cols).assign(policy='somno_prior').to_csv(OUT/'prior_decisions.csv',index=False)
        pd.DataFrame(fold_rows).to_csv(OUT/'fold_settings.csv',index=False)
        # Session manifest without raw trial streams.
        pd.DataFrame([{k:v for k,v in r.items() if k not in ('rts','logs')} for r in rec]).to_csv(OUT/'session_manifest.csv',index=False)
    return result


def main():
    att,kss=load_data()
    results=[]
    for tau in TAUS:
        results.append(run_tau(att,kss,tau))
    with open(OUT/'summary.json','w') as f: json.dump(results,f,indent=2)
    flat=[]
    for r in results:
        for pol in ['neutral','prior','fixed5','fixed10','fixed15']:
            z={'tau':r['tau'],'policy':pol,**r[pol]}; flat.append(z)
    df=pd.DataFrame(flat); df.to_csv(OUT/'policy_summary.csv',index=False)
    primary=df[df.tau==0.15].copy()
    order=['fixed5','fixed10','fixed15','neutral','prior']; primary['policy']=pd.Categorical(primary.policy,order,ordered=True); primary=primary.sort_values('policy')
    plt.figure(figsize=(6.4,3.7)); plt.scatter(primary['median_trials'],primary['agreement']*100,s=55)
    for _,r in primary.iterrows(): plt.annotate(str(r['policy']), (r['median_trials'],r['agreement']*100), xytext=(4,4), textcoords='offset points', fontsize=8)
    plt.axhline(95,linewidth=1,linestyle='--'); plt.xlabel('Median valid PVT trials consumed'); plt.ylabel('Agreement with full session (%)'); plt.tight_layout(); plt.savefig(OUT/'figure_efficiency_vs_agreement.pdf'); plt.savefig(OUT/'figure_efficiency_vs_agreement.png',dpi=220); plt.close()
    print('\n=== SOMNO WAKEAPP SEQUENTIAL PVT RESULTS ===')
    print(df.to_string(index=False))
    p=[r for r in results if abs(r['tau']-0.15)<1e-12][0]
    print('\nPRIMARY PROMOTION GATE:', 'PASS' if p['promotion_gate'] else 'FAIL')
    print(json.dumps(p,indent=2))

if __name__=='__main__': main()
