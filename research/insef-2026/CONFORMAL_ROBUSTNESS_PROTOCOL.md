# Somno INSEF — Conformal PVT Robustness Continuation

Frozen after the primary fixed five-fold experiment passed, but before inspecting any repeated-partition result. This is a post-discovery robustness continuation, not part of the original primary test.

## Fixed operating point
No method setting is changed from the successful primary experiment:
- deterioration target: 15% full-session median-RT increase from personal time-0 baseline;
- prefix length: 15 valid trials;
- seven frozen within-person features;
- StandardScaler + LogisticRegression(C=1, liblinear, random_state=2026);
- class-conditional split conformal nonconformity `1-p(true class)`;
- alpha = 0.05;
- singleton set = decision; two-label or empty set = uncertain/continue.

## Repeated subject-level partitions
Use exactly 50 seeds: 801 through 850 inclusive.

For each seed:
1. shuffle the complete list of participant IDs with NumPy PCG64(seed);
2. assign shuffled participants round-robin to five folds;
3. for each outer fold f, use fold f as test, fold (f+1) mod 5 as conformal calibration, and the remaining three folds as model training;
4. concatenate held-out predictions from all five outer folds so every eligible participant is tested exactly once for that seed.

No session from a test participant may appear in training or calibration for that fold.

## Per-seed metrics
At the fixed 15-trial operating point report:
- singleton decision accuracy;
- singleton coverage;
- impaired-session singleton coverage;
- false-negative rate among decided impaired sessions;
- empirical conformal coverage overall and by true class;
- forced 15-trial median-rule accuracy and FNR.

## Robustness success criterion
Call the primary result partition-robust only if all are true:
- median singleton accuracy across 50 seeds >=95%;
- at least 40/50 seeds independently satisfy the original primary four-part gate;
- median singleton FNR <=10%;
- median singleton coverage >=40%;
- median impaired-session singleton coverage >=20%.

All 50 seeds must be reported. No failed seed may be removed or rerun with a replacement seed.

## Claim boundary
This continuation tests sensitivity to participant partitioning. It does not turn correlated repeated sessions into independent observations and therefore does not by itself justify a strict per-session finite-sample conformal guarantee. Coverage is reported empirically under subject-level separation.
