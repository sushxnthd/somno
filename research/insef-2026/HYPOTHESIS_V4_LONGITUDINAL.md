# Somno INSEF Research — Hypothesis V4 (frozen before scoring)

## Motivation

V3 demonstrated zero held-out false reassurances under a conservative subject-level calibration rule, but clearance utility was too low (Somno-context cleared 7.3% of truly safe sessions). Somno is a longitudinal system, whereas V1–V3 intentionally treated each follow-up session almost independently. V4 tests whether **past objective vigilance history** improves conservative early clearance.

No V3 risk threshold is loosened. The calibration construction and alpha remain unchanged.

## Scientific question

Does adding strictly past, within-person vigilance history to the first 8 current PVT trials + current KSS increase safe early-clearance coverage on unseen subjects while preserving the same false-reassurance constraints?

## Data, target and current-session features

Identical to V3:

- WakeApp public trial-level smartphone vigilance data,
- personal baseline = subject time 0,
- current early prefix = first 8 valid PVT trials,
- current reference outcome = last 10 valid PVT trials,
- impaired if suffix response speed / baseline response speed <= `1/1.15`,
- current KSS is task-aligned when possible.

## Strictly historical features

For current follow-up time `t`, only sessions with `0 < time < t` may contribute. No current suffix or future session is used.

From prior follow-up sessions with >=10 valid PVT trials, compute:

1. most recent prior full-session response-speed / personal-baseline response-speed,
2. most recent prior full-session median-RT / personal-baseline median-RT,
3. most recent prior KSS,
4. running mean of prior full-session response-speed ratios,
5. worst (minimum) prior full-session response-speed ratio.

If no prior follow-up is available, these features are missing and are imputed from proper-training subjects only.

The sleep-deprivation/control condition and session time index are **not** model features.

## Compared models

1. **Current-context comparator:** V3 objective prefix + current KSS/delta-KSS.
2. **Longitudinal Somno:** the same current-context features + the five strictly historical features above.

Both use the same regularized logistic-regression pipeline.

## Risk control and evaluation

Exactly the V3 procedure:

- five outer shuffled subject-group test folds, seed 3030,
- within each outer training fold, 75% proper training / 25% calibration subjects via 4-fold GroupKFold, seed `4040 + fold`,
- subject-level worst-case positive calibration score,
- alpha = 0.05,
- early-clear only when predicted impairment probability is strictly below the calibrated threshold,
- every other case continues objective testing.

## Primary metrics

- safe-session clearance rate,
- session false-reassurance rate,
- subject false-reassurance rate,
- NPV among cleared sessions,
- overall clearance coverage.

## Primary promotion gate

Longitudinal Somno is promoted only if all held-out aggregate conditions are met:

1. session false-reassurance rate <= 5%,
2. subject false-reassurance rate <= 5%,
3. NPV among cleared sessions >= 95%,
4. safe-session clearance rate >= 15%, and
5. safe-session clearance rate at least 5 percentage points higher than the current-context comparator.

Otherwise V4 is retained as a negative result.

## Claim boundary

A pass would show only that longitudinal, strictly past within-person vigilance history improved conservative early clearance on this public dataset under subject-disjoint evaluation. It would not establish a clinical guarantee, validate the facial model, or justify using protocol condition/time as a shortcut.
