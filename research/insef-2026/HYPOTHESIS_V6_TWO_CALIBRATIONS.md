# Somno INSEF Research — Hypothesis V6 (frozen before subgroup scoring)

## Motivation

V5 used the fixed residual-shrinkage rule `n/(n+1)` and produced a 6.47% aggregate MAE reduction, lower RMSE and fewer false negatives, but the subject-bootstrap confidence interval for mean MAE improvement crossed zero. The mechanism predicts that a person-specific bias estimate should become more reliable after more than one paired calibration.

V6 is a confirmatory dose test. The V5 model, features, shrinkage rule, outcome and leave-one-subject-out population fitting remain unchanged.

## Scientific question

Among future sessions for which **two strictly earlier paired KSS + PVT follow-ups** are available, does the same frozen Somno personal-calibration rule reliably improve objective vigilance prediction relative to the same population KSS model?

## Frozen cohort

Score only held-out-subject sessions with `n_prior >= 2` under the V5 forward-only procedure. No subject/session is selected using prediction error or outcome direction.

## Frozen method

Identical to V5:

- other-subject ridge population model,
- features: current KSS, delta-KSS, baseline KSS, log baseline median RT,
- target: final-10-trial response-speed ratio relative to time-0 baseline,
- person-specific residual from strictly earlier follow-ups,
- shrinkage `n_prior/(n_prior+1)`,
- no tuning on V6 outcomes.

## Primary metrics

- MAE,
- RMSE,
- paired subject-level MAE improvement with 10,000-subject bootstrap, seed 6060,
- balanced accuracy and false-negative rate at response-speed ratio `1/1.15`.

## Primary promotion gate

V6 passes only if:

1. personalized MAE is at least 5% lower than population MAE,
2. personalized RMSE is lower,
3. the 95% subject-bootstrap CI for mean MAE improvement is entirely above zero, and
4. personalized false-negative rate does not exceed population false-negative rate by more than 2 percentage points.

A pass would be interpreted as evidence that **at least two** prior paired check-ins are needed for reliable self-report calibration on this dataset. A failure is retained and no post-hoc subgroup is promoted.
