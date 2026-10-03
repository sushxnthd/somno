# Somno INSEF Research — Hypothesis V3 (frozen before scoring)

## Motivation from retained V2 failure

V2 showed an asymmetric pattern: KSS context increased selective early-decision coverage, but the model did not reliably make early impaired calls. V3 therefore removes early impaired classification entirely. The only optional shortcut is an early **clear/alert** decision. Every other case continues objective PVT testing.

This is a new operating policy, not a retuning of V2 thresholds.

## Scientific question

Can a short personalized PVT prefix plus KSS context safely clear a useful fraction of alert sessions while controlling the risk that an impaired subject is falsely reassured?

## Frozen data and endpoint

Identical eligible WakeApp subject-sessions and features to V2:

- time-0 PVT is the personal baseline,
- first 8 valid follow-up trials are early evidence,
- last 10 valid follow-up trials define the reference outcome,
- response speed = `mean(1000/RT_ms)`,
- impaired if suffix response speed / baseline response speed <= `1/1.15`.

The suffix is never used as an input feature.

## Models

Two identical regularized logistic-regression pipelines:

1. **Objective-only:** first-8-trial personalized PVT features.
2. **Somno-context:** same objective features + task-aligned KSS and change from baseline KSS.

Missing context is imputed from proper-training data only.

## Outer subject-disjoint evaluation

Five shuffled GroupKFold test folds, random seed 3030. A test subject never appears in fitting or calibration data.

Inside each outer training set, subjects are split once into:

- proper-training subjects (75% of inner groups),
- calibration subjects (25% of inner groups),

using a 4-fold shuffled GroupKFold with seed `4040 + outer_fold`; one fold is calibration and the other three are proper training.

The model is fitted only on proper-training subjects.

## Subject-level conformal-style clearance threshold

Target error level: alpha = 0.05.

For each calibration subject who has at least one impaired session, compute the **minimum predicted impairment probability across that subject's impaired calibration sessions**. This converts repeated sessions into one worst-case positive score per subject.

Let these minimum scores be sorted ascending, with `m` impaired calibration subjects. Define

`k = floor(alpha * (m + 1))`.

If `k < 1`, no early clearance is permitted in that fold. Otherwise, the clearance threshold is the k-th smallest subject-minimum score. A test session is early-cleared only when its predicted impairment probability is **strictly below** this threshold. All other sessions continue objective testing.

This construction is intentionally conservative: a calibration subject with any unusually low-scored impaired session pushes the clearance threshold downward.

Because WakeApp contains repeated sessions and is not a prospectively sampled deployment population, any finite-sample guarantee is described as conformal-style / exchangeability-dependent rather than a clinical guarantee.

## Primary metrics

Across held-out test subjects:

- overall early-clearance coverage,
- safe-session clearance rate (fraction of truly non-impaired sessions cleared),
- session false-reassurance rate (impaired sessions cleared / all impaired sessions),
- subject false-reassurance rate (test subjects with >=1 impaired session cleared / test subjects with >=1 impaired session),
- negative predictive value among cleared sessions,
- number of cleared sessions and false reassurances.

## Primary promotion gate

Somno-context is promoted only if all are met on aggregated held-out subjects:

1. session false-reassurance rate <= 5%,
2. subject false-reassurance rate <= 5%,
3. negative predictive value among cleared sessions >= 95%,
4. safe-session clearance rate >= 15%, and
5. safe-session clearance rate at least 5 percentage points higher than objective-only.

Otherwise V3 is retained as a negative result.

## Claim boundary

Passing would support only the claim that, on this public smartphone vigilance dataset and under subject-disjoint evaluation, KSS context increased conservative early-clearance efficiency at the specified empirical risk level. It would not validate diagnosis, driving fitness, the facial model, or a universal 5% deployment guarantee.
