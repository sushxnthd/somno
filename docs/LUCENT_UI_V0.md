# Lucent UI V0

## Product principle

Lucent should feel like an instrument, not a dashboard.

The primary loop is:

1. Open Lucent.
2. Run a five-second scan.
3. See one understandable state result.
4. Learn how that state changes relative to the user's own baseline.

Research mode is secondary and explicit. It exists to collect reference measurements for APST-5 without turning the consumer experience into a study protocol.

## Visual system

- Near-black optical-instrument background.
- Warm white text.
- One high-salience acid-lime signal colour.
- Mint/ice only for secondary physiological channels.
- Very little decorative gradient usage.
- Thin borders and large negative space instead of dense glass cards.
- Instrument Serif for state numerals and high-level statements.
- Figtree for controls, labels and data.

The interface deliberately moves away from Somno's sleep-dashboard grammar.

## Screens in V0

### Today

- Product statement: "Know how ready you are, in five seconds."
- Dominant Lucent Scan card.
- Latest reading slot after a scan.
- Four signal families: vigilance, autonomic response, pulse signal, personal baseline.
- Research mode entry point.

### Active scan

The development build executes the fixed APST-5 seed sequence over exactly five seconds:

- 0.00-0.50 s: neutral calibration.
- 0.50-0.90 s: modest luminance perturbation.
- 0.90-1.60 s: early pupil response.
- 1.60-2.30 s: target displacement / prosaccade.
- 2.30-3.80 s: smooth target tracking.
- 3.80-5.00 s: recovery.

The screen currently:
- requests the front camera,
- primes the existing ML Kit face detector,
- captures real frames through the existing Somno camera pipeline,
- records actual frame count, FPS and capture duration,
- does not output a validated human-state estimate yet.

### Result

The visual result surface is present so the product interaction can be developed before the model is ready.

Any state score currently shown is explicitly marked as prototype UI data.

Actual camera capture statistics are displayed separately.

### History

Reserved for:
- longitudinal personal baseline,
- state trajectory,
- scan-quality history,
- Lucent Gap.

No synthetic history is presented as measurement.

### Lucent / profile

Shows:
- APST-5 research status,
- on-device processing status,
- raw-upload policy,
- research-mode status,
- model connection status.

## Scientific integrity rules

The app must never manufacture a measurement merely because a scan completed.

A completed capture and a successful inference are separate states.

Until validation exists:
- pulse may be blank,
- readiness may be prototype-only,
- uncertainty can be "insufficient signal",
- research mode may collect data without showing a state result.

No five-second claim should be added for glucose, blood pressure, HRV, SpO2, disease status, or similar outputs without independent ground-truth validation.

## Integration sequence

1. Lock the product UI and five-second interaction.
2. Replace the legacy still-photo capture loop with a timestamped stream suitable for APST-5 response dynamics.
3. Persist the exact stimulus schedule and capture timestamps.
4. Add pupil / gaze / face-quality feature extraction.
5. Add Research Mode reference tasks and export.
6. Train passive-5s and active-5s baselines.
7. Connect only validated model heads to the consumer result screen.
8. Add longitudinal personal-prior inference.
9. Replace prototype values with uncertainty-aware real outputs.
