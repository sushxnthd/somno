/**
 * Chronotype, derived rather than asked twice.
 *
 * The profile screen already asks when you would wake if the schedule were entirely yours. The
 * gap between that and the alarm you actually set is the chronotype signal *and* the circadian
 * misalignment the recovery engine wants — so it is computed from those two numbers instead of
 * being stored as a separate self-assessment that could disagree with them.
 */

/** Signed minutes the natural wake time sits after (+) or before (−) the alarm, wrapped to ±12h. */
export function chronotypeDriftMin(wakeMin: number, idealWake: number): number {
  return (((idealWake - wakeMin + 720) % 1440) + 1440) % 1440 - 720;
}

/** An hour or more either side is what the engine treats as circadian misalignment. */
export const MISALIGNED_MIN = 60;

export function chronotypeSummary(wakeMin: number, idealWake: number): string {
  const drift = chronotypeDriftMin(wakeMin, idealWake);
  const mins = Math.round(Math.abs(drift) / 15) * 15;
  if (mins < 20) return 'Your alarm already sits at your natural wake time.';
  const direction = drift > 0 ? 'later' : 'earlier';
  const type = drift > 0 ? 'evening type' : 'morning type';
  const strength = mins >= MISALIGNED_MIN ? 'A clear' : 'A slight';
  return `${strength} ${type}. Your natural window sits about ${mins} minutes ${direction} than your alarm.`;
}
