#!/usr/bin/env python3
"""Run only the preregistered primary WakeApp endpoint (tau=0.15).

This is an execution shortcut, not a model/protocol change. It imports the
frozen evaluator and uses the same schema aliases, LOOSO evaluation, prior,
stopping boundaries, metrics, and promotion gate. The full sensitivity sweep
remains available in run_wakeapp_sequential_v2.py.
"""
import importlib.util
import json
from pathlib import Path
import pandas as pd

HERE = Path(__file__).parent
CORE = HERE / 'run_wakeapp_sequential.py'
spec = importlib.util.spec_from_file_location('somno_frozen', CORE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

att, kss = m.load_data()
rename = {}
if 'time_point' not in att.columns and 'time' in att.columns:
    rename['time'] = 'time_point'
if 'trial_nr' not in att.columns and 'order_in_test' in att.columns:
    rename['order_in_test'] = 'trial_nr'
if 'trial_type' not in att.columns and 'stimuli_type' in att.columns:
    rename['stimuli_type'] = 'trial_type'
if 'false_response' not in att.columns and 'false_responses' in att.columns:
    rename['false_responses'] = 'false_response'
if 'sleep_condition_lag' not in att.columns and 'sd' in att.columns:
    rename['sd'] = 'sleep_condition_lag'
att = att.rename(columns=rename)

r = m.run_tau(att, kss, 0.15)
out = m.OUT
with open(out / 'primary_summary.json', 'w') as f:
    json.dump(r, f, indent=2)
rows = []
for pol in ['neutral','prior','fixed5','fixed10','fixed15']:
    rows.append({'policy':pol, **r[pol]})
pd.DataFrame(rows).to_csv(out / 'primary_policy_summary.csv', index=False)
print('PRIMARY_PROMOTION_GATE=' + ('PASS' if r['promotion_gate'] else 'FAIL'))
print(json.dumps(r, indent=2))
