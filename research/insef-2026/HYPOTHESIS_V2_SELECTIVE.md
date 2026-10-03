# Somno INSEF Research — Hypothesis V2 (frozen before scoring)

## Why V2 exists

V1 tested whether a capped KSS-derived prior could shorten a sequential likelihood-ratio PVT while preserving >=95% agreement with a full-session 15% median-RT impairment label. On subject-held-out WakeApp data, V1 failed that promotion gate (Somno-prior agreement 84.1%). V2 is a distinct hypothesis, not a threshold retune of V1.

## Scientific question

Can Somno make **risk-controlled early decisions** from a short personalized PVT prefix, explicitly abstaining when evidence is insufficient, and can KSS context increase the fraction of sessions that can be decided early without increasing false reassurance?

The key design principle is that context is never allowed to replace objective evidence. It may only change confidence around an objective PVT prefix. Uncertain cases continue testing.

## Public data

WakeApp public smartphone vigilance dataset (`benholding/WakeApp`): trial-level simple-attention reaction times and repeated KSS ratings.

## Unit of evaluation

A follow-up subject-session (`time > 0`) with:

- a valid subject baseline session at `time = 0`,
- at least 18 valid PVT responses in the follow-up session,
- at least 18 valid PVT responses in baseline,
- valid reaction times (>0 ms), PVT stimulus rows only, and no marked false response.

No subject may appear in both training and test folds.

## Frozen target

The target is deliberately separated from the early prefix.

- **Early evidence:** first 8 valid trials of the follow-up session.
- **Reference outcome:** last 10 valid trials of that same follow-up session.
- **Personal baseline:** all valid trials in the subject's time-0 session.
- Response speed is mean reciprocal RT, `mean(1000 / RT_ms)`, matching Somno's production PVT engine.
- A follow-up session is labelled impaired when suffix response speed is at most `1/1.15` of baseline response speed. This is the reciprocal-speed analogue of a 15% multiplicative RT slowdown used in V1.

The suffix is never used as a model feature.

## Frozen feature sets

### Objective-only

Computed only from the first 8 follow-up trials plus the subject baseline:

1. prefix response-speed / baseline response-speed,
2. prefix median-RT / baseline median-RT,
3. fraction of prefix RTs > 500 ms,
4. prefix RT coefficient of variation,
5. prefix first-to-last slope divided by baseline median RT,
6. log baseline median RT.

### Somno-context

All objective-only features plus:

7. task-aligned KSS for the current session,
8. change in KSS from the subject's time-0 baseline.

KSS is taken from the rating paired with the reaction-time task when available; otherwise the within-session median KSS is used. Missing values are imputed from training data only.

## Frozen model

Regularized logistic regression (`C=1`, liblinear) inside an imputation + standardization pipeline. No neural network and no per-test-subject fitting.

## Subject-disjoint nested evaluation

- Outer evaluation: 5 shuffled subject-group folds, seed 2026.
- Threshold selection inside each outer training set: 4 shuffled subject-group folds, seed 2027.
- Models and early-decision thresholds are selected using training subjects only.

## Selective decision rule

For predicted impairment probability `p`:

- early **safe** decision if `p <= L`,
- early **impaired** decision if `p >= H`,
- otherwise **abstain** and continue objective testing.

`L` and `H` are chosen from the fixed grid
`{0.02,0.05,0.10,0.15,0.20,0.25,0.30,0.35,0.40,0.45}` and
`{0.55,0.60,0.65,0.70,0.75,0.80,0.85,0.90,0.95,0.98}`.

Within each outer training set, choose the threshold pair with maximum inner-OOF coverage subject to BOTH:

1. selective accuracy >= 95%, and
2. false-reassurance rate <= 2%, where false reassurance is a truly impaired session receiving an early **safe** decision divided by all truly impaired sessions.

Ties are broken by lower false reassurance, then higher selective accuracy, then wider abstention interval. If no pair is eligible, the model abstains on every case in that outer fold.

## Baselines

Compare:

1. objective-only selective model,
2. Somno-context selective model.

Both use identical folds, target, classifier family and threshold-selection procedure.

## Primary metrics

Aggregated across outer held-out folds:

- early-decision coverage,
- selective accuracy among early decisions,
- false-reassurance rate over all impaired sessions,
- number of false reassurances,
- impaired-case early-detection rate,
- safe-case early-clearance rate.

Bootstrap confidence intervals, if reported, are descriptive and resample subjects, not sessions.

## Primary promotion gate

V2 is promoted as a positive Somno result only if the Somno-context model on held-out subjects simultaneously achieves:

1. selective accuracy >= 95%,
2. false-reassurance rate <= 2%,
3. early-decision coverage >= 20%, and
4. coverage at least 5 percentage points higher than the objective-only model.

If any criterion fails, V2 is retained as a negative result and is not presented as a validated improvement.

## Claim boundary

Even if the gate passes, this experiment supports only a public-dataset result about risk-controlled early PVT decisions with KSS context. It does not validate Somno's facial-fatigue model, clinical sleepiness diagnosis, driving safety, or prospective real-world outcomes.
