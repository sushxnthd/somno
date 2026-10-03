# Somno INSEF — Cross-Conformal Confirmation (Frozen Protocol)

Frozen after the single-split conformal result and its 50-seed robustness continuation, but before inspecting any outcome on the new seed block below.

## Motivation
The fixed single-calibration split passed the original preregistered gate, but only 30/50 fresh participant partitions met all four criteria. Median performance remained strong, suggesting sensitivity to which participants happened to form the calibration fold. Cross-conformal prediction is a standard way to reduce dependence on one calibration split by rotating the calibration fold and aggregating foldwise conformal p-values.

This experiment is a **post-discovery confirmation**, not part of the original primary test.

## Locked scientific settings
No scientific setting is retuned:
- full-session reference impairment: follow-up median RT / personal time-0 median RT >= 1.15;
- prefix budget: exactly 15 valid RT trials;
- seven previously frozen within-person change features;
- StandardScaler + LogisticRegression(C=1.0, solver=liblinear, random_state=2026);
- class-conditional/Mondrian nonconformity: `A(x,c)=1-p_model(c|x)`;
- significance level alpha = 0.05;
- singleton set = alert/impaired decision; non-singleton or empty set = uncertain/continue testing.

KSS, sleep-condition labels, demographics, participant identity and future PVT trials remain excluded from model inputs.

## Completely fresh participant partitions
Use exactly 50 new seeds: **901 through 950 inclusive**. No seed from 801–850 may be reused.

For each seed:
1. shuffle complete participant IDs using NumPy PCG64(seed);
2. assign participants round-robin to five outer folds;
3. each outer fold f is used once as the held-out test fold.

### Paired single-split baseline
For test fold f:
- calibration = fold (f+1) mod 5;
- proper training = the remaining three folds.

For each candidate class c, compute the ordinary class-conditional conformal p-value

`p_c = (1 + # calibration examples of class c with score >= test score_c)/(n_cal,c+1)`.

Include c iff `p_c > 0.05`.

### Cross-conformal method
For the same test fold f, the four non-test folds are rotated as calibration folds. For rotation r:
- calibration = one non-test fold;
- training = the other three non-test folds;
- fit a fresh locked logistic model;
- compute the class-conditional foldwise p-value `p_{r,c}` using the same formula above.

Aggregate by the arithmetic mean across the four rotations:

`p_cross,c = mean_r p_{r,c}`.

Include class c iff `p_cross,c > 0.05`.

Averaging foldwise p-values follows the classical cross-conformal construction. Because repeated sessions from a participant are correlated and cross-conformal validity is weaker than ordinary split-conformal validity, all coverage in this experiment is described **empirically**, not as an exact 95% finite-sample guarantee.

## Metrics per seed
For both paired methods report:
- singleton decision accuracy;
- singleton coverage;
- impaired-session singleton coverage;
- FNR among singleton decisions for truly impaired sessions;
- empirical prediction-set coverage overall and by class;
- number of decided sessions and impaired decided sessions.

Also retain the forced 15-trial median-rule accuracy and FNR as a non-abstaining reference.

## Frozen confirmation gate
The cross-conformal method is promoted as a calibration-stability improvement only if all are true across seeds 901–950:
1. median singleton accuracy >=95%;
2. median singleton FNR <=10%;
3. median singleton coverage >=40%;
4. median impaired-session singleton coverage >=20%;
5. at least 40/50 seeds satisfy all four original per-seed operating criteria;
6. the cross-conformal per-seed gate-pass count is strictly greater than the paired single-split gate-pass count on the same 901–950 seeds.

Every seed must be reported. Failed seeds cannot be replaced. No threshold, feature, model parameter, alpha or aggregation rule may be changed after outcomes are inspected.

## Claim boundary
Passing supports reduced calibration-partition sensitivity on WakeApp under participant-level train/calibration/test separation. It does not establish clinical diagnostic validity, fitness-for-duty certification, universal PVT replacement, or an exact per-session 95% conformal guarantee under clustered repeated measurements.
