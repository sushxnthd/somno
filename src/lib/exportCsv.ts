import type { CheckInRecord, SleepLogRecord } from '../store/types';

/**
 * The CSV half of an export.
 *
 * Split out of exportData.ts because that module imports `react-native` and the store, which makes
 * it unloadable outside a bundler — and these functions are the part most worth testing directly. A
 * quoting bug here shifts every column after it in somebody else's spreadsheet, silently, in a file
 * the app has already reported as exported successfully.
 */

/** RFC 4180: quote anything containing a comma, quote or newline, and double any inner quotes. */
function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csvRows = (rows: unknown[][]): string => rows.map((r) => r.map(csvCell).join(',')).join('\n');

export function checkInsCsv(checkIns: CheckInRecord[]): string {
  return csvRows([
    [
      'timestamp_iso',
      'trigger_type',
      'sdi',
      'confidence',
      'signals_used',
      'kss',
      'pvt_trials',
      'pvt_mean_rt_ms',
      'pvt_median_rt_ms',
      'pvt_lapses',
      'pvt_false_starts',
      'pvt_rt_cv',
      'pvt_time_on_task_slope',
      'pvt_z',
      'face_brightness',
      'face_redness',
      'face_periorbital',
      'face_eye_contrast',
      'face_motion',
      'face_z',
      'face_provisional',
    ],
    ...checkIns.map((c) => [
      new Date(c.timestamp).toISOString(),
      c.triggerType,
      c.sdi,
      c.confidence,
      c.signalsUsed,
      c.kss ?? '',
      c.pvt?.trialCount ?? '',
      c.pvt?.meanRt ?? '',
      c.pvt?.medianRt ?? '',
      c.pvt?.lapses ?? '',
      c.pvt?.falseStarts ?? '',
      c.pvt?.rtCv ?? '',
      c.pvt?.timeOnTaskSlope ?? '',
      c.pvt?.zScore ?? '',
      c.face?.brightness ?? '',
      c.face?.redness ?? '',
      c.face?.periorbital ?? '',
      c.face?.eyeContrast ?? '',
      c.face?.motion ?? '',
      c.face?.zScore ?? '',
      c.face ? String(c.face.provisional) : '',
    ]),
  ]);
}

export function sleepLogsCsv(logs: SleepLogRecord[]): string {
  return csvRows([
    ['date', 'bedtime_min', 'waketime_min', 'duration_min', 'quality', 'rest_pct', 'source'],
    ...logs.map((l) => [l.date, l.bedMin, l.wakeMin, l.durationMin, l.quality, l.restPct, l.source]),
  ]);
}

