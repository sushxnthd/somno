#!/usr/bin/env python3
"""Schema-only wrapper for the frozen evaluator.

WakeApp source columns are mapped to the semantic names expected by the frozen
Somno evaluator. Scientific rules, thresholds, preprocessing, models, labels,
and promotion gates remain unchanged.
"""
import importlib.util
from pathlib import Path

p = Path(__file__).with_name('run_wakeapp_sequential.py')
spec = importlib.util.spec_from_file_location('somno_frozen', p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
_original_load = m.load_data


def load_with_schema_map():
    att, kss = _original_load()
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
    if rename:
        att = att.rename(columns=rename)
    return att, kss

m.load_data = load_with_schema_map
m.main()
