# Somno for AI YES

## One-line pitch

**Somno is a privacy-first smartphone AI system that estimates sleep-loss-related impairment from a personalized multimodal baseline and turns that estimate into recovery and wake-up decisions.**

## What judges can verify in this repository

1. **Functional application engineering** — a complete React Native/Expo application with production screens, onboarding, check-ins, trends, recovery and account flows.
2. **Non-trivial AI/technical design** — personal normalization, quality-gated facial features, reaction-time analysis, multimodal SDI fusion, debt/recovery modelling and confidence handling.
3. **Native systems engineering** — the Smart Wake alarm is a custom Kotlin/Expo native module, not a JavaScript timer demo.
4. **Responsible AI** — explicit refusal states, missing-modality handling, local-first privacy, no raw facial-image cloud persistence and bounded claims.
5. **Evaluation infrastructure** — dedicated test suites and release checks for model logic, alarms, state handling, accessibility and synchronization.
6. **Product quality** — Figma-led design translated into reusable production components and accessibility-aware interaction patterns.

## Important claim boundaries

- Somno is a wellness/self-assessment application, not a medical diagnostic.
- The brief PVT is not presented as a full laboratory PVT.
- Recovery/stage states are model outputs, not measured sleep stages.
- The combined SDI architecture requires prospective multimodal human validation before clinical interpretation.

## Demonstration path

A concise competition demo can show:

1. Home screen and personal baseline context.
2. Daily check-in: reaction time → face scan → KSS → result.
3. SDI explanation and strongest drivers.
4. Recovery guidance and trends.
5. Smart Wake alarm flow.
6. Privacy/data controls and architecture evidence in the repo.
