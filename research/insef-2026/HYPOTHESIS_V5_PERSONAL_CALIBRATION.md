# Somno INSEF Research — Hypothesis V5 (frozen before scoring)

## Motivation

Prior work reports stronger within-person than between-person correspondence between subjective sleepiness and objective vigilance. Somno already collects repeated paired KSS and PVT check-ins. V5 tests whether those pairs can estimate a stable person-specific calibration residual rather than treating the same KSS value as equivalent across users.

This branch no longer tries to shorten a PVT. It tests Somno's broader personalization hypothesis.

## Scientific question

Can one or two prior paired KSS + PVT check-ins estimate an individual's subjective-to-objective calibration bias and thereby improve prediction of future objective vigilance on unseen subjects relative to a population KSS model?

## Data and temporal separation

WakeApp public smartphone vigilance data.

For every subject:

- time 0 is the personal objective and KSS baseline,
- follow-up sessions are ordered by recorded session index,
- objective outcome for a follow-up is the response-speed ratio from the final 10 valid PVT trials relative to the subject's full time-0 response speed,
- only follow-ups at `time >= 2` are scored in the primary analysis so at least one strictly earlier paired follow-up can be available for personalization.

No future session is ever used to personalize an earlier prediction.

## Population model

For each held-out subject, fit a ridge regression on all other subjects to predict continuous objective response-speed ratio from:

1. current task-aligned KSS,
2. current KSS minus time-0 KSS,
3. time-0 KSS,
4. log personal baseline median RT.

The sleep-deprivation/control condition and session index are not model features.

Missing values are median-imputed from training subjects only and features standardized in the training pipeline.

## Personal calibration residual

For a held-out subject at follow-up time `t >= 2`:

1. obtain the frozen population model's prediction for every strictly earlier follow-up `1 <= h < t`,
2. compute each prior residual `observed_speed_ratio_h - population_prediction_h`,
3. average those prior residuals,
4. shrink the residual toward zero by `n_prior / (n_prior + 1)`,
5. add the shrunken residual to the current population prediction.

Thus one prior pair receives weight 1/2; two prior pairs receive weight 2/3. No shrinkage parameter is tuned on the results.

## Compared predictors

1. **Population KSS:** other-subject ridge model only.
2. **Somno personal calibration:** same model + strictly past shrunken personal residual.

## Primary outcomes

Continuous prediction:

- MAE of future objective response-speed ratio,
- RMSE,
- per-subject MAE.

Safety-oriented threshold outcome:

- reference impairment: response-speed ratio <= `1/1.15`,
- predicted impairment uses the same threshold on predicted continuous ratio,
- balanced accuracy,
- false-negative rate.

## Subject-level uncertainty analysis

Compute the paired difference in subject-level MAE (`population - personalized`) among subjects with scored future sessions. Report a deterministic bootstrap (10,000 subject resamples, seed 5050) percentile 95% confidence interval for the mean paired improvement.

## Primary promotion gate

V5 is promoted only if all are true:

1. personalized overall MAE is at least 5% lower than population MAE,
2. personalized RMSE is lower than population RMSE,
3. the 95% subject-bootstrap CI for mean MAE improvement is entirely above zero, and
4. personalized false-negative rate does not exceed population false-negative rate by more than 2 percentage points.

Otherwise V5 is retained as a negative result.

## Claim boundary

A pass would support a narrow result: prior paired self-report + objective vigilance measurements can improve future KSS-to-vigilance calibration on this repeated-measures public dataset. It would not show that KSS alone diagnoses fatigue, nor validate Somno's facial component or clinical use.
