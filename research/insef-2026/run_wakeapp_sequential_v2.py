#!/usr/bin/env python3
"""Schema-only wrapper for the frozen evaluator.

WakeApp calls the session index `time`; the frozen evaluator used the semantic
name `time_point`. This wrapper maps source-column names only. Scientific rules,
thresholds, preprocessing, models, and promotion gates remain unchanged.
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
    if 'time_point' not in att.columns and 'time' in att.columns:
        att = att.rename(columns={'time': 'time_point'})
    # Preserve the source study's condition name if the export uses `sd`.
    if 'sleep_condition_lag' not in att.columns and 'sd' in att.columns:
        att = att.rename(columns={'sd': 'sleep_condition_lag'})
    return att, kss

m.load_data = load_with_schema_map
m.main()
