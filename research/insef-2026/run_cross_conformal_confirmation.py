#!/usr/bin/env python3
import importlib.util, json, math
from pathlib import Path
import numpy as np
import pandas as pd

HERE=Path(__file__).resolve().parent
OUT=HERE/'results_cross_conformal'; OUT.mkdir(parents=True,exist_ok=True)
SEEDS=list(range(901,951)); N=15; ALPHA=0.05; TAU=0.15

pc=HERE/'run_conformal_pvt.py'
spec=importlib.util.spec_from_file_location('cpvt',pc)
cpvt=importlib.util.module_from_spec(spec); spec.loader.exec_module(cpvt)


def class_pvals(fitted, cal, test, n):
    pc=cpvt.predict_prob(fitted,cal,n); yc=np.array([r['label'] for r in cal],dtype=int)
    pt=cpvt.predict_prob(fitted,test,n)
    s0=np.asarray(pc[yc==0],dtype=float)      # A(x,0)=p1
    s1=np.asarray(1-pc[yc==1],dtype=float)    # A(x,1)=1-p1
    p0=[]; p1=[]
    for p in pt:
        t0=float(p); t1=float(1-p)
        p0.append((1+int(np.sum(s0>=t0)))/(len(s0)+1) if len(s0) else 1.0)
        p1.append((1+int(np.sum(s1>=t1)))/(len(s1)+1) if len(s1) else 1.0)
    return np.asarray(p0),np.asarray(p1)


def summarize(rows,prefix):
    df=pd.DataFrame(rows); dec=df.decision>=0; pos=df.label==1; pos_dec=pos&dec
    true_in=((df.label==0)&(df.include_alert==1))|((df.label==1)&(df.include_impaired==1))
    m={
      'singleton_coverage':float(dec.mean()),
      'singleton_accuracy':float((df.loc[dec,'decision']==df.loc[dec,'label']).mean()) if dec.any() else None,
      'impaired_singleton_coverage':float(pos_dec.sum()/pos.sum()) if pos.sum() else None,
      'singleton_fnr':float((df.loc[pos_dec,'decision']==0).sum()/pos_dec.sum()) if pos_dec.sum() else None,
      'empirical_set_coverage':float(true_in.mean()),
      'coverage_alert_class':float(true_in[df.label==0].mean()) if (df.label==0).sum() else None,
      'coverage_impaired_class':float(true_in[pos].mean()) if pos.sum() else None,
      'n':int(len(df)),'n_decided':int(dec.sum()),'n_positive':int(pos.sum()),'n_positive_decided':int(pos_dec.sum()),
      'both_rate':float(((df.include_alert==1)&(df.include_impaired==1)).mean()),
      'empty_rate':float(((df.include_alert==0)&(df.include_impaired==0)).mean()),
    }
    m['gate']=bool(m['singleton_accuracy'] is not None and m['singleton_accuracy']>=0.95 and
                   m['singleton_fnr'] is not None and m['singleton_fnr']<=0.10 and
                   m['singleton_coverage']>=0.40 and m['impaired_singleton_coverage'] is not None and
                   m['impaired_singleton_coverage']>=0.20)
    return {prefix+'_'+k:v for k,v in m.items()}


def run_seed(records,ids,seed):
    rng=np.random.default_rng(seed); sh=np.array(ids,dtype=int); rng.shuffle(sh)
    fold_of={int(sid):i%5 for i,sid in enumerate(sh.tolist())}
    split_rows=[]; cross_rows=[]; fixed_truth=[]; fixed_pred=[]
    for f in range(5):
        test=[r for r in records if fold_of[r['id']]==f and len(r['rts'])>=N]
        non_test_folds=[g for g in range(5) if g!=f]
        if not test: continue
        # Paired single-split baseline: calibration is the next fold cyclically, as preregistered.
        cf=(f+1)%5
        cal=[r for r in records if fold_of[r['id']]==cf and len(r['rts'])>=N]
        train=[r for r in records if fold_of[r['id']] not in (f,cf) and len(r['rts'])>=N]
        fit=cpvt.fit_model(train,N)
        sp0,sp1=class_pvals(fit,cal,test,N)
        # Cross-conformal: rotate every non-test fold as calibration.
        all0=[]; all1=[]
        for cfold in non_test_folds:
            calr=[r for r in records if fold_of[r['id']]==cfold and len(r['rts'])>=N]
            trainr=[r for r in records if fold_of[r['id']] not in (f,cfold) and len(r['rts'])>=N]
            fitr=cpvt.fit_model(trainr,N)
            p0,p1=class_pvals(fitr,calr,test,N); all0.append(p0); all1.append(p1)
        cp0=np.mean(np.vstack(all0),axis=0); cp1=np.mean(np.vstack(all1),axis=0)
        for r,a0,a1,b0,b1 in zip(test,sp0,sp1,cp0,cp1):
            def row(p0,p1):
                i0=bool(p0>ALPHA); i1=bool(p1>ALPHA)
                d=0 if i0 and not i1 else (1 if i1 and not i0 else -1)
                return {'id':r['id'],'time':r['time'],'label':int(r['label']),'include_alert':int(i0),'include_impaired':int(i1),'decision':d,'p0':float(p0),'p1':float(p1)}
            split_rows.append(row(a0,a1)); cross_rows.append(row(b0,b1))
            fixed_truth.append(int(r['label']))
            fixed_pred.append(int(np.median(r['rts'][:N])/r['base_median'] >= 1+TAU))
    out={'seed':seed,**summarize(split_rows,'split'),**summarize(cross_rows,'cross')}
    y=np.asarray(fixed_truth,dtype=int); z=np.asarray(fixed_pred,dtype=int); pos=y==1
    out['fixed_accuracy']=float(np.mean(y==z)); out['fixed_fnr']=float(((pos)&(z==0)).sum()/pos.sum()) if pos.sum() else 0.0
    return out,split_rows,cross_rows


def main():
    att,kss=cpvt.load_mapped(); records,_,_=cpvt.base.prepare_sessions(att,kss,TAU)
    records=[r for r in records if len(r['rts'])>=N]; ids=sorted(set(r['id'] for r in records))
    metrics=[]; example_split=[]; example_cross=[]
    for seed in SEEDS:
        m,s,c=run_seed(records,ids,seed); metrics.append(m)
        if seed==901: example_split=s; example_cross=c
    df=pd.DataFrame(metrics); df.to_csv(OUT/'seed_metrics.csv',index=False)
    pd.DataFrame(example_split).assign(method='single_split',seed=901).to_csv(OUT/'seed901_split_predictions.csv',index=False)
    pd.DataFrame(example_cross).assign(method='cross_conformal',seed=901).to_csv(OUT/'seed901_cross_predictions.csv',index=False)
    summary={
      'seeds':SEEDS,'n_seeds':len(SEEDS),'budget':N,'alpha':ALPHA,'tau':TAU,
      'split_gate_pass_count':int(df.split_gate.sum()),'cross_gate_pass_count':int(df.cross_gate.sum()),
      'split_median_accuracy':float(df.split_singleton_accuracy.median()),
      'cross_median_accuracy':float(df.cross_singleton_accuracy.median()),
      'split_median_fnr':float(df.split_singleton_fnr.median()),
      'cross_median_fnr':float(df.cross_singleton_fnr.median()),
      'split_median_coverage':float(df.split_singleton_coverage.median()),
      'cross_median_coverage':float(df.cross_singleton_coverage.median()),
      'split_median_impaired_coverage':float(df.split_impaired_singleton_coverage.median()),
      'cross_median_impaired_coverage':float(df.cross_impaired_singleton_coverage.median()),
      'split_median_empirical_set_coverage':float(df.split_empirical_set_coverage.median()),
      'cross_median_empirical_set_coverage':float(df.cross_empirical_set_coverage.median()),
      'median_fixed_accuracy':float(df.fixed_accuracy.median()),'median_fixed_fnr':float(df.fixed_fnr.median())
    }
    summary['confirmation_gate']=bool(summary['cross_median_accuracy']>=0.95 and summary['cross_median_fnr']<=0.10 and
      summary['cross_median_coverage']>=0.40 and summary['cross_median_impaired_coverage']>=0.20 and
      summary['cross_gate_pass_count']>=40 and summary['cross_gate_pass_count']>summary['split_gate_pass_count'])
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2))
    print('CROSS_CONFORMAL_CONFIRMATION_GATE=' + ('PASS' if summary['confirmation_gate'] else 'FAIL'))
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
