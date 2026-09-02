import {
  MIN_NIGHTS_FOR_SRI,
  MIN_PAIRS_FOR_DRIVER,
  regularityWord,
  sleepRegularityIndex,
  strongestDriver,
} from '../src/engine/trends.ts';
import type { CheckInRecord, SleepLogRecord } from '../src/store/types.ts';

/**
 * Tests for the two analyses on the Trends screen.
 *
 * Both of them make a statement about the user in the app's own voice, which is exactly the kind of
 * thing that must refuse to speak when the data will not support it. Most of what follows checks
 * the refusals.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

const dayStr = (i: number) => new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10);

const night = (i: number, bedMin: number, durationMin: number): SleepLogRecord => ({
  id: `sl_${i}`,
  date: dayStr(i),
  bedMin,
  wakeMin: (bedMin + durationMin) % 1440,
  durationMin,
  quality: 'Okay',
  restPct: 70,
  source: 'manual',
});

const morning = (i: number, sdi: number): CheckInRecord => {
  const d = new Date(Date.UTC(2026, 0, 5 + i));
  d.setHours(8, 0, 0, 0);
  return {
    id: `ci_${i}`,
    timestamp: d.getTime(),
    triggerType: 'morning',
    pvt: null,
    face: null,
    kss: 4,
    sdi,
    confidence: 'medium',
    signalsUsed: 2,
  };
};

{
  console.log('sleep regularity');
  // The same night, fourteen times: as regular as a person can be.
  const regular = Array.from({ length: 14 }, (_, i) => night(i, 23 * 60, 450));
  const r = sleepRegularityIndex(regular);
  check('a perfectly regular sleeper scores near 100', r !== null && r.sri >= 95, r);
  check('and is described as such', r !== null && regularityWord(r.sri) === 'Very regular', r && regularityWord(r.sri));

  // Bedtime swinging by four hours every other night.
  const erratic = Array.from({ length: 14 }, (_, i) => night(i, i % 2 ? 21 * 60 : 25 * 60 - 60, 420));
  const e = sleepRegularityIndex(erratic);
  check('an erratic sleeper scores lower', e !== null && r !== null && e.sri < r.sri - 15, { regular: r?.sri, erratic: e?.sri });

  check('too few nights reports nothing at all', sleepRegularityIndex(regular.slice(0, MIN_NIGHTS_FOR_SRI - 1)) === null);
  check('no nights reports nothing', sleepRegularityIndex([]) === null);

  // Regularity is not duration: these nights are short but taken at exactly the same time.
  const shortButRegular = Array.from({ length: 14 }, (_, i) => night(i, 1 * 60, 300));
  const s = sleepRegularityIndex(shortButRegular);
  check('a short but consistent sleeper still scores well', s !== null && s.sri >= 85, s);
}

{
  console.log('what predicts a good morning');
  // Alertness rising with duration, bedtime held constant.
  const logs = Array.from({ length: 14 }, (_, i) => night(i, 23 * 60, 360 + i * 12));
  const checkIns = logs.map((l, i) => morning(i, 45 + i * 3));
  const d = strongestDriver(logs, checkIns);
  check('duration is identified when it is the driver', d?.key === 'duration', d);
  check('with a positive relationship', (d?.r ?? 0) > 0.6, d?.r);
  check('and a sentence that names it', Boolean(d?.sentence.includes('how long you slept')), d?.sentence);

  // Noise: alertness unrelated to anything about the night.
  const flatLogs = Array.from({ length: 14 }, (_, i) => night(i, 23 * 60, 420 + ((i * 37) % 40)));
  const flatCheckIns = flatLogs.map((l, i) => morning(i, 60 + ((i * 53) % 7) - 3));
  check('nothing is claimed when nothing correlates', strongestDriver(flatLogs, flatCheckIns) === null);

  check(
    'too few pairs reports nothing',
    strongestDriver(logs.slice(0, MIN_PAIRS_FOR_DRIVER - 1), checkIns.slice(0, MIN_PAIRS_FOR_DRIVER - 1)) === null
  );
  check('nights with no matching morning are not paired', strongestDriver(logs, []) === null);

  // Evening check-ins describe the end of a day's wear, not the night's result, so they must not
  // be paired with the night before.
  const evenings = logs.map((l, i) => {
    const c = morning(i, 45 + i * 3);
    return { ...c, timestamp: c.timestamp + 12 * 3600_000, triggerType: 'evening' as const };
  });
  check('evening check-ins are excluded', strongestDriver(logs, evenings) === null);
}

{
  console.log('the midnight wrap');
  // Bedtimes either side of midnight must be treated as adjacent, not as 1380 and 30.
  const logs = Array.from({ length: 14 }, (_, i) => night(i, i % 2 ? 23 * 60 + 45 : 15, 420));
  const checkIns = logs.map((l, i) => morning(i, 60));
  // Every morning identical, so no driver should be found — but crucially it must not *crash* or
  // report a spurious one from the wrap.
  check('a wrapping bedtime produces no false driver', strongestDriver(logs, checkIns) === null);
}

console.log(failures === 0 ? '\nAll trends checks passed.' : `\n${failures} trends check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
