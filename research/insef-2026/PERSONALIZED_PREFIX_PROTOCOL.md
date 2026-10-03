# Somno INSEF — Personalized Prefix Detection (Frozen Protocol)

Frozen before inspecting results from this experiment.

## Question
Can a short PVT prefix detect *within-person* vigilance deterioration relative to that person's own rested baseline more accurately than a fixed-prefix median rule at the same trial budget?

## Dataset
WakeApp public trial-level simple-attention data with matched KSS metadata. KSS is **not** used in this experiment. Each participant's time-0 attention session is the personal baseline; later sessions are follow-up evaluations. Participants are held out as complete groups.

## Primary reference state
At follow-up session j for person i, impairment is defined from the complete retained session as

`median(RT_ij_full) / median(RT_i_baseline) >= 1.15`.

The 15% threshold is fixed from the previous preregistered Somno experiment and is not tuned here.

## Prefix budgets
N ∈ {5, 8, 10, 12, 15, 20, 25} valid reaction-time trials. A session contributes to a budget only if at least N valid trials exist.

## Baseline comparator
At each N, classify impairment directly from the prefix median using the same 15% threshold.

## Personalized distributional model
A fixed logistic-regression classifier receives only within-person change features computed from the first N follow-up trials and the participant's time-0 baseline summary:

1. log prefix-median / baseline-median ratio;
2. prefix mean-log-RT minus baseline mean-log-RT;
3. prefix log-RT SD / baseline log-RT SD;
4. 90th-percentile RT / baseline-median ratio;
5. fraction of prefix trials slower than 1.15 × baseline median;
6. response-speed ratio relative to reciprocal baseline median;
7. normalized within-prefix median time-on-task slope.

No KSS, face features, condition labels, participant ID, future trial, or sleep-deprivation label is supplied to the classifier.

## Validation
Leave-one-participant-out validation. For each held-out participant, fit StandardScaler + LogisticRegression(C=1, liblinear, random_state=2026) on all other participants at that same trial budget and predict the held-out participant. Probability threshold is fixed at 0.5. No outcome-dependent tuning is permitted.

## Primary promotion gate
Promote the method only if **some N ≤ 15** satisfies all three:

- ≥95% agreement with the full-session reference state;
- false-negative rate ≤10%;
- ≥2 percentage-point absolute agreement improvement over the fixed-prefix median comparator at the same N.

If the gate fails, retain the negative result. N=20 and N=25 are sensitivity analyses only and cannot rescue the primary gate.

## Claim boundary
Passing would support a compact within-person vigilance-change detector on this dataset. It would not establish a clinical diagnostic, driving-safety threshold, universal PVT replacement, or prospective validation in Somno users.
