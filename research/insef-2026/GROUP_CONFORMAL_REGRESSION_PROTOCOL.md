# Somno INSEF — Participant-Level Conformal Regression (Frozen Protocol)

Frozen after the earlier binary-threshold experiments and before inspecting any result from the fresh seeds specified below.

## Motivation
The external NEMAR confirmation showed that total sleep deprivation strongly slows median PVT reaction time, but the inherited 15% binary deterioration threshold did not generalize cleanly: the independent cohort median was close to, but below, that cutoff. The final Somno experiment therefore treats vigilance deterioration as a **continuous within-person quantity** and asks whether a 15-trial prefix can predict it with honest participant-level uncertainty.

Repeated sessions from one participant are correlated. To avoid calibrating as if sessions were independent, the conformal unit here is the **participant**. Each calibration participant contributes one nonconformity score: their maximum absolute prediction error across all eligible follow-up sessions.

## Data
WakeApp public trial-level simple-attention data. Each person's retained time-0 session is their personal rested baseline. Every later session with at least 15 valid trials is a follow-up target.

## Continuous target
For follow-up session j of participant i:

`Y_ij = log(medianRT_full,ij / medianRT_baseline,i)`.

No binary impairment threshold is used for model fitting, calibration, or the primary success gate.

## 15-trial prefix predictors
Exactly six continuous within-person features are computed from the first 15 valid follow-up trials relative to the personal baseline:
1. log(prefix median RT / baseline median RT);
2. prefix mean log-RT minus baseline mean log-RT;
3. prefix log-RT SD divided by baseline log-RT SD;
4. prefix 90th-percentile RT divided by baseline median RT;
5. prefix reciprocal-response-speed divided by reciprocal baseline median RT;
6. normalized difference between median RT in the second and first halves of the prefix.

The previous threshold-derived feature (fraction slower than 1.15× baseline) is deliberately excluded because the present experiment is threshold-free. KSS, sleep condition, demographics, participant ID and future trials are excluded.

## Point predictor
`StandardScaler + Ridge(alpha=1.0)` predicts Y from the six features. The model is fitted only on training participants.

## Participant-level split conformal interval
Use alpha=0.10 (nominal 90% participant-level simultaneous coverage). Alpha=0.10 is selected in advance because the calibration fold contains only about one-fifth of 162 participants; alpha=0.05 would often reduce to the single maximum calibration score and yield an unnecessarily coarse interval.

For each calibration participant i:

`S_i = max_j |Y_ij - Yhat_ij|`

over all eligible follow-up sessions j for that participant.

Let m be the number of calibration participants. Set q to the conservative split-conformal order statistic at rank `ceil((m+1)*(1-alpha))`, clipped to m.

For each test session, return the log-ratio interval `[Yhat-q, Yhat+q]`; exponentiating gives an interval for the deterioration ratio. A test participant is counted as simultaneously covered only if **every eligible follow-up session** for that participant lies in its interval.

## Baseline comparator
Use the 15-trial prefix median itself as the point prediction:

`Yhat_prefix = log(medianRT_prefix / medianRT_baseline)`.

Calibrate this baseline with the **same participant-max conformal construction**, so interval width comparisons are at the same nominal participant-level coverage and use identical train/calibration/test subject splits.

## Completely fresh partitions
Use exactly 50 new NumPy PCG64 seeds **1101 through 1150 inclusive**.

For each seed, shuffle participant IDs and assign round-robin to five folds. For each outer test fold f:
- test = fold f;
- calibration = fold (f+1) mod 5;
- training = remaining three folds.

Every participant is tested once per seed. No participant appears in more than one role within an outer fold.

## Metrics per seed
For Ridge and prefix-median baseline separately:
- participant-level simultaneous empirical coverage;
- session-level empirical coverage (descriptive only);
- median conformal q across outer folds;
- median multiplicative full interval width on the ratio scale;
- session-level MAE in log deterioration ratio;
- median absolute error in percentage-point deterioration ratio.

Also report the paired per-seed difference in q and MAE.

## Frozen promotion gate
Promote the continuous participant-level method only if all are true across seeds 1101–1150:
1. median participant-level simultaneous coverage >=90%;
2. at least 40/50 seeds have participant-level simultaneous coverage >=85%;
3. median conformal q for Ridge is at least 10% smaller than the prefix-median baseline's median q;
4. Ridge has lower log-ratio MAE than the prefix-median baseline in at least 40/50 seeds.

Every seed must be retained. No seed may be replaced, and no model parameter, feature, alpha, metric or gate may be altered after outcomes are inspected.

## Secondary threshold view
After the interval experiment is complete, the old 15% threshold may be applied only as a **descriptive secondary view**: classify a session as clearly above the threshold if the entire ratio interval is >=1.15, clearly below if the entire interval is <1.15, otherwise uncertain. This secondary view cannot rescue or fail the primary continuous promotion gate.

## Claim boundary
Passing would support a participant-level uncertainty interval for continuous within-person vigilance deterioration from a 15-trial prefix on WakeApp. It would not establish clinical diagnosis, fitness-for-duty certification, exact coverage under population shift, or prospective performance in Somno users.
