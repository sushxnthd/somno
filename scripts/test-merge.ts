import { ageFromBand, mergeAlarms, mergeRecords, pendingAlarmPush, pendingPush, type SyncData } from '../src/lib/merge.ts';
import type { Alarm, BaselineProfile, CheckInRecord, SleepLogRecord } from '../src/store/types.ts';

/**
 * Tests for the sync merge rules. Run with `npm run test:merge` — plain node, no Supabase project
 * and no device, which is the whole reason mergeRecords is a pure function in its own module.
 *
 * The cases below are the ways sync can silently lose a user's history: a night logged on one
 * phone vanishing when another phone syncs, a restore wiping local records made while offline, a
 * fresh calibration being overwritten by the old one.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

const checkIn = (timestamp: number, sdi: number): CheckInRecord => ({
  id: `ci_${timestamp}`,
  timestamp,
  triggerType: 'manual',
  pvt: null,
  face: null,
  kss: 4,
  sdi,
  confidence: 'medium',
  signalsUsed: 2,
});

const log = (date: string, durationMin: number): SleepLogRecord => ({
  id: `sl_${date}`,
  date,
  bedMin: 1380,
  wakeMin: 420,
  durationMin,
  quality: 'Okay',
  restPct: 60,
  source: 'manual',
});

const profile = (createdAt: number, meanRt: number): BaselineProfile => ({
  pvtMeanRt: meanRt,
  pvtStdRt: 30,
  createdAt,
});

const empty: SyncData = { checkIns: [], sleepLogs: [], baseline: null, faceBaseline: null };

// --- a new phone signing in: everything comes down, nothing is invented -----------------------
{
  const remote: SyncData = {
    checkIns: [checkIn(2000, 70), checkIn(1000, 60)],
    sleepLogs: [log('2026-03-02', 400), log('2026-03-01', 420)],
    baseline: profile(500, 305),
    faceBaseline: null,
  };
  const m = mergeRecords(empty, remote);
  console.log('restore onto an empty device');
  check('every check-in arrives', m.checkIns.length === 2, m.checkIns.length);
  check('check-ins come back in time order', m.checkIns[0].timestamp === 1000 && m.checkIns[1].timestamp === 2000);
  check('every sleep log arrives', m.sleepLogs.length === 2);
  check('sleep logs come back in date order', m.sleepLogs[0].date === '2026-03-01');
  check('the account baseline arrives', m.baseline?.pvtMeanRt === 305);
}

// --- the offline case: local records made without a session must survive the first sync --------
{
  const local: SyncData = { checkIns: [checkIn(3000, 80)], sleepLogs: [log('2026-03-03', 390)], baseline: null, faceBaseline: null };
  const remote: SyncData = { checkIns: [checkIn(1000, 60)], sleepLogs: [log('2026-03-01', 420)], baseline: null, faceBaseline: null };
  const m = mergeRecords(local, remote);
  console.log('local-only history meets an account with different history');
  check('union, not replacement (check-ins)', m.checkIns.length === 2, m.checkIns.map((c) => c.timestamp));
  check('union, not replacement (sleep logs)', m.sleepLogs.length === 2, m.sleepLogs.map((l) => l.date));
  check('the offline check-in is still there', m.checkIns.some((c) => c.timestamp === 3000));
}

// --- idempotence: syncing twice must not duplicate anything ------------------------------------
{
  const both: SyncData = { checkIns: [checkIn(1000, 60)], sleepLogs: [log('2026-03-01', 420)], faceBaseline: null, baseline: profile(1, 300) };
  const once = mergeRecords(both, both);
  const twice = mergeRecords(once, both);
  console.log('syncing the same data repeatedly');
  check('no duplicate check-ins', once.checkIns.length === 1 && twice.checkIns.length === 1);
  check('no duplicate sleep logs', once.sleepLogs.length === 1 && twice.sleepLogs.length === 1);
  check('a second merge changes nothing', JSON.stringify(once) === JSON.stringify(twice));
}

// --- one night, two versions: the device in the user's hand wins --------------------------------
{
  const local: SyncData = { checkIns: [], sleepLogs: [log('2026-03-01', 400)], baseline: null, faceBaseline: null };
  const remote: SyncData = { checkIns: [], sleepLogs: [log('2026-03-01', 300)], baseline: null, faceBaseline: null };
  const m = mergeRecords(local, remote);
  console.log('the same night logged differently on two devices');
  check('kept as one night, not two', m.sleepLogs.length === 1, m.sleepLogs.length);
  check('the local version wins the tie', m.sleepLogs[0].durationMin === 400, m.sleepLogs[0].durationMin);
}

// --- the same instant on both sides is one event, not two --------------------------------------
{
  const local: SyncData = { checkIns: [checkIn(1000, 60)], sleepLogs: [], baseline: null, faceBaseline: null };
  const remote: SyncData = { checkIns: [{ ...checkIn(1000, 60), id: 'some-other-local-id' }], sleepLogs: [], baseline: null, faceBaseline: null };
  const m = mergeRecords(local, remote);
  console.log('the same check-in carrying different local ids');
  check('identity is the timestamp, not the id', m.checkIns.length === 1, m.checkIns.length);
}

// --- baseline: recalibration is meant to supersede ----------------------------------------------
{
  const older = profile(100, 320);
  const newer = profile(900, 290);
  console.log('two baselines');
  check('a newer remote baseline wins', mergeRecords({ ...empty, baseline: older }, { ...empty, baseline: newer }).baseline?.createdAt === 900);
  check('a newer local baseline wins', mergeRecords({ ...empty, baseline: newer }, { ...empty, baseline: older }).baseline?.createdAt === 900);
  check('a local baseline survives an account with none', mergeRecords({ ...empty, baseline: newer }, empty).baseline?.createdAt === 900);
  check('an account baseline fills an empty local one', mergeRecords(empty, { ...empty, baseline: older }).baseline?.createdAt === 100);
  check('no baseline anywhere stays null', mergeRecords(empty, empty).baseline === null);
}

// --- the facial baseline: more scans is the more complete face -----------------------------------
{
  const stat = (n: number) => ({ n, mean: 0.2, m2: 0.01 });
  const face = (n: number, updatedAt: number) => ({
    periorbital: stat(n),
    redness: stat(n),
    eyeContrast: stat(n),
    motion: stat(n),
    updatedAt,
  });
  console.log('two facial baselines');
  check('the better-travelled baseline wins', mergeRecords({ ...empty, faceBaseline: face(3, 900) }, { ...empty, faceBaseline: face(12, 100) }).faceBaseline?.periorbital.n === 12);
  check('and it wins from either side', mergeRecords({ ...empty, faceBaseline: face(12, 100) }, { ...empty, faceBaseline: face(3, 900) }).faceBaseline?.periorbital.n === 12);
  check('an equal count falls back to the newer', mergeRecords({ ...empty, faceBaseline: face(5, 100) }, { ...empty, faceBaseline: face(5, 900) }).faceBaseline?.updatedAt === 900);
  check('an account with none keeps the local one', mergeRecords({ ...empty, faceBaseline: face(4, 100) }, empty).faceBaseline?.periorbital.n === 4);
  check('a new phone adopts the account one', mergeRecords(empty, { ...empty, faceBaseline: face(4, 100) }).faceBaseline?.periorbital.n === 4);
}

// --- the inputs are never mutated ---------------------------------------------------------------
{
  const local: SyncData = { checkIns: [checkIn(1000, 60)], sleepLogs: [log('2026-03-01', 420)], baseline: null, faceBaseline: null };
  const remote: SyncData = { checkIns: [checkIn(2000, 70)], sleepLogs: [log('2026-03-02', 400)], baseline: null, faceBaseline: null };
  mergeRecords(local, remote);
  console.log('merging leaves its arguments alone');
  check('local untouched', local.checkIns.length === 1 && local.sleepLogs.length === 1);
  check('remote untouched', remote.checkIns.length === 1 && remote.sleepLogs.length === 1);
}

// --- what still has to go up ------------------------------------------------------------------
// The push used to send every record on every reconcile. These are the cases that decide whether a
// launch costs one request or a thousand — and, in the last two, whether an edit made offline
// survives at all.
{
  const local: SyncData = {
    checkIns: [checkIn(1000, 60), checkIn(2000, 70)],
    sleepLogs: [log('2026-03-01', 420), log('2026-03-02', 400)],
    baseline: null,
    faceBaseline: null,
  };

  console.log('what still has to go up');
  const inStep = pendingPush(local, local);
  check('a device already in step sends nothing', inStep.checkIns.length === 0 && inStep.sleepLogs.length === 0, inStep);

  const fresh = pendingPush(local, empty);
  check('an empty account gets everything', fresh.checkIns.length === 2 && fresh.sleepLogs.length === 2, fresh);

  const partial = pendingPush(local, { ...empty, checkIns: [checkIn(1000, 60)], sleepLogs: [log('2026-03-01', 420)] });
  check('only the records the account is missing', partial.checkIns.length === 1 && partial.sleepLogs.length === 1, partial);
  check('and they are the right ones', partial.checkIns[0].timestamp === 2000 && partial.sleepLogs[0].date === '2026-03-02', partial);

  // A night can be re-logged and nothing records when, so identity alone is not enough to skip it.
  const edited = pendingPush(local, { ...empty, sleepLogs: [log('2026-03-01', 999), log('2026-03-02', 400)] });
  check('a night edited locally is pushed again', edited.sleepLogs.length === 1 && edited.sleepLogs[0].date === '2026-03-01', edited);

  const unchanged = pendingPush(local, { ...empty, sleepLogs: [log('2026-03-01', 420)] });
  check('an identical night is not', unchanged.sleepLogs.map((l) => l.date).join() === '2026-03-02', unchanged);
}

console.log('\nan account carries everything a new phone needs to score the same way');
{
  /**
   * The restore was complete in the way that is easiest to check and least useful: a year of
   * check-ins came back onto a phone whose debt model ran on a 30-year-old's sleep target, with no
   * stress flag, no sleep window and no alarms. Everything below was already being *uploaded*;
   * none of it was ever read back.
   */
  /**
   * Carried through the *merge*, not merely fetched.
   *
   * `pullAll` read both and `mergeRecords` dropped them on the floor, so `applyRestoredData` — the
   * only thing that could apply them — was handed a payload that had never contained them. The
   * whole restore was inert, and every guard downstream was correct and unreachable. Asserting the
   * field exists on the type proved nothing; these assert the value survives the function.
   */
  const account: SyncData = {
    ...empty,
    profile: {
      ageBand: '25-34',
      gender: 'female',
      medication: null,
      highStress: true,
      bedMin: 1380,
      wakeMin: 420,
      idealWake: 450,
      onboardingComplete: true,
      updatedAt: 0,
    },
    alarms: [{ id: 111, min: 420, days: [true, true, true, true, true, false, false], smart: true, on: true, sound: '', label: 'Weekday' }],
    maxSnoozes: 1,
  };
  const restored = mergeRecords(empty, account);
  check('the profile survives the merge onto a new phone', restored.profile?.bedMin === 1380, restored.profile);
  check('the stress flag survives too', restored.profile?.highStress === true);
  check('the alarms survive the merge', restored.alarms?.length === 1 && restored.alarms[0].min === 420, restored.alarms);
  check('and keep the id the device that made them used', restored.alarms?.[0].id === 111);
  check('the snooze allowance comes back rather than defaulting', restored.maxSnoozes === 1, restored.maxSnoozes);
  // A device with its own answers must not have them replaced by the account's.
  const localFirst = mergeRecords({ ...empty, profile: { ...account.profile!, bedMin: 1300 } }, empty);
  check('a local profile survives an account with none', localFirst.profile?.bedMin === 1300);

  /**
   * The age is a band, never a birthdate — that is what the account stores, and all it needs to
   * store to pick a sleep-need target. A restore can therefore only ever approximate.
   */
  check('a band restores to a defensible midpoint', ageFromBand('25-34') === 30, ageFromBand('25-34'));
  check('every band this build writes can be read back', ['under-18', '18-24', '25-34', '35-44', '45-54', '55-64', '65-plus'].every((b) => ageFromBand(b) != null));
  check('and an unknown band restores nothing rather than guessing', ageFromBand('42-43') === null && ageFromBand(null) === null);
  check('the midpoints are inside their bands', (ageFromBand('45-54') ?? 0) >= 45 && (ageFromBand('45-54') ?? 0) <= 54);
}

console.log('\nand a baseline restores as the same baseline');
{
  /**
   * `pullAll` rebuilt a baseline from `pvt_mean_rt` and `pvt_std_rt` alone. The two `captured_*`
   * fields are the circadian phase the measurement was taken at, and the scoring code treats them
   * as "do not adjust" when absent — so a restored baseline scored the same person differently on a
   * new phone, and blamed the body clock's daily swing on sleep loss.
   */
  const full: BaselineProfile = {
    pvtMeanRt: 290,
    pvtStdRt: 38,
    createdAt: 1_700_000_000_000,
    pvtSpeed: 3.4,
    pvtSessions: 2,
    capturedAtHour: 9.5,
    capturedHoursAwake: 2.25,
  };
  // The merge is what decides which side survives, so a round trip through it must keep every field.
  const restored = mergeRecords(
    { checkIns: [], sleepLogs: [], baseline: null, faceBaseline: null },
    { checkIns: [], sleepLogs: [], baseline: full, faceBaseline: null }
  ).baseline;
  for (const key of ['pvtMeanRt', 'pvtStdRt', 'createdAt', 'pvtSpeed', 'pvtSessions', 'capturedAtHour', 'capturedHoursAwake'] as const) {
    check(`${key} survives the merge`, restored?.[key] === full[key], `${String(restored?.[key])} vs ${String(full[key])}`);
  }
  // An older account has no phase recorded, and absent must stay absent rather than becoming zero —
  // zero is midnight, which is a claim, not a blank.
  const older: BaselineProfile = { pvtMeanRt: 300, pvtStdRt: 40, createdAt: 1_700_000_000_001 };
  const olderBack = mergeRecords(
    { checkIns: [], sleepLogs: [], baseline: null, faceBaseline: null },
    { checkIns: [], sleepLogs: [], baseline: older, faceBaseline: null }
  ).baseline;
  check('a baseline with no phase keeps none', olderBack?.capturedAtHour === undefined, olderBack?.capturedAtHour);
}

console.log('\na corrected check-in reaches the account');
{
  /**
   * An edit keeps the check-in's instant — that is deliberate, so a correction stays one event in
   * the history rather than becoming a second one at a second time. But the push decided what was
   * outstanding by comparing instants alone, so every correction was already "sent": the user
   * re-ran the tap test, watched the score change on the results screen, and the account kept the
   * reading they had just rejected. Forever, on every device but this one.
   */
  const pvt = {
    trialCount: 12,
    meanRt: 300,
    medianRt: 295,
    lapses: 1,
    falseStarts: 0,
    rtCv: 0.15,
    timeOnTaskSlope: 0.1,
    zScore: 0.4,
  };
  const original: CheckInRecord = { ...checkIn(5000, 60), pvt, signalsUsed: 2 };
  const corrected: CheckInRecord = { ...original, pvt: { ...pvt, meanRt: 420, zScore: 2.1 }, sdi: 78 };

  const out = pendingPush({ ...empty, checkIns: [corrected] }, { ...empty, checkIns: [original] });
  check('the corrected check-in is pushed again', out.checkIns.length === 1 && out.checkIns[0].sdi === 78, out.checkIns);

  const same = pendingPush({ ...empty, checkIns: [original] }, { ...empty, checkIns: [original] });
  check('an untouched one is not', same.checkIns.length === 0, same.checkIns);

  // The KSS rating alone is an edit too — it is one of the four SDI inputs.
  const kssOnly = pendingPush(
    { ...empty, checkIns: [{ ...original, kss: 9 }] },
    { ...empty, checkIns: [original] }
  );
  check('a changed KSS counts as a change', kssOnly.checkIns.length === 1, kssOnly.checkIns);

  /**
   * A rerun that fails or is cancelled leaves the check-in with one signal fewer. Compared by
   * instant that was invisible, and even compared by content the *upload* would have left the old
   * child row in place — so the measurement the user removed came back on the next restore.
   */
  const dropped = pendingPush({ ...empty, checkIns: [{ ...original, pvt: null, signalsUsed: 1 }] }, { ...empty, checkIns: [original] });
  check('removing a signal counts as a change', dropped.checkIns.length === 1, dropped.checkIns);
  check('and the pushed record is the one without it', dropped.checkIns[0].pvt === null);
}

console.log('\nthe collections that were uploaded and never read back');
{
  /**
   * Both were pushed from the first build and neither was pulled, so an export on a restored phone
   * produced two empty sections — and the nightly debt snapshots cannot be rebuilt, since each was
   * taken with the model as it stood on the night it covers.
   */
  const debt = (date: string, hours: number) => ({
    date,
    wakeDebtHours: hours,
    nremDebtHours: hours / 3,
    remDebtHours: hours / 3,
    compositeDebtHours: hours,
  });
  const event = (firedAt: number) => ({
    id: `ae_${firedAt}`,
    alarmId: 111,
    firedAt,
    snoozeCount: 1,
    dismissedAt: firedAt + 60_000,
    dismissMethod: 'manual_stop' as const,
    checkInId: null,
  });

  const m = mergeRecords(
    { ...empty, debtRecords: [debt('2026-03-03', 5)], alarmEvents: [event(3000)] },
    { ...empty, debtRecords: [debt('2026-03-01', 2), debt('2026-03-02', 3)], alarmEvents: [event(1000)] }
  );
  check('the account debt snapshots arrive', m.debtRecords?.length === 3, m.debtRecords?.length);
  check('and the local ones are not dropped', m.debtRecords?.some((d) => d.date === '2026-03-03') === true);
  check('snapshots come back in date order', m.debtRecords?.[0].date === '2026-03-01');
  check('alarm firings are unioned too', m.alarmEvents?.length === 2, m.alarmEvents?.length);

  // The same night on both sides is one snapshot, and the device that was there wins.
  const tie = mergeRecords({ ...empty, debtRecords: [debt('2026-03-01', 9)] }, { ...empty, debtRecords: [debt('2026-03-01', 2)] });
  check('one snapshot per night, local winning', tie.debtRecords?.length === 1 && tie.debtRecords[0].wakeDebtHours === 9, tie.debtRecords);
  check('neither side holding any stays null', mergeRecords(empty, empty).debtRecords === null);

  /**
   * The consent trail is the record a data-portability request is most likely to be about, and the
   * two sides name the same grant differently — `cl_<time>` locally, a row uuid remotely — so a
   * merge keyed on the id filed a second copy of every grant on every restore.
   */
  const grant = (id: string, at: number) => ({ id, permissionType: 'camera' as const, grantedAt: at, revokedAt: null });
  const c = mergeRecords(
    { ...empty, consentLog: [grant('cl_1000', 1000)] },
    { ...empty, consentLog: [grant('0f9e-uuid', 1000), grant('1a2b-uuid', 2000)] }
  );
  check('the same grant under two ids is one entry', c.consentLog?.length === 2, c.consentLog);
  check('and the account-only grant arrives', c.consentLog?.some((x) => x.grantedAt === 2000) === true);
}

console.log('\na fresh phone whose signal reads fail, then succeed');
{
  /**
   * The scenario, end to end: a new phone signs in, the `check_ins` read lands, the `pvt_results`
   * and `facial_scan_results` reads do not, and a second sync later succeeds.
   *
   * The join is by id, so a signal row that was not fetched is a miss in the map exactly like one
   * that does not exist — and both produced `pvt: null`. That stripped record entering the store is
   * then, by every rule downstream, a check-in whose measurement the user removed: the push sends
   * it and deletes the `pvt_results` and `facial_scan_results` rows to match. One failed request
   * would have destroyed real measurements in the account, from the phone that had never seen them.
   *
   * What must hold is that the failed pass changes nothing anywhere, and the pass after it restores
   * the check-in with both signals exactly as the account held them.
   */
  const pvt = {
    trialCount: 12,
    meanRt: 288,
    medianRt: 280,
    lapses: 0,
    falseStarts: 1,
    rtCv: 0.12,
    timeOnTaskSlope: 0.03,
    zScore: -0.4,
  };
  const face = {
    brightness: 0.51,
    redness: 0.22,
    periorbital: 0.34,
    eyeContrast: 0.44,
    motion: 0.02,
    stillnessMs: 4200,
    zScore: -0.8,
    provisional: false,
    closureFraction: 0.18,
    ear: 0.27,
    mar: 0.11,
    mouthCornerDrop: 0.04,
    periorbitalLab: 3.1,
    scleralRedness: 0.07,
    skinToneL: 61.2,
    skinToneChroma: 12.4,
  };
  const stored: CheckInRecord = { ...checkIn(9000, 64), pvt, face, signalsUsed: 3 };
  const whole = { checkIns: true, sleepLogs: true, baseline: true, profile: true, alarms: true };

  /**
   * Pass one. `pullAll` refuses to assemble check-ins it could not read whole, so the payload
   * carries none — and says why, which is what stops the push acting on the silence.
   */
  const partialPull: SyncData = {
    ...empty,
    checkIns: [],
    fetched: { ...whole, checkIns: false },
  };
  const afterPartial = mergeRecords(empty, partialPull);
  check('a partial pull restores no check-ins', afterPartial.checkIns.length === 0, afterPartial.checkIns.length);

  const pushAfterPartial = pendingPush({ ...empty, checkIns: afterPartial.checkIns }, partialPull);
  check('and asks for nothing to be pushed back', pushAfterPartial.checkIns.length === 0, pushAfterPartial.checkIns);

  /**
   * The sharpest case: a device that already holds the check-in — from an earlier good sync — meets
   * a pull whose signal reads failed. Compared against the half-read remote side every local record
   * differs, so all of them would be re-sent, and each one would take the delete pass with it.
   */
  const heldLocally: SyncData = { ...empty, checkIns: [stored] };
  const wouldPush = pendingPush(heldLocally, partialPull);
  check('a device that already has the check-in still pushes nothing', wouldPush.checkIns.length === 0, wouldPush.checkIns);

  // Pass two: the same account, read whole this time.
  const goodPull: SyncData = { ...empty, checkIns: [stored], fetched: whole };
  const restored = mergeRecords({ ...empty, checkIns: afterPartial.checkIns }, goodPull);
  check('the next sync restores the check-in', restored.checkIns.length === 1, restored.checkIns.length);
  check('with its reaction-time measurement intact', restored.checkIns[0].pvt?.meanRt === 288, restored.checkIns[0].pvt);
  check('and every facial channel intact', JSON.stringify(restored.checkIns[0].face) === JSON.stringify(face), restored.checkIns[0].face);
  check('and nothing left outstanding to push', pendingPush({ ...empty, checkIns: restored.checkIns }, goodPull).checkIns.length === 0);

  /**
   * And the signature has to notice a change in any of those channels, or a corrected scan is
   * treated as already uploaded and the account keeps the reading the user rejected. Six of them
   * were missing from it.
   */
  for (const [field, value] of [
    ['stillnessMs', 5000],
    ['mouthCornerDrop', 0.4],
    ['periorbitalLab', 9.9],
    ['scleralRedness', 0.5],
    ['skinToneL', 40],
    ['skinToneChroma', 30],
  ] as const) {
    const edited: CheckInRecord = { ...stored, face: { ...face, [field]: value } };
    const out = pendingPush({ ...empty, checkIns: [edited] }, goodPull);
    check(`a corrected ${field} is pushed`, out.checkIns.length === 1, out.checkIns.length);
  }
}

console.log('\ntwo phones: the one in a drawer must not undo the one in use');
{
  /**
   * Device A is the phone the user carries. Device B has been in a drawer since last week, holding
   * the versions of everything that A has since corrected.
   *
   * The merge was local-wins, which is the right rule for one device — a difference between phone
   * and account means the phone knows something the account does not. With two it inverts: B's
   * difference is that it is *behind*, and letting it win meant opening the drawer replaced this
   * morning's correction with last week's reading, and then pushed it back over the account so A
   * picked it up too. `updatedAt` is stamped when a record is written, so the later write wins
   * wherever it was made.
   */
  const LAST_WEEK = 1_700_000_000_000;
  const THIS_MORNING = 1_700_600_000_000;

  // What A wrote, which is what the account now holds.
  const aCheckIn: CheckInRecord = { ...checkIn(5000, 41), sdi: 41, kss: 2, updatedAt: THIS_MORNING };
  const aLog: SleepLogRecord = { ...log('2026-03-01', 465), updatedAt: THIS_MORNING };
  const aProfile = {
    ageBand: '35-44',
    gender: 'female' as const,
    medication: null,
    highStress: true,
    bedMin: 1350,
    wakeMin: 400,
    idealWake: 430,
    onboardingComplete: true,
    updatedAt: THIS_MORNING,
  };

  // What B still holds: the same records, as they were before A corrected them.
  const bCheckIn: CheckInRecord = { ...checkIn(5000, 78), sdi: 78, kss: 8, updatedAt: LAST_WEEK };
  const bLog: SleepLogRecord = { ...log('2026-03-01', 300), updatedAt: LAST_WEEK };
  const bProfile = { ...aProfile, bedMin: 1200, highStress: false, updatedAt: LAST_WEEK };

  const account: SyncData = {
    checkIns: [aCheckIn],
    sleepLogs: [aLog],
    baseline: null,
    faceBaseline: null,
    profile: aProfile,
    // The alarm A deleted is tombstoned on the account rather than simply absent, so B can be told.
    alarms: [],
    deletedAlarmRowIds: ['0f9e8d7c-6b5a-4321-9876-543210fedcba'],
    fetched: { checkIns: true, sleepLogs: true, baseline: true, profile: true, alarms: true },
  };
  const stale: SyncData = {
    checkIns: [bCheckIn],
    sleepLogs: [bLog],
    baseline: null,
    faceBaseline: null,
    profile: bProfile,
  };

  const merged = mergeRecords(stale, account);

  check("A's corrected check-in survives B's sync", merged.checkIns[0].sdi === 41, merged.checkIns[0].sdi);
  check('and it is still one check-in, not two', merged.checkIns.length === 1, merged.checkIns.length);
  check("A's corrected rating survives too", merged.checkIns[0].kss === 2, merged.checkIns[0].kss);
  check("A's re-logged night survives", merged.sleepLogs[0].durationMin === 465, merged.sleepLogs[0].durationMin);
  check("A's profile change survives", merged.profile?.bedMin === 1350, merged.profile?.bedMin);
  check('including the stress flag', merged.profile?.highStress === true, merged.profile?.highStress);
  check('the deleted alarm is not among the account’s alarms', merged.alarms?.length === 0, merged.alarms);
  check('and the tombstone reaches the device', merged.deletedAlarmRowIds?.length === 1, merged.deletedAlarmRowIds);

  /**
   * And B must not send its stale copies back. This is the second half and the damaging one: even
   * with the merge fixed, a push of "everything that differs from the account" would have re-sent
   * exactly the records the account had just corrected.
   */
  const bWouldPush = pendingPush(stale, account);
  check('B pushes back no stale check-in', bWouldPush.checkIns.length === 0, bWouldPush.checkIns);
  check('and no stale night', bWouldPush.sleepLogs.length === 0, bWouldPush.sleepLogs);

  // The merged state is what actually gets pushed, and it is already in step with the account.
  const afterMerge = pendingPush({ ...stale, checkIns: merged.checkIns, sleepLogs: merged.sleepLogs }, account);
  check('and after merging there is nothing left to send', afterMerge.checkIns.length === 0 && afterMerge.sleepLogs.length === 0, afterMerge);

  /**
   * The rule has to run in both directions, or it is just a different flavour of "one side always
   * wins": a change made *on this device* after the account's must still go up.
   */
  const bEditsNow: SyncData = { ...stale, checkIns: [{ ...bCheckIn, sdi: 55, updatedAt: THIS_MORNING + 1 }] };
  const nowWins = mergeRecords(bEditsNow, account);
  check('a change made here after the account’s wins', nowWins.checkIns[0].sdi === 55, nowWins.checkIns[0].sdi);
  check('and is pushed', pendingPush(bEditsNow, account).checkIns.length === 1);
  const bProfileNow = mergeRecords({ ...stale, profile: { ...bProfile, bedMin: 1111, updatedAt: THIS_MORNING + 1 } }, account);
  check('the same for the profile', bProfileNow.profile?.bedMin === 1111, bProfileNow.profile?.bedMin);

  /**
   * Records written before versions existed have none, and must behave as they always did rather
   * than losing to everything: two unversioned copies tie, and local wins a tie.
   */
  const unversioned = mergeRecords(
    { ...empty, checkIns: [checkIn(9000, 30)] },
    { ...empty, checkIns: [checkIn(9000, 90)] }
  );
  check('two unversioned copies still tie to local', unversioned.checkIns[0].sdi === 30, unversioned.checkIns[0].sdi);
  const versusUnversioned = mergeRecords(
    { ...empty, checkIns: [checkIn(9000, 30)] },
    { ...empty, checkIns: [{ ...checkIn(9000, 90), updatedAt: THIS_MORNING }] }
  );
  check('but a versioned account copy beats an unversioned local one', versusUnversioned.checkIns[0].sdi === 90, versusUnversioned.checkIns[0].sdi);
}


console.log('\ntwo phones, one alarm: the edit survives, the deletion wins');
{
  /**
   * Deletion was made safe first. A live edit was not: an alarm was merged as part of a *list*, and
   * the account's list was adopted only onto a phone that had none of its own — so the alarms the
   * two sides shared were never reconciled at all. The phone in a drawer kept 7:00 and pushed it
   * back over the 6:30 someone had set that morning, and nothing anywhere could tell which of the
   * two was the later.
   */
  const LAST_WEEK = 1_700_000_000_000;
  const THIS_MORNING = 1_700_600_000_000;
  const weekdays = [true, true, true, true, true, false, false];
  const alarm = (id: number, min: number, updatedAt?: number, extra: Partial<Alarm> = {}): Alarm => ({
    id,
    min,
    days: weekdays.slice(),
    smart: true,
    on: true,
    sound: '',
    label: 'Weekday',
    ...(updatedAt == null ? null : { updatedAt }),
    ...extra,
  });

  // A moved the alarm to 6:30 this morning. B still holds it at 7:00 from last week.
  const aEdited = alarm(1, 390, THIS_MORNING);
  const bStale = alarm(1, 420, LAST_WEEK);

  const onB = mergeAlarms([bStale], [aEdited], null);
  check("A's edit survives B's sync", onB?.[0].min === 390, onB?.[0].min);
  check('and stays one alarm', onB?.length === 1, onB?.length);

  // The reverse: a change made here after the account's must win, or this is just a different
  // flavour of "one side always wins".
  const bEditedLater = alarm(1, 405, THIS_MORNING + 1);
  const onBLater = mergeAlarms([bEditedLater], [aEdited], null);
  check('a later local edit wins', onBLater?.[0].min === 405, onBLater?.[0].min);

  // Every editable field, not just the time.
  const aToggledOff = alarm(1, 420, THIS_MORNING, { on: false, smart: false, sound: 'chimes', days: [true, false, false, false, false, false, false] });
  const settled = mergeAlarms([bStale], [aToggledOff], null)?.[0];
  check('the on/off switch comes across', settled?.on === false, settled?.on);
  check('so does Smart Wake', settled?.smart === false, settled?.smart);
  check('and the tone', settled?.sound === 'chimes', settled?.sound);
  check('and the days', settled?.days.join() === [true, false, false, false, false, false, false].join(), settled?.days);

  /**
   * A deletion beats a live edit whichever is newer. Reviving an alarm is the failure that wakes
   * somebody at 6am; losing an edit to an alarm that no longer exists costs nothing.
   */
  const deletedOnA = mergeAlarms([alarm(1, 390, THIS_MORNING + 5_000)], [aEdited], [1]);
  check('a tombstone beats even a newer edit', deletedOnA?.length === 0, deletedOnA);
  const deletedRemotelyOnly = mergeAlarms([bStale], [], [1]);
  check('and beats an alarm only this device still holds', deletedRemotelyOnly?.length === 0, deletedRemotelyOnly);

  /** Alarms are settled one at a time, so one conflict cannot disturb the others. */
  const many = mergeAlarms(
    [alarm(1, 420, LAST_WEEK), alarm(2, 480, THIS_MORNING), alarm(3, 300, LAST_WEEK)],
    [alarm(1, 390, THIS_MORNING), alarm(2, 500, LAST_WEEK), alarm(3, 999, LAST_WEEK)],
    [3]
  );
  check('the conflicted alarm takes the newer version', many?.find((a) => a.id === 1)?.min === 390);
  check('the locally-newer one is left alone', many?.find((a) => a.id === 2)?.min === 480);
  check('the deleted one is gone', !many?.some((a) => a.id === 3), many);
  check('and nothing else moved', many?.length === 2, many);

  /**
   * Legacy behaviour, unchanged: a phone with no alarms takes the account's, and an unversioned
   * account row never overwrites one somebody has actually edited.
   */
  check('a phone with none takes the account\u2019s set', mergeAlarms([], [alarm(7, 420)], null)?.length === 1);
  check('and a phone with alarms keeps ones the account never had', mergeAlarms([alarm(9, 100, THIS_MORNING)], [], null)?.length === 1);
  const legacyRemote = mergeAlarms([alarm(1, 390, THIS_MORNING)], [alarm(1, 420)], null);
  check('an unversioned account row loses to a real edit', legacyRemote?.[0].min === 390, legacyRemote?.[0].min);
  const bothLegacy = mergeAlarms([alarm(1, 390)], [alarm(1, 420)], null);
  check('two unversioned copies keep the local one', bothLegacy?.[0].min === 390, bothLegacy?.[0].min);
  check('neither side holding any stays null', mergeAlarms(null, null, null) === null);
  // The account row id is kept through a merge, or a later deletion cannot name the row.
  const keepsRow = mergeAlarms([alarm(1, 420, LAST_WEEK, { remoteId: 'row-uuid' })], [alarm(1, 390, THIS_MORNING)], null);
  check('the account row id survives being superseded', keepsRow?.[0].remoteId === 'row-uuid', keepsRow?.[0]);

  /** And the push must not send a copy the account already has a newer version of. */
  const versions = new Map([[1, THIS_MORNING]]);
  check('a stale alarm is held back', pendingAlarmPush([bStale], versions).length === 0);
  check('a newer one goes up', pendingAlarmPush([alarm(1, 405, THIS_MORNING + 1)], versions).length === 1);
  check('and one the account has never seen goes up', pendingAlarmPush([alarm(4, 400, LAST_WEEK)], versions).length === 1);

  /** Through the whole payload, which is how sync actually calls it. */
  const whole = mergeRecords(
    { ...empty, alarms: [bStale] },
    { ...empty, alarms: [aEdited], deletedAlarmIds: [] }
  );
  check('and the same holds through mergeRecords', whole.alarms?.[0].min === 390, whole.alarms);
}

console.log(failures === 0 ? '\nAll merge checks passed.' : `\n${failures} merge check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
