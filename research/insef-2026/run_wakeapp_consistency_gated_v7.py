#!/usr/bin/env python3
"""Somno INSEF V7: reliability-gated personal calibration.

Uses the exact V5/V6 population model and forward-only residual correction.
Personalization is applied only when the first two prior residuals have the same
strict sign. No threshold or gate parameter is fit on V7 outcomes.
"""
from pathlib import Path
import importlib.util, json, os
import numpy as np
import pandas as pd

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('v5', HERE / 'run_wakeapp_personal_calibration_v5.py')
v5 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v5)
OUT = Path(os.environ.get('SOMNO_OUT', 'research/insef-2026/results_v7'))
OUT.mkdir(parents=True, exist_ok=True)


def summarize(p, pred_col):
    err = np.abs(p.truth - p[pred_col])
    rmse = float(np.sqrt(np.mean((p.truth - p[pred_col]) ** 2)))
    mae = float(err.mean())
    cls = v5.classification_metrics(p.truth, p[pred_col])
    return mae, rmse, cls, err


def main():
    att, kss = v5.v2.load()
    df = v5.v4.build_longitudinal(att, kss)
    df['baseline_kss'] = df['kss'] - df['delta_kss']
    df = df.sort_values(['id', 'time']).reset_index(drop=True)

    rows = []
    for sid in sorted(df.id.unique()):
        train = df[df.id != sid]
        test = df[df.id == sid].copy().sort_values('time')
        if train.empty or test.empty:
            continue

        mdl = v5.model()
        mdl.fit(train[v5.FEATURES], train['suffix_speed_ratio'])
        test['population_prediction'] = mdl.predict(test[v5.FEATURES])

        for _, row in test.iterrows():
            prior = test[(test.time < row.time) & (test.time >= 1)].copy().sort_values('time')
            if len(prior) < 2:
                continue

            residuals = (prior.suffix_speed_ratio.to_numpy(float) -
                         prior.population_prediction.to_numpy(float))
            n = len(residuals)
            shrink = n / (n + 1.0)
            offset = shrink * float(np.mean(residuals))
            ungated = float(row.population_prediction + offset)

            r1, r2 = float(residuals[0]), float(residuals[1])
            consistent = bool(r1 * r2 > 0.0)
            gated = ungated if consistent else float(row.population_prediction)

            rows.append({
                'id': int(sid),
                'time': int(row.time),
                'truth': float(row.suffix_speed_ratio),
                'population_prediction': float(row.population_prediction),
                'ungated_prediction': ungated,
                'gated_prediction': gated,
                'n_prior': int(n),
                'r1': r1,
                'r2': r2,
                'consistent': int(consistent),
                'personal_offset': float(offset),
            })

    p = pd.DataFrame(rows)
    if p.empty:
        raise RuntimeError('No sessions with two prior paired follow-ups.')

    mae_pop, rmse_pop, cls_pop, err_pop = summarize(p, 'population_prediction')
    mae_ung, rmse_ung, cls_ung, err_ung = summarize(p, 'ungated_prediction')
    mae_gate, rmse_gate, cls_gate, err_gate = summarize(p, 'gated_prediction')

    subj = p.assign(pop_err=err_pop, ungated_err=err_ung, gated_err=err_gate).groupby('id')[
        ['pop_err', 'ungated_err', 'gated_err']
    ].mean().reset_index()
    subj['gated_improvement'] = subj.pop_err - subj.gated_err
    subj['ungated_improvement'] = subj.pop_err - subj.ungated_err

    vals = subj.gated_improvement.to_numpy(float)
    rng = np.random.default_rng(7070)
    boots = np.empty(10000)
    for i in range(10000):
        boots[i] = float(np.mean(rng.choice(vals, size=len(vals), replace=True)))
    lo, hi = np.quantile(boots, [0.025, 0.975])

    reduction = 1.0 - mae_gate / mae_pop
    activation = float(p.consistent.mean())
    promotion = (
        reduction >= 0.05 and
        rmse_gate < rmse_pop and
        lo > 0.0 and
        cls_gate['false_negative_rate'] <= cls_pop['false_negative_rate'] + 0.02 and
        mae_gate <= mae_ung
    )

    summary = {
        'protocol': 'Somno INSEF V7 consistency-gated personalization',
        'n_subjects': int(p.id.nunique()),
        'n_future_sessions': int(len(p)),
        'gate_activation_fraction': activation,
        'population': {'mae': mae_pop, 'rmse': rmse_pop, **cls_pop},
        'ungated': {'mae': mae_ung, 'rmse': rmse_ung, **cls_ung},
        'consistency_gated': {'mae': mae_gate, 'rmse': rmse_gate, **cls_gate},
        'gated_mae_relative_reduction_vs_population': float(reduction),
        'mean_subject_gated_mae_improvement': float(vals.mean()),
        'bootstrap_95_ci_subject_gated_mae_improvement': [float(lo), float(hi)],
        'promotion_gate': bool(promotion),
    }

    p.to_csv(OUT / 'v7_predictions.csv', index=False)
    subj.to_csv(OUT / 'v7_subject_metrics.csv', index=False)
    with open(OUT / 'v7_summary.json', 'w') as f:
        json.dump(summary, f, indent=2)

    print('V7_PROMOTION_GATE=' + ('PASS' if promotion else 'FAIL'))
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
