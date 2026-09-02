# Somno

**Somno** is a privacy-first Android wellness application developed as a CBSE Class XII Artificial Intelligence capstone. It estimates sleep-loss-related impairment relative to a user's personal baseline using a short reaction-time task, on-device facial/ocular features, subjective sleepiness, and recent sleep history, then converts that evidence into recovery guidance and a guarded wake/snooze workflow.

> Somno is a wellness/educational project, not a medical device. It does not diagnose sleep disorders, certify fitness to drive, or perform real-time polysomnographic sleep-stage detection.

## Why Somno exists

Hours slept alone do not tell a person how impaired they are right now. Somno was designed around three principles:

1. **Personal reference over population thresholds** — compare today's measurements with the same user's alert baseline.
2. **Multiple weak signals over one fragile signal** — combine behavioral, facial, subjective, and sleep-history evidence.
3. **Actionable output over passive tracking** — connect the estimate to recovery planning, alarms, check-ins, and trends.

## Core features

- Personal baseline calibration
- Brief psychomotor-vigilance / reaction-time assessment
- On-device facial and ocular fatigue features
- Karolinska Sleepiness Scale (KSS) input
- Sleep-debt and recovery-state modelling
- Sleep Deprivation Index (SDI) with confidence/availability handling
- Native Android alarms and Smart Wake flow
- Alarm → wake check-in → SDI-informed snooze logic
- Trends, sleep regularity and strongest-driver insights
- Local-first operation with optional Supabase sync
- Email/password and Google authentication
- Data export and account deletion
- Accessibility-aware UI and graceful missing-signal states
- No persistent storage of raw facial imagery

## Architecture

```text
Camera / PVT / KSS / sleep log
            │
            ▼
     quality + validity gates
            │
            ▼
      personal normalization
            │
            ▼
       multimodal fusion
            │
      ┌─────┴─────────┐
      ▼               ▼
 SDI + confidence   sleep debt / recovery state
      │               │
      └──────┬────────┘
             ▼
   recovery + guarded wake actions
             │
             ▼
      history / trends / sync
```

## Production stack

- **React Native + Expo + TypeScript** — application layer
- **Zustand** — local application state
- **React Navigation** — screen/navigation graph
- **Expo Camera + Google ML Kit** — on-device camera/face primitives
- **Custom Expo/Kotlin native module** — Android alarm and wake behavior
- **Supabase** — optional authentication, database and multi-device sync
- **AsyncStorage/local state** — offline-first persistence
- **Google Sign-In** — federated authentication
- **Gradle / EAS** — Android packaging and release builds

## Repository layout

```text
src/                 application screens, state, AI/wellness logic
modules/             custom native modules (including Smart Wake)
plugins/             Expo config plugins
supabase/            schema and backend setup notes
scripts/             model/logic/release test suites
e2e/                 interaction and visual-flow checks
assets/               application artwork/icons
legal/                privacy, terms, account-deletion text
listing/              Play Store listing material
```

## Setup

### Requirements

- Node.js version specified in `.nvmrc`
- npm
- Expo / Android development environment for device builds

### Install

```bash
npm ci
cp .env.example .env
npm start
```

Somno can operate locally without Supabase credentials. To enable real accounts and sync, populate `.env` with your own project values and apply `supabase/schema.sql` to your Supabase project. **Never commit `.env`, a Supabase service-role key, OAuth client secrets, or Android signing material.**

### Android

```bash
npm run android
```

The native Smart Wake module is included under `modules/`. Expo prebuild/config-plugin processing generates the platform project as needed.

## Tests

```bash
npm test
```

The repository includes focused suites for alarms, alertness, authentication, sleep debt, facial validity, accessibility/font scaling, PVT behavior, runtime state, recovery/stage modelling, trends, exports, merging and release integrity.

## Privacy and responsible AI

- Raw camera frames are processed transiently and are not intended for cloud storage.
- Missing or low-quality evidence reduces confidence or disables that modality rather than fabricating a neutral measurement.
- Recovery/stage-shaped states are model outputs, **not sensed sleep stages**.
- Somno deliberately avoids medical-diagnostic and driving-safety claims.
- Users can operate locally, export their data and delete their account/data.

## Capstone context

Somno was built through repeated design, implementation, audit and device-testing iterations as a CBSE Artificial Intelligence (843) Class XII capstone. The project covers the full AI Project Cycle: problem scoping, data strategy, modelling, evaluation, responsible-AI safeguards, product design, deployment and reflection.

## Status

This repository represents the Somno v27 production-source lineage used for the capstone/release build. Public configuration values belong in `.env.example`; production credentials and signing assets are intentionally excluded.

## License

No open-source license is granted by this repository unless a separate license is added by the project owner. Third-party dependencies remain under their respective licenses.
