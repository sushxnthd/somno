# Somno INSEF — Conformal Personalized PVT (Frozen Protocol)

Frozen before inspecting any conformal prediction-set result.

## Scientific question
Can a short, personalized PVT prefix issue high-reliability decisions for a useful subset of sessions while explicitly returning **uncertain / continue testing** for the remainder?

This is not framed as inventing adaptive PVT testing. PVT-A and PVT-BA already use sequential confidence thresholds. The tested distinction here is a class-conditional conformal uncertainty layer for *within-person deterioration relative to the individual's own rested baseline*.

## Data and target
Use the public WakeApp trial-level simple-attention data. The participant's retained time-0 session is the personal baseline. For each later session, the full retained session defines the reference state:

`impaired = median(RT_followup_full) / median(RT_baseline) >= 1.15`.

The 15% deterioration threshold is inherited unchanged from the two previous frozen Somno experiments.

KSS, sleep-condition labels, demographics, participant identity, and future PVT trials are not model inputs.

## Prefix budgets
Evaluate N ∈ {5, 8, 10, 12, 15, 20, 25} valid RT trials. N≤15 is the prespecified primary region. N=20 and 25 are sensitivity analyses and cannot rescue failure of the primary gate.

## Features
Use exactly the seven previously frozen within-person change features:
1. log(prefix median / baseline median);
2. prefix mean-log-RT minus baseline mean-log-RT;
3. prefix log-RT SD / baseline log-RT SD;
4. prefix 90th-percentile RT / baseline median;
5. fraction of prefix trials slower than 1.15 × baseline median;
6. response-speed ratio relative to reciprocal baseline median;
7. normalized within-prefix median time-on-task slope.

No new feature may be added after results are viewed.

## Subject-level train / calibration / test separation
Participants are sorted by numeric ID and assigned round-robin to five fixed folds (index mod 5). For each outer test fold f:
- test subjects: fold f;
- calibration subjects: fold (f+1) mod 5;
- model-training subjects: the other three folds.

Thus no participant contributes sessions to more than one of training, conformal calibration, or test within an outer evaluation.

## Base predictor
At each N and outer fold, fit StandardScaler + LogisticRegression(C=1.0, solver=liblinear, random_state=2026) on the training subjects only. The model outputs p(y=1|x).

## Mondrian split-conformal prediction sets
Use class-conditional (Mondrian) nonconformity:

`A(x,y) = 1 - p(y|x)`.

For each class separately, estimate the finite-sample conformal threshold from calibration subjects at alpha=0.05 using the conservative order statistic `ceil((n_c+1)*(1-alpha))`, clipped to the available calibration count. If a class is absent from a calibration split, its threshold is set to 1 (always include that class).

For each test example, include class c in the prediction set when `1 - p(c|x) <= q_c`.

Outputs:
- `{0}` → alert decision;
- `{1}` → impaired decision;
- `{0,1}` → uncertain: continue testing;
- empty set → uncertain: continue testing.

No forced decision is made for a non-singleton set.

## Primary success gate
Promote the method only if at least one prefix budget N≤15 meets **all** of the following on held-out subjects:
- singleton-decision accuracy ≥95%;
- false-negative rate among singleton decisions with true impaired state ≤10%;
- overall singleton coverage ≥40% of eligible sessions;
- at least 20% of truly impaired sessions receive a singleton decision (to prevent a trivial method that only decides easy alert cases).

The smallest N≤15 meeting all four is the prespecified headline operating point. All tested budgets must be reported whether favorable or unfavorable.

## Secondary quantities
Report class-conditional conformal coverage, set-size frequencies, coverage-vs-error, and comparison with the forced fixed-prefix median rule at the same N. Alpha=0.10 may be shown only as a labeled sensitivity analysis and cannot rescue the alpha=0.05 primary gate.

## Claim boundary
A passing result would support an uncertainty-aware, personalized short-PVT screening rule on this public dataset. It would not establish clinical diagnosis, fitness-for-duty certification, driving-safety thresholds, universal replacement of validated PVT variants, or prospective performance in Somno users.
