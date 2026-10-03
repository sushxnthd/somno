#!/usr/bin/env python3
import json
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats

OUT=Path(__file__).resolve().parent/'results_nemar_endpoint'; OUT.mkdir(parents=True,exist_ok=True)
URL='https://raw.githubusercontent.com/nemarDatasets/on004902/main/participants.tsv'
THRESHOLD=1.15


def num(s): return pd.to_numeric(s.replace('n/a',np.nan),errors='coerce')

def clopper_pearson(k,n,alpha=.05):
    lo=0.0 if k==0 else float(stats.beta.ppf(alpha/2,k,n-k+1))
    hi=1.0 if k==n else float(stats.beta.ppf(1-alpha/2,k+1,n-k))
    return lo,hi

def wilcoxon_safe(a,b):
    d=np.asarray(b)-np.asarray(a)
    if len(d)==0 or np.allclose(d,0): return {'statistic':0.0,'pvalue':1.0}
    z=stats.wilcoxon(a,b,alternative='two-sided',zero_method='wilcox',method='auto')
    return {'statistic':float(z.statistic),'pvalue':float(z.pvalue)}

def main():
    df=pd.read_csv(URL,sep='\t',dtype=str)
    for c in ['PVT_item1_NS','PVT_item1_SD','PVT_item2_NS','PVT_item2_SD','PVT_item3_NS','PVT_item3_SD']:
        df[c]=num(df[c])
    rt=df[['participant_id','PVT_item2_NS','PVT_item2_SD','PVT_item1_NS','PVT_item1_SD']].dropna(subset=['PVT_item2_NS','PVT_item2_SD']).copy()
    rt=rt[(rt.PVT_item2_NS>0)&(rt.PVT_item2_SD>0)].copy()
    rt['rt_ratio']=rt.PVT_item2_SD/rt.PVT_item2_NS
    rt['rt_diff_ms']=rt.PVT_item2_SD-rt.PVT_item2_NS
    rt['cross15']=(rt.rt_ratio>=THRESHOLD).astype(int)
    k=int(rt.cross15.sum()); n=len(rt); ci=clopper_pearson(k,n)
    wrt=wilcoxon_safe(rt.PVT_item2_NS.to_numpy(),rt.PVT_item2_SD.to_numpy())
    lapse=rt.dropna(subset=['PVT_item1_NS','PVT_item1_SD']).copy()
    lapse['lapse_diff']=lapse.PVT_item1_SD-lapse.PVT_item1_NS
    wlapse=wilcoxon_safe(lapse.PVT_item1_NS.to_numpy(),lapse.PVT_item1_SD.to_numpy())
    if len(lapse)>=3:
        rho,p_rho=stats.spearmanr(lapse.rt_ratio,lapse.lapse_diff,nan_policy='omit')
    else: rho,p_rho=np.nan,np.nan
    q=rt.rt_ratio.quantile([.25,.5,.75])
    summary={
      'dataset':'NEMAR on004902 / OpenNeuro ds004902','threshold_ratio':THRESHOLD,
      'n_complete_rt_pairs':int(n),'n_crossing_15pct':k,'fraction_crossing_15pct':float(k/n) if n else None,
      'crossing_exact95_ci':[ci[0],ci[1]],
      'rt_ratio_q25':float(q.loc[.25]),'rt_ratio_median':float(q.loc[.5]),'rt_ratio_q75':float(q.loc[.75]),
      'median_rt_ns_ms':float(rt.PVT_item2_NS.median()),'median_rt_sd_ms':float(rt.PVT_item2_SD.median()),
      'median_paired_rt_change_ms':float(rt.rt_diff_ms.median()),'rt_wilcoxon':wrt,
      'n_complete_lapse_pairs':int(len(lapse)),'median_lapses_ns':float(lapse.PVT_item1_NS.median()) if len(lapse) else None,
      'median_lapses_sd':float(lapse.PVT_item1_SD.median()) if len(lapse) else None,
      'median_paired_lapse_change':float(lapse.lapse_diff.median()) if len(lapse) else None,
      'lapse_wilcoxon':wlapse,'spearman_ratio_vs_lapse_change':{'rho':float(rho),'pvalue':float(p_rho)}
    }
    summary['endpoint_gate']=bool(n>0 and summary['rt_ratio_median']>1.15 and summary['fraction_crossing_15pct']>=.50 and
                                  summary['rt_wilcoxon']['pvalue']<.01 and len(lapse)>0 and summary['median_paired_lapse_change']>0)
    rt.to_csv(OUT/'paired_pvt_summary.csv',index=False)
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2))
    print('NEMAR_ENDPOINT_GATE=' + ('PASS' if summary['endpoint_gate'] else 'FAIL'))
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
