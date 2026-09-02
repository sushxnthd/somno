# Somno architecture

Somno is a local-first mobile inference system that combines four evidence streams into a personalized fatigue and recovery state.

## 1. Measurement layer

Four evidence families contribute to the daily state estimate:

- **PVT / reaction-time behavior**: response speed, lapses, anticipations and short-task variability.
- **Facial and ocular evidence**: ML Kit face detection followed by Somno's temporal, geometric and photometric feature extraction.
- **KSS**: subjective sleepiness supplied by the user on a 1 to 9 scale.
- **Sleep history**: recent logged sleep, regularity, sleep shortfall and longitudinal debt context.

Each modality is handled independently before fusion, allowing the system to preserve useful evidence even when another stream is unavailable.

## 2. Quality layer

The facial pipeline evaluates face presence, lighting, movement, frame stability and feature availability before producing a score. Signal quality becomes part of the inference path rather than an afterthought.

This quality layer also tracks which modalities are available so the fusion engine can adjust contributions dynamically.

## 3. Personal reference

Calibration establishes a personal reference state. Current observations are then interpreted as changes relative to that reference.

The baseline workflow is intentionally stable. Recalibration is explicit, which prevents silent drift in the user's reference state and keeps longitudinal comparisons meaningful.

## 4. SDI fusion

The production fusion logic is transparent and inspectable. Base contribution weights are:

- PVT: `0.40`
- Face: `0.25`
- KSS: `0.15`
- Sleep debt: `0.20`

Unavailable evidence is omitted and the remaining contributions are renormalized. Objective modalities also receive precision adjustment based on usable measurement quality.

The resulting SDI is bounded to a 0 to 100 presentation scale and paired with signal-count and confidence information.

Conceptually:

`SDI = clamp(50 + 10 × weighted personal-reference z-score, 0, 100)`

## 5. Sleep debt and recovery context

The debt engine uses a bounded leaky accumulator to represent recent sleep shortfall and gradual recovery over time.

The recovery engine combines debt, time awake, circadian structure, sleep inertia and semi-Markov-inspired recovery-state priors. Together these provide context for recovery guidance and timing decisions.

## 6. Smart Wake

Alarm behavior is implemented as a custom Android and Kotlin Expo module. The native layer covers:

- exact scheduling where permitted
- full-screen alarm presentation
- sound and vibration lifecycle
- snooze and stop behavior
- process-state persistence
- reboot re-arming
- exact-alarm permission handling

The wake flow connects the native alarm to a fast check-in and SDI-informed snooze logic, while preserving manual stop control.

## 7. Data architecture

Somno is local-first. Core measurement, history and alarm flows remain available independently of network state.

Optional Supabase sync adds authentication and multi-device persistence. Synchronization uses stable record identities, timestamps, merge rules and deletion tombstones. Facial processing remains privacy-first by persisting derived numerical features rather than raw face images.

## 8. UI and accessibility

The production interface uses reusable components and design tokens, accessibility roles and labels, reduced-motion handling, text-scaling support and larger interaction targets where appropriate.
