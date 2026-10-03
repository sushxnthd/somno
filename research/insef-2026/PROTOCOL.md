# Somno INSEF 2026 — Frozen Sequential-PVT Analysis Plan

Frozen on 2026-10-03 before fitting the sequential decision model described below. This is an analysis freeze, not a preregistration: preliminary DROZY KSS/PVT summaries and a failed simple discordance-ranking analysis had already been inspected.

## Research question
Can personalized passive sleepiness evidence be used only as a prior for a sequential objective psychomotor vigilance test (PVT), reducing test burden while preserving the decision that would be obtained from the full smartphone PVT?

The intended contribution is not adaptive PVT itself. Adaptive/brief PVT methods already exist. The specific hypothesis is that a personalized passive prior (subjective sleepiness plus each participant's own vigilance baseline) can reduce the number of objective trials required without increasing dangerous false-negative decisions.

## Primary dataset
Holding et al. WakeApp smartphone vigilance dataset (public third-party human-subject data). Use subject-disjoint evaluation. The repository's trial-level smartphone PVT streams and KSS ratings are used as provided; Somno did not collect these data.

Primary analysis uses participants for whom both a time-point-0 smartphone PVT baseline and follow-up smartphone PVT/KSS observations are retrievable. No trial from a held-out participant may be used to fit prior parameters, stopping thresholds, or calibration functions.

## Reference outcome
For each follow-up session, the complete available smartphone PVT session is the reference measurement. Primary impairment definition: full-session median valid reaction time is at least 15% slower than that participant's time-point-0 median reaction time.

Sensitivity analyses repeat the experiment at 10%, 20%, and 25% relative slowing thresholds.

## Trial preprocessing
- Preserve original within-session trial order.
- Use valid response trials with finite positive reaction time.
- Work in log reaction-time space for sequential evidence to reduce the leverage of long right tails.
- Participant baseline mean/dispersion are estimated only from that participant's time-point-0 valid trials.
- No future trial may influence an earlier stopping decision.

## Compared policies
1. **Full session** — reference only, no early stop.
2. **Fixed-N** — decisions after the first 5, 10, and 15 valid trials.
3. **Neutral sequential** — sequential likelihood/posterior update initialized with neutral prior odds.
4. **Somno prior-informed sequential** — same objective sequential update, but initial odds are estimated from training participants using KSS relative to the participant's baseline KSS and personal baseline vigilance. Passive evidence may change only the prior; once the PVT begins, all new evidence is objective reaction-time evidence.

If a policy has not crossed a decision boundary by the maximum available trials, it must abstain/use the full-session result; it may not force an early classification.

## Evaluation
Primary outcomes, evaluated on held-out participants:
- agreement with the full-session impairment decision;
- false-negative rate for objectively impaired sessions;
- median number of valid trials consumed;
- proportion of sessions stopped early;
- Brier score / calibration where posterior probabilities are available.

The main success gate requires the prior-informed sequential policy to reduce median trial count relative to the neutral sequential policy while not increasing held-out false-negative rate by more than 2 percentage points and keeping full-session agreement at or above 95%.

A stronger promotion gate is met if the prior-informed policy also beats the best fixed-N policy at comparable trial burden.

## Model fitting and threshold selection
All tunable quantities, including the mapping from KSS/baseline information to prior odds and sequential stopping boundaries, must be selected using training participants only. Evaluation must be grouped by participant. No row-wise random split is permitted.

Stopping boundaries are symmetric unless training-only calibration demonstrates a prespecified safety reason for a more conservative impairment boundary. Any asymmetry must be reported.

## Secondary dataset
DROZY is a secondary external dataset for subjective/objective dissociation and session-level sensitivity analysis. It is not used to tune the WakeApp sequential policy.

A preliminary simple rule based only on disagreement between subjective/session-context predictors failed to rank objective-error cases better than random. This negative result is retained and must not be rewritten as a positive result.

## Claim boundaries
- This is fatigue/vigilance awareness research, not diagnosis, treatment, or a safety certification.
- Public datasets are third-party human-subject data; no participant-collected WakeApp/DROZY data are claimed.
- Adaptive PVT is prior art. Any novelty claim is limited to personalized passive-prior-informed sequential objective confirmation and its empirical evaluation in the Somno architecture.
- Failure to meet the frozen promotion gate means this extension is not promoted as a positive INSEF result.

## Reproducibility
Retain the exact accessible-subset manifest, raw-source references, preprocessing output, per-fold decisions, stopping trial for every session, failed/abstained sessions, and all threshold-sensitivity results.