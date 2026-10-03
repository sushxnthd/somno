# Somno INSEF — Independent NEMAR Endpoint Validation (Frozen Protocol)

Frozen before computing any aggregate NEMAR PVT outcome. During dataset discovery, the column definitions and the first few participant rows were inspected to verify that paired normal-sleep (NS) and sleep-deprivation (SD) PVT summaries exist. No cohort-level statistic, threshold-crossing rate, significance test, or subgroup result was computed before this protocol was written.

## Purpose
The successful Somno conformal experiment defines within-person vigilance deterioration as a >=15% increase in full-session median reaction time from a personal rested baseline. This independent analysis asks whether that **pre-existing 15% endpoint** is meaningfully expressed under experimentally induced total sleep deprivation in a separate public cohort.

This is endpoint validation, not external validation of the 15-trial conformal predictor, because NEMAR publishes PVT summary outcomes rather than trial-level PVT streams.

## Dataset
NEMAR/OpenNeuro dataset `on004902` / `ds004902`, *A resting-state EEG dataset for sleep deprivation* (71 participants). Public participant metadata contain paired PVT summaries after normal sleep and sleep deprivation:
- item 1: number of lapses;
- item 2: median reaction time (ms);
- item 3: standard deviation of RT.

Normal sleep is treated as each participant's rested reference. Sleep deprivation is the challenged state. Session order was counterbalanced in the source dataset.

## Fixed primary endpoint
For every participant with finite positive paired median RT values:

`R_i = medianRT_SD / medianRT_NS`

A participant crosses the pre-existing Somno deterioration endpoint iff `R_i >= 1.15`.

The 1.15 threshold is locked from the earlier WakeApp experiments and may not be modified based on NEMAR outcomes.

## Prespecified primary quantities
Report:
1. number of complete paired participants;
2. median and IQR of `R_i`;
3. fraction and exact 95% binomial confidence interval with `R_i >= 1.15`;
4. paired median RT in NS and SD;
5. two-sided Wilcoxon signed-rank test of paired median RT difference;
6. Hodges-Lehmann-style median paired difference reported descriptively as the sample median of `RT_SD - RT_NS` (not labeled an exact HL estimator).

## Prespecified corroborating quantities
Among participants with complete paired lapse counts:
- median lapse count in NS and SD;
- median within-person lapse change;
- two-sided Wilcoxon signed-rank test for lapse change;
- Spearman correlation between median-RT ratio `R_i` and lapse-count change.

No subgroup or demographic analysis is permitted in this confirmation.

## Endpoint-validation gate
Call the 15% endpoint externally supported only if all are true:
- cohort median `R_i > 1.15`;
- at least 50% of complete participants cross `R_i >= 1.15`;
- paired median RT increase has Wilcoxon p < 0.01;
- median paired lapse change is >0 among complete lapse pairs.

If any condition fails, retain the result as a failed external endpoint validation. No alternate threshold may be substituted.

## Claim boundary
Passing would show that the fixed 15% personal-baseline endpoint identifies a common objective vigilance deterioration under total sleep deprivation in an independent cohort. It does not validate the Somno classifier externally, establish a clinical cutoff, or show specificity against other causes of reaction-time slowing.
