# Somno INSEF Research — Hypothesis V7 (frozen before scoring)

## Motivation

V5 and V6 both produced approximately 6% lower MAE with forward-only personal residual calibration, lower RMSE, and fewer false negatives, but their subject-bootstrap confidence intervals crossed zero. This suggests heterogeneous calibration stability rather than a uniformly useful personal offset.

V7 tests a reliability-aware mechanism: **personalize only when the first two strictly prior calibration residuals agree in direction.** Otherwise Somno falls back to the population model. No magnitude threshold is introduced and nothing is tuned on V7 outcomes.

## Scientific question

Can internal consistency between two prior paired KSS + PVT calibration residuals identify when a person-specific correction is reliable enough to improve future objective-vigilance prediction?

## Frozen cohort

Exactly the V6 cohort: held-out-subject future sessions with at least two strictly earlier paired follow-ups under the V5 forward-only procedure.

## Frozen population model and target

Identical to V5/V6:

- leave-one-subject-out ridge population model,
- features: current task-aligned KSS, current minus baseline KSS, baseline KSS, and log baseline median RT,
- target: final-10-trial response-speed ratio relative to the subject's time-0 baseline,
- impairment threshold: response-speed ratio <= `1/1.15`,
- no sleep-deprivation/control condition and no session index as model features.

## Frozen personal residual

For each future session, use the first two strictly earlier follow-up residuals under the population model:

`r1 = observed1 - predicted1`

`r2 = observed2 - predicted2`

The ungated V6 correction is the shrunken mean residual using all available prior follow-ups, with shrinkage `n/(n+1)`.

## Consistency gate

The V7 personalized correction is activated **only if the first two residuals have the same strict sign**:

`r1 * r2 > 0`.

If the signs agree, use the same V6 shrunken mean residual from all strictly prior follow-ups. If they disagree or either is exactly zero, use the unmodified population prediction.

There is no magnitude cutoff, learned gate, or post-hoc threshold.

## Compared predictors

1. Population KSS model.
2. Ungated personalization (V6 rule).
3. Consistency-gated personalization (V7 rule).

## Primary metrics

- MAE,
- RMSE,
- paired subject-level MAE improvement versus population,
- 10,000-subject bootstrap percentile 95% CI, seed 7070,
- balanced accuracy and false-negative rate at the frozen impairment threshold,
- fraction of scored sessions for which the consistency gate activates.

## Primary promotion gate

V7 passes only if all are true:

1. gated MAE is at least 5% lower than population MAE,
2. gated RMSE is lower than population RMSE,
3. the 95% subject-bootstrap CI for mean gated MAE improvement is entirely above zero,
4. gated false-negative rate does not exceed population false-negative rate by more than 2 percentage points, and
5. gated MAE is no worse than ungated V6 personalization on the same cohort.

If the gate fails, this personalization branch is considered suggestive but not promotion-grade; no further subgroup search is used to rescue it.

## Claim boundary

A pass would support a narrow mechanism: repeated calibration consistency can act as a reliability gate for personalized subjective-to-objective vigilance mapping on this public repeated-measures dataset. It would not validate clinical diagnosis, driving fitness, facial-fatigue inference, or universal deployment performance.
