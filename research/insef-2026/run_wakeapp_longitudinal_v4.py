#!/usr/bin/env python3
"""Somno INSEF V4: longitudinal context under the frozen V3 clearance rule."""
from pathlib import Path
import importlib.util, json, os
import numpy as np
import pandas as pd

HERE=Path(__file__).parent

def loadmod(name, path):
    s=importlib.util.spec_from_file_location(name,path); mod=importlib.util.module_from_spec(s); s.loader.exec_module(mod); return mod

v2=loadmod('somno_v2', HERE/'run_wakeapp_selective_v2.py')
v3=loadmod('somno_v3', HERE/'run_wakeapp_conformal_v3.py')
OUT=Path(os.environ.get('SOMNO_OUT','research/insef-2026/results_v4')); OUT.mkdir(parents=True,exist_ok=True)

HIST=['prev_speed_ratio','prev_median_ratio','prev_kss','history_mean_speed_ratio','history_worst_speed_ratio']
CURRENT=v2.CTX
LONG=CURRENT+HIST


def build_longitudinal(att,kss):
    for c in ['id','time','reaction_time','order_in_test','false_responses']:
        att[c]=pd.to_numeric(att[c],errors='coerce')
    valid=att[(att.stimuli_type.astype(str).str.lower()=='p') & att.id.notna() & att.time.notna() &
              att.reaction_time.notna() & (att.reaction_time>0) &
              (att.false_responses.isna() | (att.false_responses==0))].copy()
    valid=valid.sort_values(['id','time','order_in_test'])
    sessions={(int(sid),int(t)):g.reaction_time.astype(float).to_numpy()
              for (sid,t),g in valid.groupby(['id','time'])}
    kmap=v2.build_kss(kss.copy())
    rows=[]
    for sid in sorted({x[0] for x in sessions}):
        base=sessions.get((sid,0))
        if base is None or len(base)<v2.MIN_SESSION_N: continue
        bs=v2.response_speed(base); bm=v2.med(base); bk=kmap.get((sid,0),np.nan)
        times=sorted(t for (ss,t) in sessions if ss==sid and t>0)
        for t in times:
            cur=sessions[(sid,t)]
            if len(cur)<v2.MIN_SESSION_N: continue
            pre=cur[:v2.PREFIX_N]; suf=cur[-v2.SUFFIX_N:]
            ps=v2.response_speed(pre); ss=v2.response_speed(suf)
            first=float(np.mean(pre[:v2.PREFIX_N//2])); last=float(np.mean(pre[v2.PREFIX_N//2:]))
            ck=kmap.get((sid,t),np.nan)
            hist_times=[h for h in times if h<t and len(sessions[(sid,h)])>=10]
            if hist_times:
                ratios=[v2.response_speed(sessions[(sid,h)])/bs for h in hist_times]
                hp=hist_times[-1]; prv=sessions[(sid,hp)]
                prev_speed=ratios[-1]; prev_med=v2.med(prv)/bm; prevk=kmap.get((sid,hp),np.nan)
                hmean=float(np.mean(ratios)); hworst=float(np.min(ratios))
            else:
                prev_speed=prev_med=prevk=hmean=hworst=np.nan
            rows.append({
                'id':sid,'time':t,'label':int(ss/bs<=v2.SPEED_CUTOFF),'suffix_speed_ratio':ss/bs,
                'prefix_speed_ratio':ps/bs,'prefix_median_ratio':v2.med(pre)/bm,
                'prefix_lapse500_frac':float(np.mean(pre>500.0)),'prefix_cv':v2.cv(pre),
                'prefix_slope_norm':(last-first)/bm,'log_baseline_median':float(np.log(bm)),
                'kss':ck,'delta_kss':ck-bk if np.isfinite(ck) and np.isfinite(bk) else np.nan,
                'prev_speed_ratio':prev_speed,'prev_median_ratio':prev_med,'prev_kss':prevk,
                'history_mean_speed_ratio':hmean,'history_worst_speed_ratio':hworst,
                'has_history':int(bool(hist_times))
            })
    return pd.DataFrame(rows)


def main():
    att,kss=v2.load(); df=build_longitudinal(att,kss)
    a,fa,pa=v3.evaluate(df,CURRENT,'current_context')
    b,fb,pb=v3.evaluate(df,LONG,'longitudinal_somno')
    gain=100*(b['safe_session_clearance_rate']-a['safe_session_clearance_rate'])
    promotion=(b['session_false_reassurance_rate']<=0.05 and b['subject_false_reassurance_rate']<=0.05 and
               np.isfinite(b['npv_cleared']) and b['npv_cleared']>=0.95 and
               b['safe_session_clearance_rate']>=0.15 and gain>=5.0)
    summary={'protocol':'Somno INSEF V4 longitudinal conformal-style clearance','alpha':v3.ALPHA,
             'n_subjects':int(df.id.nunique()),'n_sessions':int(len(df)),'prevalence':float(df.label.mean()),
             'sessions_with_prior_history':int(df.has_history.sum()),'history_fraction':float(df.has_history.mean()),
             'current_context':a,'longitudinal_somno':b,'safe_clearance_gain_pp':gain,'promotion_gate':bool(promotion)}
    df.to_csv(OUT/'v4_session_manifest.csv',index=False)
    pd.concat([fa,fb],ignore_index=True).to_csv(OUT/'v4_fold_metrics.csv',index=False)
    pd.concat([pa,pb],ignore_index=True).to_csv(OUT/'v4_predictions.csv',index=False)
    pd.DataFrame([a,b]).to_csv(OUT/'v4_summary.csv',index=False)
    with open(OUT/'v4_summary.json','w') as f: json.dump(summary,f,indent=2)
    print('V4_PROMOTION_GATE='+('PASS' if promotion else 'FAIL'))
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
