<div align="center">
  <img src="assets/icon.png" width="104" alt="Somno app icon" />
  <h1>Somno</h1>
  <p><strong>Privacy-first multimodal AI for personal fatigue awareness, sleep-loss self-assessment and recovery-aware wake decisions.</strong></p>
  <p>
    <img alt="Platform" src="https://img.shields.io/badge/platform-Android-3DDC84" />
    <img alt="React Native" src="https://img.shields.io/badge/React%20Native-0.86-61DAFB" />
    <img alt="Expo" src="https://img.shields.io/badge/Expo-57-000020" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6.0-3178C6" />
    <img alt="Privacy" src="https://img.shields.io/badge/raw%20face%20images-not%20stored-6D4AFF" />
    <img alt="Evidence" src="https://img.shields.io/badge/scientific%20basis-evidence--informed-A77BFF" />
  </p>
</div>

Somno is a smartphone wellness system built to answer a harder question than *“How many hours did I sleep?”*: **how impaired do I appear relative to my own alert baseline, what evidence supports that estimate, and what should I do next?**

It combines a brief reaction-time task, on-device facial/ocular features, subjective sleepiness and recent sleep history into a transparent **Sleep Deprivation Index (SDI)**. The estimate then feeds recovery guidance, trends and a guarded Android wake/snooze workflow.

Somno is deliberately designed as a **personal-reference system** rather than a generic “8 hours = good” tracker. It measures change from the user’s own calibrated state, handles missing or low-quality signals explicitly, and keeps the core inference inspectable.

> **Responsible-use boundary:** Somno is an educational/wellness and research prototype, not a medical device. It does not diagnose sleep disorders, certify fitness to drive, replace occupational fatigue policy, or claim real-time polysomnographic sleep-stage detection.

### Build artifacts

The competition/release folder contains the installable Android APK and companion build artifacts:

**[Somno v27 builds on Google Drive](https://drive.google.com/drive/folders/1LCeZuJZ3pZdY8xnOJjpHKwOgkAhN6TEX?usp=drive_link)**

## Product preview

<table>
  <tr>
    <td align="center"><img src="listing/play/home.png" width="210" alt="Somno home screen"/><br/><sub><b>Daily state</b></sub></td>
    <td align="center"><img src="listing/play/result.png" width="210" alt="Somno SDI result"/><br/><sub><b>Explainable SDI</b></sub></td>
    <td align="center"><img src="listing/play/recovery.png" width="210" alt="Somno recovery view"/><br/><sub><b>Recovery planning</b></sub></td>
    <td align="center"><img src="listing/play/alarms.png" width="210" alt="Somno smart wake alarm"/><br/><sub><b>Native Smart Wake</b></sub></td>
  </tr>
</table>

## Why Somno

Most consumer sleep tools emphasize duration or wearable-derived sleep stages. Somno takes a different approach:

1. **Personal reference over generic thresholds** — today is compared with the same user’s calibrated alert baseline.
2. **Multiple complementary signals over one fragile signal** — behavioral, facial, subjective and sleep-history evidence can reinforce or challenge one another.
3. **Quality-aware inference** — unusable camera data or missing modalities reduce confidence instead of silently fabricating a measurement.
4. **Action over passive tracking** — the estimate is connected to recovery planning, alarms, check-ins and longitudinal feedback.
5. **Privacy by architecture** — camera processing is on-device and raw facial frames are not retained for cloud sync.
6. **Scientific traceability** — the measurement families used by Somno map to established sleep/fatigue research rather than opaque wellness scores.

## System architecture

<p align="center">
  <img src="docs/system-architecture.svg" width="100%" alt="Somno multimodal system architecture" />
</p>

Somno separates **measurement**, **quality control**, **personalization**, **fusion** and **intervention**. This separation matters: a camera failure does not become a fake fatigue value, a missing signal does not become zero, and recovery/stage-shaped models are kept distinct from measured evidence.

For a component-by-component breakdown, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Built on established fatigue and sleep science

Somno’s scientific claim is deliberately precise: **several of its constituent measurement families are independently validated in the literature; Somno’s complete multimodal SDI and closed-loop decision policy are novel prototype integrations and still require prospective external validation.**

| Scientific foundation | What published research supports | How Somno uses it | Status inside Somno |
|---|---|---|---|
| **Psychomotor Vigilance Task (PVT)** | Reaction-time performance and lapses are sensitive to total and partial sleep deprivation; brief PVT variants have been studied for this purpose. [Basner, Mollicone & Dinges, 2011](https://pubmed.ncbi.nlm.nih.gov/22025811/) | Short reaction-time probe; response speed, lapses, false starts and variability are compared with personal baseline | **Evidence-backed measurement family; Somno’s 9-trial implementation is its own short probe, not a claim of PVT-B equivalence** |
| **Karolinska Sleepiness Scale (KSS)** | KSS has demonstrated relationships with behavioral and EEG indicators of sleepiness. [Kaida et al., 2006](https://pubmed.ncbi.nlm.nih.gov/16679057/) | 1–9 subjective sleepiness signal included alongside objective channels | **Validated scale family** |
| **Ocular closure / PERCLOS research** | Eyelid-closure measures have been validated as indicators of lapses in visual attention in controlled fatigue research. [NHTSA/Dinges et al., 1998](https://rosap.ntl.bts.gov/view/dot/2518) | Closure fraction, eye geometry and related ocular/facial features contribute only when scan quality is adequate | **Scientific basis for ocular fatigue evidence; Somno’s engineered feature combination is not itself a clinical PERCLOS device** |
| **Circadian + homeostatic sleep pressure** | Alertness varies with time awake, circadian phase and sleep inertia; these are established components of fatigue modelling | Provides context for expected alertness and recovery timing | **Model-based context, not directly measured circadian phase** |
| **Sleep loss and athletic performance** | Systematic reviews/meta-analyses report that insufficient sleep can impair multiple aspects of athletic performance and that sleep-extension interventions may benefit performance/recovery. [Gong et al., 2024](https://pubmed.ncbi.nlm.nih.gov/39006249/) · [Bonnar et al., 2018](https://pubmed.ncbi.nlm.nih.gov/29352373/) | Recovery trends and sleep-shortfall awareness can be used as an additional readiness signal by athletes | **Potential wellness/performance-support use case; not a sports-medical clearance tool** |
| **Shift-work fatigue** | Non-standard schedules can restrict recovery and contribute to fatigue and cognitive impairment. [CDC/NIOSH](https://www.cdc.gov/niosh/bulletin/2020/fatigue-work.html) | Longitudinal sleep-shortfall and alertness check-ins can support personal fatigue awareness | **Potential occupational-wellness use case; not a replacement for employer safety policy** |

### What Somno adds

The novelty is not claiming to have invented reaction-time testing, sleepiness scales or ocular fatigue markers. It is the **privacy-first integration of these signals into one personal-reference mobile system** with explicit quality gates, transparent fusion, recovery modelling, native alarm control and longitudinal feedback.

The production SDI uses four evidence channels:

| Channel | Base weight | Interpretation |
|---|---:|---|
| Reaction-time / PVT-style evidence | **0.40** | Highest-weight behavioral signal |
| Facial / ocular evidence | **0.25** | Quality-gated on-device signal |
| KSS subjective sleepiness | **0.15** | Self-reported state |
| Recent sleep debt | **0.20** | Longitudinal sleep-history context |

Missing signals are removed and the remaining weights are renormalized. Objective channels also receive precision adjustments based on the amount/quality of usable evidence. **These weights are transparent engineering parameters, not learned clinical coefficients.**

Conceptually, the score is centered on the user’s personal reference state:

`SDI = clamp(50 + 10 × weighted personal-reference z-score, 0, 100)`

That makes the output data-driven by the user’s own repeated measurements while keeping the scoring logic inspectable.

## Who could Somno help?

Somno was developed in a student context, but the underlying problem—**people systematically misjudging their own fatigue and recovery**—is much broader.

| Use case | Potential value | Important boundary |
|---|---|---|
| **Students & exam preparation** | Detect accumulating sleep loss, compare alertness with personal baseline and plan recovery rather than relying on subjective confidence | Not a substitute for healthy sleep habits or medical care |
| **Athletes & high-performance training** | Add sleep shortfall, reaction-time change and subjective fatigue to day-to-day recovery awareness; useful around heavy training, travel and competition schedules | Not a substitute for sports medicine, coaching or validated readiness systems |
| **Night-shift / late-night workers** | Track repeated short sleep, irregular schedules and within-person alertness changes across difficult work patterns | Not an occupational safety clearance system |
| **Drivers & safety-critical operators** | A pre-task self-check could surface signs of degraded vigilance that a person may otherwise underestimate | **Must never certify fitness to drive or be used as the sole safety decision; a concerning result should favor rest and established safety guidance** |
| **On-call / irregular-schedule professionals** | Provide a compact history of sleep debt, reaction-time change and recovery after disrupted nights | Wellness support only; organizational and clinical fatigue controls remain primary |
| **Fatigue / human-performance research** | Offers a privacy-first mobile architecture for combining repeated multimodal observations with personal baselines | Requires formal study protocols and external validation for research claims |

### Why athletes are especially relevant

Sleep is part of recovery, not merely downtime. Reviews of competitive athletes report relationships between sleep duration and performance, and recent meta-analytic evidence indicates acute sleep deprivation can impair overall athletic performance, including skill control, speed, endurance and explosive power. Somno’s role would be **to make recovery state and cognitive slowing more visible over time**, not to decide whether an athlete is medically cleared to train or compete.

### Why drivers and night workers are relevant—but safety-sensitive

Fatigue is a known safety issue in shift work and driving. Somno’s reaction-time and ocular components are conceptually relevant to vigilance, but the app has **not** been validated as a driver-monitoring or fitness-for-duty instrument. The appropriate use is awareness and escalation: if Somno and/or the user’s own state suggests severe fatigue, the safe action is to rest and follow established workplace/road-safety guidance—not to treat an app score as permission to continue.

## What is actually AI/ML here?

Somno is not an API-wrapper chatbot. Its inference stack runs around the user’s own measurements:

- **Face detection + engineered temporal features:** Google ML Kit supplies face geometry/detection primitives; Somno derives quality-gated ocular/facial features across a short scan.
- **Personal baseline normalization:** current measurements are interpreted relative to the user’s own calibration rather than a population-only score.
- **Multimodal evidence fusion:** PVT, face, KSS and sleep-debt evidence are fused with explicit availability/precision handling.
- **Recovery modelling:** bounded sleep-debt and semi-Markov-inspired recovery priors provide structured context for recovery guidance.
- **Decision layer:** SDI, confidence, recent history and alarm state inform bounded wake/snooze actions.

The implementation intentionally favors **transparent, inspectable inference** over an end-to-end black box because the project does not yet have a sufficiently large synchronized human dataset to justify one.

## Core capabilities

| Area | Implementation |
|---|---|
| Personal calibration | Frozen baseline workflow with explicit recalibration |
| Reaction-time evidence | Short psychomotor-vigilance-style task with lapse/anticipation handling |
| Facial evidence | On-device ML Kit detection + engineered temporal/ocular features + refusal states |
| Subjective evidence | KSS input |
| Sleep history | Bounded leaky sleep-debt model and sleep regularity context |
| Fusion | Transparent SDI with missing-signal renormalization and confidence labels |
| Recovery | Recovery-aware guidance and modelled stage-shaped priors |
| Smart Wake | Custom Kotlin/Expo native alarm module with exact scheduling, snooze and reboot re-arm |
| Offline behavior | Local-first operation; network failure does not break core check-ins |
| Sync | Supabase auth/database, RLS-oriented schema, merge rules and deletion tombstones |
| Accessibility | Labels/roles/states, reduced-motion support, scalable text and accessible controls |
| Data controls | Export and account/data deletion |

## Technology stack

| Layer | Choice | Why |
|---|---|---|
| App | React Native + Expo + TypeScript | Fast cross-platform product iteration with typed shared logic |
| State | Zustand | Small, explicit local state layer |
| Navigation | React Navigation | Production-grade mobile navigation primitives |
| Vision | Expo Camera + ML Kit | On-device face primitives without uploading raw frames |
| Native Android | Kotlin custom Expo module | Alarm scheduling/reboot/full-screen behavior belongs at OS level |
| Backend | Supabase | Auth, Postgres and RLS without a custom server stack |
| Local persistence | AsyncStorage/local stores | Offline-first behavior |
| Release | EAS / Gradle | Reproducible Android packaging |

## Repository map

| Path | Purpose |
|---|---|
| `src/engine/` | SDI, debt, alertness, recovery and stage models |
| `src/lib/` | Face scoring, sync/merge, auth and supporting logic |
| `src/screens/` | Production application screens |
| `src/components/` | Reusable UI and accessibility-aware controls |
| `src/store/` | Application state |
| `modules/smart-wake-alarm/` | Custom Kotlin + Expo native alarm module |
| `plugins/` | Expo config plugins |
| `supabase/` | Schema and backend setup |
| `scripts/` | Focused logic/release test suites |
| `e2e/` | Interaction, journey and visual-flow harnesses |
| `assets/` | Production artwork and ambient UI assets |
| `listing/play/` | Product screenshots used for presentation/store material |
| `legal/` | Privacy/terms/account-deletion text |
| `docs/` | Architecture and competition-facing technical notes |

## Local setup

### Requirements

- Node.js `22.15+` within the supported engine ranges (see `.nvmrc` / `package.json`)
- npm
- Android Studio / Android SDK for device builds

```bash
npm ci
cp .env.example .env
npm start
```

Somno can run locally without Supabase credentials. To enable accounts and sync, add **your own** project values to `.env` and apply `supabase/schema.sql`.

```bash
npm run android
```

The Smart Wake module lives in `modules/smart-wake-alarm/`; Expo prebuild/config-plugin processing generates the Android project around it.

## Verification

```bash
npm run typecheck
npm test
npm run check:release
```

The test harness covers alarm logic, alertness, authentication, sleep debt, facial validity, font scaling/accessibility, PVT behavior, runtime state, recovery/stage modelling, trends, exports, synchronization/merge behavior and release integrity.

A lightweight GitHub Actions workflow runs type checking, logic tests and the release checker for pushes/PRs.

## Privacy and responsible AI

- Raw camera frames are processed transiently and are not intended for cloud storage.
- Low-quality scans produce explicit refusal/error states rather than a believable but unsupported score.
- Missing modalities are omitted and remaining evidence is renormalized.
- Recovery/stage-shaped outputs are **modelled priors**, not sensed sleep stages.
- Production credentials, signing keys and `.env` files are intentionally excluded from this repository.
- Users can operate locally, export their data and request account/data deletion.
- Somno does not present a wellness score as a medical, driving or occupational safety clearance.

## Validation status

**Validated / evidence-supported externally:** the scientific families behind PVT-style vigilance measurement, KSS sleepiness ratings, ocular closure as a fatigue/vigilance marker, and the broader relationship between sleep loss and human performance.

**Verified internally:** deterministic scoring behavior, missing-signal handling, alarm logic, baseline integrity, synchronization/merge behavior, refusal states, exports, accessibility-related logic and release checks through the repository test suite and device-testing cycles.

**Not yet established:** prospective clinical validity, diagnostic accuracy, fitness-to-drive validity, athlete-readiness validity, or external validation of the complete SDI against a gold-standard physiological outcome. These are future-study targets rather than current claims.

## AI YES competition context

This repository is the code-facing evidence package for the AI YES version of Somno. The competition framing emphasizes a **working application**, technical AI design, scientific grounding, application engineering, evaluation/testing, UX/accessibility and responsible AI—not just a research manuscript.

See [`docs/AI_YES.md`](docs/AI_YES.md) for the concise judge-oriented technical summary.

## Project status

This repository represents the **Somno v27 production-source lineage** used for the Android release/capstone build. The project was iterated through repeated design, implementation, audit and device-testing cycles.

## License

No open-source license is granted by this repository unless the project owner adds one explicitly. Third-party dependencies remain subject to their respective licenses.
