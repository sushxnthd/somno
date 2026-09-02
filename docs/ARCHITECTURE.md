# Somno architecture

Somno is designed as a local-first mobile inference system rather than a cloud-dependent AI wrapper.

## 1. Measurement layer

Four evidence families can contribute to the daily state estimate:

- **PVT / reaction-time behavior** — response speed, lapses, anticipations and related short-task statistics.
- **Facial/ocular evidence** — ML Kit face detection followed by Somno's temporal and geometric feature extraction.
- **KSS** — subjective sleepiness supplied by the user.
- **Sleep history** — recent logged sleep relative to an age-appropriate target and the bounded debt/recovery model.

Each modality can be absent. The system is deliberately designed not to require a perfect four-signal check-in.

## 2. Quality and refusal states

The facial pipeline gates scans for usable face presence, lighting, movement and frame quality. A no-face, too-dark or unstable scan is treated as an explicit non-score outcome. Other evidence remains usable.

This is a core responsible-AI design choice: **refusal is better than a falsely precise number**.

## 3. Personal reference

Calibration establishes a personal reference state. Somno then expresses current measurements relative to that reference. Facial calibration freezes after sufficient scans and is changed through explicit recalibration rather than silent drift.

## 4. SDI fusion

The production fusion logic is transparent and inspectable. Base contribution weights are:

- PVT: `0.40`
- Face: `0.25`
- KSS: `0.15`
- Sleep debt: `0.20`

Unavailable evidence is omitted and the remaining contributions are renormalized. Objective modalities can also receive precision adjustment based on available measurement quality.

The resulting SDI is bounded to a 0–100 presentation scale and paired with a confidence label based on available evidence.

## 5. Sleep debt and recovery context

The debt engine is a bounded leaky accumulator rather than a claim of directly measured physiology. The recovery engine uses structured, semi-Markov-inspired state priors to reason about recovery context. These outputs are modelled states—not sensed NREM/REM stages.

## 6. Smart Wake

Alarm behavior is implemented as a custom Android/Kotlin Expo module rather than a JavaScript timer. The native layer covers:

- exact scheduling where permitted
- full-screen alarm presentation
- sound/vibration lifecycle
- snooze and stop behavior
- process-state persistence
- reboot re-arming
- exact-alarm permission handling

The product flow can connect the alarm to a wake check-in and bounded SDI-informed snooze decision. The user retains manual stop control.

## 7. Data architecture

Somno is local-first. Network operations are not allowed to break core measurement or alarm flows.

Optional Supabase sync adds authentication and multi-device persistence. Synchronization uses stable record identities, update timestamps, merge rules and deletion tombstones for alarms. Raw facial images are not a cloud data type; derived numeric features are the intended persisted representation.

## 8. UI and accessibility

The production interface uses reusable components and tokens, with accessibility roles/labels/states, reduced-motion handling, text scaling constraints and larger interaction targets where appropriate. The project does not claim formal WCAG certification.
