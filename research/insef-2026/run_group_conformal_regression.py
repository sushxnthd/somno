#!/usr/bin/env python3
import importlib.util, json, math
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge

HERE=Path(__file__).resolve().parent
OUT=HERE/'results_group_conformal_regression'; OUT.mkdir(parents=True,exist_ok=True)
SEEDS=list(range(1101,1151)); N=15; ALPHA=.10

p=HERE/'run_wakeapp_sequential.py'
spec=importlib.util.spec_from_file_location('parser',p)
base=importlib.util.module_from_spec(spec); spec.loader.exec_module(base)


def load_mapped():
    att,kss=base.load_data(); ren={}
    if 'time_point' not in att.columns and 'time' in att.columns: ren['time']='time_point'
    if 'trial_nr' not in att.columns and 'order_in_test' in att.columns: ren['order_in_test']='trial_nr'
    if 'false_response' not in att.columns and 'false_responses' in att.columns: ren['false_responses']='false_response'
    if 'sleep_condition_lag' not in att.columns and 'sd' in att.columns: ren['sd']='sleep_condition_lag'
    if 'trial_type' not in att.columns and 'stimuli_type' in att.columns: ren['stimuli_type']='trial_type'
    return att.rename(columns=ren),kss


def feat(r):
    x=np.asarray(r['rts'][:N],dtype=float); logs=np.log(x); bm=max(float(r['base_median']),1e-9)
    bsd=max(float(r['base_log_sd']),.05); pm=float(np.median(x)); q90=float(np.quantile(x,.90))
    ps=float(np.mean(1000.0/x)); bs=1000.0/bm
    h=max(1,N//2); a=x[:h]; b=x[h:]
    slope=(float(np.median(b))-float(np.median(a)))/bm if len(b) else 0.0
    return np.array([math.log(max(pm/bm,1e-9)),float(np.mean(logs)-r['base_log_mean']),
                     float(np.std(logs,ddof=1))/bsd,q90/bm,ps/max(bs,1e-9),slope],dtype=float)

def target(r): return math.log(max(float(r['median_rt'])/float(r['base_median']),1e-9))
def prefix_pred(r): return math.log(max(float(np.median(r['rts'][:N]))/float(r['base_median']),1e-9))

def conformal_q(group_scores,alpha):
    s=np.sort(np.asarray(group_scores,dtype=float)); m=len(s)
    if m==0: return float('inf')
    k=int(math.ceil((m+1)*(1-alpha))); k=max(1,min(k,m)); return float(s[k-1])

def group_q(records,preds):
    tmp={}
    for r,pred in zip(records,preds): tmp.setdefault(int(r['id']),[]).append(abs(target(r)-float(pred)))
    return conformal_q([max(v) for v in tmp.values()],ALPHA)

def evaluate_predictions(test,preds,q):
    ys=np.array([target(r) for r in test]); pp=np.asarray(preds,dtype=float)
    covered=(ys>=pp-q)&(ys<=pp+q)
    by={}
    for r,c in zip(test,covered): by.setdefault(int(r['id']),[]).append(bool(c))
    pcover=float(np.mean([all(v) for v in by.values()])) if by else np.nan
    widths=np.exp(pp+q)-np.exp(pp-q)
    return {
      'participant_coverage':pcover,'session_coverage':float(np.mean(covered)),
      'mae_log':float(np.mean(np.abs(ys-pp))),
      'median_abs_ratio_error_pp':float(np.median(np.abs(np.exp(ys)-np.exp(pp)))*100),
      'median_interval_width_pp':float(np.median(widths)*100),
      'n_sessions':int(len(test)),'n_participants':int(len(by))
    }

def run_seed(records,ids,seed):
    rng=np.random.default_rng(seed); sh=np.array(ids,dtype=int); rng.shuffle(sh)
    fold={int(s):i%5 for i,s in enumerate(sh.tolist())}
    rows=[]; ridge_cov=[]; base_cov=[]; ridge_sess=[]; base_sess=[]; ridge_err=[]; base_err=[]; ridge_ratio_err=[]; base_ratio_err=[]; ridge_w=[]; base_w=[]; qrs=[]; qbs=[]
    for f in range(5):
        cf=(f+1)%5
        tr=[r for r in records if fold[r['id']] not in (f,cf)]
        ca=[r for r in records if fold[r['id']]==cf]
        te=[r for r in records if fold[r['id']]==f]
        model=make_pipeline(StandardScaler(),Ridge(alpha=1.0))
        model.fit(np.vstack([feat(r) for r in tr]),np.array([target(r) for r in tr]))
        pca=model.predict(np.vstack([feat(r) for r in ca])); pte=model.predict(np.vstack([feat(r) for r in te]))
        bca=np.array([prefix_pred(r) for r in ca]); bte=np.array([prefix_pred(r) for r in te])
        qr=group_q(ca,pca); qb=group_q(ca,bca); qrs.append(qr); qbs.append(qb)
        mr=evaluate_predictions(te,pte,qr); mb=evaluate_predictions(te,bte,qb)
        ridge_cov.extend([mr['participant_coverage']]*mr['n_participants']); base_cov.extend([mb['participant_coverage']]*mb['n_participants'])
        # Keep fold-level values weighted later from raw session records below.
        ys=np.array([target(r) for r in te]); cr=(ys>=pte-qr)&(ys<=pte+qr); cb=(ys>=bte-qb)&(ys<=bte+qb)
        ridge_sess.extend(cr.tolist()); base_sess.extend(cb.tolist())
        ridge_err.extend(np.abs(ys-pte).tolist()); base_err.extend(np.abs(ys-bte).tolist())
        ridge_ratio_err.extend((np.abs(np.exp(ys)-np.exp(pte))*100).tolist()); base_ratio_err.extend((np.abs(np.exp(ys)-np.exp(bte))*100).tolist())
        ridge_w.extend(((np.exp(pte+qr)-np.exp(pte-qr))*100).tolist()); base_w.extend(((np.exp(bte+qb)-np.exp(bte-qb))*100).tolist())
        # participant simultaneous coverage explicitly
        for method,pred,q in [('ridge',pte,qr),('prefix',bte,qb)]:
            tmp={}
            for r,y,ph in zip(te,ys,pred): tmp.setdefault(int(r['id']),[]).append(bool(y>=ph-q and y<=ph+q))
            for sid,v in tmp.items(): rows.append({'seed':seed,'fold':f,'participant':sid,'method':method,'all_sessions_covered':int(all(v)),'n_sessions':len(v),'q_log':q})
    rdf=pd.DataFrame(rows)
    rc=float(rdf[rdf.method=='ridge'].all_sessions_covered.mean()); bc=float(rdf[rdf.method=='prefix'].all_sessions_covered.mean())
    return {
      'seed':seed,'ridge_participant_coverage':rc,'prefix_participant_coverage':bc,
      'ridge_session_coverage':float(np.mean(ridge_sess)),'prefix_session_coverage':float(np.mean(base_sess)),
      'ridge_median_q':float(np.median(qrs)),'prefix_median_q':float(np.median(qbs)),
      'ridge_mae_log':float(np.mean(ridge_err)),'prefix_mae_log':float(np.mean(base_err)),
      'ridge_median_abs_ratio_error_pp':float(np.median(ridge_ratio_err)),'prefix_median_abs_ratio_error_pp':float(np.median(base_ratio_err)),
      'ridge_median_interval_width_pp':float(np.median(ridge_w)),'prefix_median_interval_width_pp':float(np.median(base_w)),
      'q_reduction_fraction':float(1-np.median(qrs)/np.median(qbs)) if np.median(qbs)>0 else 0.0,
      'ridge_lower_mae':bool(np.mean(ridge_err)<np.mean(base_err))
    },rdf

def main():
    att,kss=load_mapped(); rec,_,_=base.prepare_sessions(att,kss,.15)
    rec=[r for r in rec if len(r['rts'])>=N]
    ids=sorted(set(int(r['id']) for r in rec)); metrics=[]; parts=[]
    for seed in SEEDS:
        m,pdf=run_seed(rec,ids,seed); metrics.append(m)
        if seed==1101: parts.append(pdf)
    df=pd.DataFrame(metrics); df.to_csv(OUT/'seed_metrics.csv',index=False)
    if parts: pd.concat(parts,ignore_index=True).to_csv(OUT/'seed1101_participant_coverage.csv',index=False)
    summary={
      'seeds':SEEDS,'n_seeds':len(SEEDS),'n_participants':len(ids),'n_sessions':len(rec),'prefix_trials':N,'alpha':ALPHA,
      'median_ridge_participant_coverage':float(df.ridge_participant_coverage.median()),
      'median_prefix_participant_coverage':float(df.prefix_participant_coverage.median()),
      'seeds_ridge_participant_coverage_ge_85':int((df.ridge_participant_coverage>=.85).sum()),
      'median_ridge_session_coverage':float(df.ridge_session_coverage.median()),
      'median_prefix_session_coverage':float(df.prefix_session_coverage.median()),
      'median_ridge_q':float(df.ridge_median_q.median()),'median_prefix_q':float(df.prefix_median_q.median()),
      'q_reduction_fraction_from_medians':float(1-df.ridge_median_q.median()/df.prefix_median_q.median()),
      'median_ridge_mae_log':float(df.ridge_mae_log.median()),'median_prefix_mae_log':float(df.prefix_mae_log.median()),
      'seeds_ridge_lower_mae':int(df.ridge_lower_mae.sum()),
      'median_ridge_abs_ratio_error_pp':float(df.ridge_median_abs_ratio_error_pp.median()),
      'median_prefix_abs_ratio_error_pp':float(df.prefix_median_abs_ratio_error_pp.median()),
      'median_ridge_interval_width_pp':float(df.ridge_median_interval_width_pp.median()),
      'median_prefix_interval_width_pp':float(df.prefix_median_interval_width_pp.median())
    }
    summary['promotion_gate']=bool(summary['median_ridge_participant_coverage']>=.90 and summary['seeds_ridge_participant_coverage_ge_85']>=40 and
      summary['q_reduction_fraction_from_medians']>=.10 and summary['seeds_ridge_lower_mae']>=40)
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2))
    print('GROUP_CONFORMAL_REGRESSION_GATE=' + ('PASS' if summary['promotion_gate'] else 'FAIL'))
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
