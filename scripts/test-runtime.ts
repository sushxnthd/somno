import type { AlarmEventRecord } from '../src/store/types.ts';
import { readFileSync } from 'node:fs';
import { nodeFlags, nodeSupported, SUPPORTED_NODE } from './run-ts.mjs';
import {
  MAX_NATIVE_ALARM_ID,
  alarmIdFromNative,
  nativeAlarmId,
  nativeAlarmIds,
  nativeIdFor,
} from '../src/lib/alarmPlan.ts';
import { mergeRecords, type SyncData } from '../src/lib/merge.ts';

/**
 * Runtime-lifecycle regressions: the rules that decide what happens between screens, across a
 * process death, and while an abandoned async job is still running.
 *
 * These are modelled rather than driven through the store, and that is deliberate. Each rule below
 * is a decision — is this the same alarm session, is this scan still current, is this commit an edit
 * — and a decision can be stated and checked exactly. Driving the real store would need a React
 * runtime, AsyncStorage and a camera, and would test the wiring rather than the rule. The wiring is
 * covered by e2e/journeys.cjs; what is here is what the wiring is supposed to implement.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

// ---------------------------------------------------------------------------
// The rules, as the store implements them.
// ---------------------------------------------------------------------------

/** beginAlarmSession's window for treating an open event as the same morning. */
const SESSION_WINDOW_MS = 6 * 60 * 60 * 1000;

/** The event a firing belongs to: an open one for the same alarm, recent enough, or none. */
function sessionFor(events: AlarmEventRecord[], alarmId: number, now: number): AlarmEventRecord | null {
  const found = events.find((e) => e.alarmId === alarmId && e.dismissedAt == null && now - e.firedAt < SESSION_WINDOW_MS);
  return found ?? null;
}

/** Whether a scan that started at `generation` may still write its result. */
const scanStillCurrent = (startedAt: number, current: number) => startedAt === current;

/** Whether a commit updates an existing record or appends a new one. */
const isEdit = (activeCheckInId: string | null, existing: { id: string }[]) =>
  Boolean(activeCheckInId && existing.some((c) => c.id === activeCheckInId));

const event = (over: Partial<AlarmEventRecord> = {}): AlarmEventRecord => ({
  id: 'ae_1',
  alarmId: 1,
  firedAt: 1_000_000,
  snoozeCount: 0,
  dismissedAt: null,
  dismissMethod: null,
  checkInId: null,
  ...over,
});

// ---------------------------------------------------------------------------
console.log('an abandoned scan cannot write into a newer check-in');
{
  /**
   * `captureFrames` is a six-second loop of native calls, not an abortable request — leaving the
   * screen does not stop it, and dropping the store's reference to the promise does not either. The
   * continuation still ran and still called setFaceMetrics, into whatever check-in was open by then.
   */
  const started = 4;
  check('a scan that nothing interrupted may write', scanStillCurrent(started, 4));
  check('one the user walked out of may not', !scanStillCurrent(started, 5));
  check('and neither may one two check-ins ago', !scanStillCurrent(started, 7));
  // The guard runs twice — after capture and after analysis — because both take real time.
  const generationsDuring = [4, 4, 5];
  check(
    'leaving during the measurement pass is caught too',
    generationsDuring.some((g) => !scanStillCurrent(started, g)),
    generationsDuring
  );
}

console.log('\na snooze re-firing continues its session; a new morning starts one');
{
  const now = 2_000_000;
  const open = event({ firedAt: now - 8 * 60 * 1000, snoozeCount: 2 });

  const continued = sessionFor([open], 1, now);
  check('an open event for the same alarm is the same session', continued?.id === open.id, continued);
  check('so the snooze count carries', continued?.snoozeCount === 2, continued?.snoozeCount);

  /**
   * The bug: this always appended a fresh event with snoozeCount 0 and reset `snoozes`. Since the
   * app is usually backgrounded or killed between setting a snooze and it going off, that was the
   * normal path — and the hard cap the UI promises could be bypassed forever by snoozing, letting
   * it re-fire, and snoozing again.
   */
  const dismissed = event({ dismissedAt: now - 60_000, snoozeCount: 3 });
  check('a dismissed event is not resumed', sessionFor([dismissed], 1, now) === null);

  const yesterday = event({ firedAt: now - 20 * 60 * 60 * 1000, snoozeCount: 3 });
  check('nor is one left open from yesterday', sessionFor([yesterday], 1, now) === null, yesterday.firedAt);

  const otherAlarm = event({ alarmId: 2, firedAt: now - 60_000, snoozeCount: 2 });
  check('nor one belonging to a different alarm', sessionFor([otherAlarm], 1, now) === null);
}

console.log('\nthe snooze cap holds across a process restart');
{
  const MAX = 3;
  // Persisted state is what survives; the count lives on the event as well as in `snoozes`.
  let events = [event({ snoozeCount: 0 })];
  const snooze = () => {
    events = events.map((e) => (e.dismissedAt == null ? { ...e, snoozeCount: e.snoozeCount + 1 } : e));
  };

  snooze();
  snooze();
  // Process death here: the store rehydrates, and beginAlarmSession resumes the open event.
  const afterRestart = sessionFor(events, 1, events[0].firedAt + 10 * 60 * 1000);
  check('the count survives the restart', afterRestart?.snoozeCount === 2, afterRestart?.snoozeCount);
  check('and the cap is not yet reached', (afterRestart?.snoozeCount ?? 0) < MAX);

  snooze();
  const atCap = sessionFor(events, 1, events[0].firedAt + 20 * 60 * 1000);
  check('a third snooze reaches the cap', atCap?.snoozeCount === MAX, atCap?.snoozeCount);
  check('and no further snooze is allowed', !((atCap?.snoozeCount ?? 0) < MAX));
}

console.log('\nmultiple alarms keep their own sessions');
{
  const now = 3_000_000;
  const events = [
    event({ id: 'ae_a', alarmId: 1, firedAt: now - 10 * 60 * 1000, snoozeCount: 2 }),
    event({ id: 'ae_b', alarmId: 2, firedAt: now - 5 * 60 * 1000, snoozeCount: 0 }),
  ];
  check('the 6:40 resumes its own count', sessionFor(events, 1, now)?.snoozeCount === 2);
  check('and the 7:15 resumes its own', sessionFor(events, 2, now)?.snoozeCount === 0);
  check('an alarm with no event starts fresh', sessionFor(events, 3, now) === null);

  /**
   * Two alarms set to the same minute is the case the old minute-matching lookup could never get
   * right: it searched for an enabled alarm whose time matched the one on screen and took the
   * first. With the real id carried from the intent, identity does not depend on the clock at all.
   */
  const sameMinute = [
    event({ id: 'ae_c', alarmId: 10, firedAt: now - 60_000, snoozeCount: 1 }),
    event({ id: 'ae_d', alarmId: 11, firedAt: now - 60_000, snoozeCount: 0 }),
  ];
  check('two alarms at the same time stay distinct', sessionFor(sameMinute, 11, now)?.id === 'ae_d');
}

console.log('\nre-running a signal edits the check-in rather than adding one');
{
  const existing = [{ id: 'ci_1' }, { id: 'ci_2' }];
  check('a commit with no active record appends', !isEdit(null, existing));
  check('a commit with the active record updates', isEdit('ci_2', existing));
  // After resetCheckInSignals the id is cleared, which is what makes the *next* check-in new.
  check('a new check-in after a reset appends', !isEdit(null, existing));
  // An id that no longer exists — a deleted record — must not silently update nothing.
  check('a stale id falls back to appending', !isEdit('ci_gone', existing));
}

console.log('\nthe reaction-time baseline is refined once per check-in');
{
  // refineBaseline is applied on first commit only. Re-rating does not re-measure the tap test, so
  // folding the same trials in again would count one measurement twice — into the very baseline
  // every later check-in is scored against.
  const commits = [
    { isEdit: false, trials: [300, 310, 295] },
    { isEdit: true, trials: [300, 310, 295] },
    { isEdit: true, trials: [300, 310, 295] },
  ];
  const refinements = commits.filter((c) => !c.isEdit).length;
  check('three commits of one check-in refine once', refinements === 1, refinements);
}

console.log('\nthe TypeScript launcher agrees with the Node it is given');
{
  /**
   * The supported range is the *intersection* of two requirements, and the stricter one wins.
   *
   * React Native 0.86 and Metro declare `^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25`, so nothing below
   * 22.13 can bundle the app; these scripts need type stripping, which Node 20 does not have at all.
   * `engines` used to say `>=22.6` — a number taken from the stripping requirement alone, which
   * quietly claimed support for versions Metro refuses to start on.
   */
  check('the floor is where Metro starts, not where stripping starts', nodeSupported('22.13.0') && !nodeSupported('22.12.0'));
  check('the Node 20 branch React Native allows is not one this repo has', !nodeSupported('20.19.4'));
  check('24 is supported from 24.3', nodeSupported('24.3.0') && !nodeSupported('24.2.0'));
  check('and everything from 25 up', nodeSupported('25.0.0') && nodeSupported('26.4.1'));

  check('modern node needs no strip flag', !(nodeFlags('24.3.0') ?? []).includes('--experimental-strip-types'));
  check('22.18 needs none either', !(nodeFlags('22.18.0') ?? []).includes('--experimental-strip-types'));
  check('22.13 through 22.17 does', (nodeFlags('22.13.0') ?? []).includes('--experimental-strip-types'));
  check('an unsupported version is refused rather than mis-flagged', nodeFlags('22.12.0') === null && nodeFlags('20.19.4') === null);
  check('every supported version quietens the warning', (nodeFlags('22.13.0') ?? []).includes('--no-warnings'));

  // package.json and the launcher have to say the same thing, or one of them is decoration.
  const engines = JSON.parse(readFileSync('package.json', 'utf8')).engines?.node;
  check('package.json declares the same range', engines === SUPPORTED_NODE, `${engines} vs ${SUPPORTED_NODE}`);
  // .nvmrc has to name a version inside it.
  const nvmrc = readFileSync('.nvmrc', 'utf8').trim();
  check('and .nvmrc pins a major inside it', nodeSupported(`${nvmrc}.99.99`), nvmrc);
}

console.log('\nalarm ids survive the crossing into Kotlin');
{
  /**
   * The native module takes an `Int` for every alarm entry point, because that is what a
   * PendingIntent request code is. JS ids are `Date.now()` — about 1.76e12, some 800 times past
   * 2^31. Every alarm this app ever created was handing Kotlin a number it cannot hold, and
   * depending on the converter that either throws or truncates. A truncated request code addresses
   * a *different* PendingIntent, so scheduling writes one alarm and cancelling addresses another.
   */
  const realistic = [1_700_000_000_000, 1_760_000_123_456, Date.now(), Date.now() + 1, Date.now() + 999];
  for (const id of realistic) {
    const n = nativeAlarmId(id);
    check(`${id} folds into range`, n > 0 && n <= MAX_NATIVE_ALARM_ID && Number.isInteger(n), n);
  }
  check('the raw ids really were out of range', realistic.every((id) => id > MAX_NATIVE_ALARM_ID));

  // Stability is not optional: the native side stores each schedule under this id and re-arms it
  // after a reboot with no help from JS. A mapping that changed between launches would orphan them.
  check('the same id folds the same way twice', nativeAlarmId(1_760_000_123_456) === nativeAlarmId(1_760_000_123_456));
  check('and never to zero, which is the native no-alarm sentinel', nativeAlarmId(0) !== 0);
  check('negative or fractional ids still land in range', nativeAlarmId(-5.7) > 0 && nativeAlarmId(-5.7) <= MAX_NATIVE_ALARM_ID);

  // Adjacent ids are the common case — two alarms made in one sitting differ by milliseconds — and
  // are exactly what a truncation would keep adjacent and a hash must not.
  const base = 1_760_000_000_000;
  const adjacent = new Set([0, 1, 2, 3, 4].map((d) => nativeAlarmId(base + d)));
  check('ids created moments apart do not collide', adjacent.size === 5, [...adjacent]);

  // And the wrap a plain `| 0` would have: 2^32 ms apart is ~49 days.
  check('ids 2^32 ms apart do not collide either', nativeAlarmId(base) !== nativeAlarmId(base + 4294967296));
}

console.log('\nthe native id map is injective and reversible');
{
  const alarms = [{ id: 1_760_000_000_000 }, { id: 1_760_000_000_001 }, { id: 1_700_000_000_000 }];
  const map = nativeAlarmIds(alarms);
  check('every alarm gets an id', map.size === alarms.length);
  check('all distinct', new Set(map.values()).size === alarms.length, [...map.values()]);
  check('all in range', [...map.values()].every((n) => n > 0 && n <= MAX_NATIVE_ALARM_ID));

  // Order independence: the array is reordered whenever an alarm is edited, and the mapping must
  // not move with it or a reconcile would cancel and re-create every alarm.
  const reordered = nativeAlarmIds([...alarms].reverse());
  check('the mapping does not depend on array order', alarms.every((a) => map.get(a.id) === reordered.get(a.id)));

  // Reverse lookup is how a firing gets attributed to the right alarm.
  for (const a of alarms) {
    check(`native id maps back to alarm ${a.id}`, alarmIdFromNative(alarms, map.get(a.id) as number) === a.id);
  }
  check('an unknown native id resolves to nothing', alarmIdFromNative(alarms, 12345) === null);

  // Forced collision: two ids that hash to the same slot must still come out distinct.
  const collide = [{ id: 100 }, { id: 100 }];
  const collided = nativeAlarmIds(collide);
  check('a duplicated id does not produce two entries', collided.size === 1, collided.size);
}

console.log('\ncancelling a snooze must not delete the alarm');
{
  /**
   * A model of the native store, because the real one is Kotlin. `cancel` erases the schedule —
   * correct when the user deletes an alarm — and `cancelSnoozeAndRestore` used to call it, so
   * `rearmAfterFiring` then read a minute of -1, `nextFireAfter` returned null, and it returned
   * without arming. Stopping a snoozed alarm deleted that alarm permanently.
   */
  type Native = { schedules: Map<number, { minute: number; days: string }>; armed: Map<number, string> };
  const native = (): Native => ({
    schedules: new Map([[1, { minute: 420, days: '1111100' }]]),
    armed: new Map([[1, 'recurring']]),
  });
  const rearmAfterFiring = (n: Native, id: number) => {
    const sched = n.schedules.get(id);
    if (!sched) return; // nextFireAfter returns null with no stored schedule
    n.armed.set(id, 'recurring');
  };

  // The old behaviour, kept as the thing being asserted against.
  const broken = native();
  broken.armed.set(1, 'snooze');
  broken.schedules.delete(1);
  broken.armed.delete(1);
  rearmAfterFiring(broken, 1);
  check('the old cancel-then-restore left nothing armed', !broken.armed.has(1));
  check('and lost the schedule for good', !broken.schedules.has(1));

  // The fix: cancel the pending intent only, leaving the schedule to restore from.
  const fixed = native();
  fixed.armed.set(1, 'snooze');
  fixed.armed.delete(1);
  rearmAfterFiring(fixed, 1);
  check('cancelling only the pending intent keeps the schedule', fixed.schedules.has(1));
  check('and the recurring alarm comes back', fixed.armed.get(1) === 'recurring', fixed.armed.get(1));

  // Cancellation isolation: taking one alarm down must not disturb another.
  const two = native();
  two.schedules.set(2, { minute: 480, days: '0000011' });
  two.armed.set(2, 'recurring');
  two.armed.delete(1);
  rearmAfterFiring(two, 1);
  check('the other alarm is untouched', two.armed.get(2) === 'recurring' && two.schedules.has(2));
}

console.log('\nevery native call uses the same resolved id');
{
  /**
   * Scheduling resolves collisions across the whole set; snooze, stop and the wipe used to fold
   * each id on its own. Where the set-wide mapping had moved an id, the lone fold addressed the one
   * the scheduler did *not* use — arming a PendingIntent nothing could find, or cancelling an alarm
   * belonging to somebody else's row.
   */
  const alarms = [{ id: 1_760_000_000_000 }, { id: 1_760_000_000_001 }, { id: 1_700_000_000_000 }];
  const scheduled = nativeAlarmIds(alarms);
  for (const a of alarms) {
    check(`alarm ${a.id} resolves the same for every caller`, nativeIdFor(alarms, a.id) === scheduled.get(a.id));
  }
  // An alarm not in the set still yields something in range rather than throwing.
  const orphan = nativeIdFor(alarms, 1_234_567_890_123);
  check('an unknown alarm still folds into range', orphan > 0 && orphan <= MAX_NATIVE_ALARM_ID, orphan);

  // The wipe path: every id it sends must be one the scheduler would have used.
  const wipeIds = alarms.map((a) => nativeAlarmIds(alarms).get(a.id) as number);
  check('the wipe cancels exactly the scheduled ids', wipeIds.every((n) => [...scheduled.values()].includes(n)));
  check('and every one fits an Int', wipeIds.every((n) => n > 0 && n <= MAX_NATIVE_ALARM_ID), wipeIds);
  check('while the raw ids would not have', alarms.every((a) => a.id > MAX_NATIVE_ALARM_ID));
}

console.log('\nsigning into a different account does not inherit the last one');
{
  /**
   * The rule `claimDataFor` implements. Without it, signing into account B on a phone last used by
   * account A merged A's check-ins into the local store and then pushed them up into B — one
   * person's health history copied into another's on nothing more than a shared handset.
   */
  const claim = (owner: string | null, incoming: string) =>
    owner === incoming ? 'keep' : owner == null ? 'adopt' : 'wipe';

  check('the same account keeps its data', claim('user-a', 'user-a') === 'keep');
  check('a different account wipes first', claim('user-a', 'user-b') === 'wipe');
  // Anonymous use is adopted, not destroyed: a fortnight recorded before signing up comes along.
  check('unclaimed data is adopted', claim(null, 'user-a') === 'adopt');
  // Sign-out leaves the owner set, so signing back in is lossless and a switch is still caught.
  check('signing back in after a sign-out keeps everything', claim('user-a', 'user-a') === 'keep');
  // And a wipe clears ownership, so the device is genuinely unclaimed afterwards.
  check('a wiped device is unclaimed again', claim(null, 'user-b') === 'adopt');
}

console.log('\nthe facial baseline keeps syncing after the first row');
{
  /**
   * `pushBaseline` returns early once the account's reaction-time baseline is current, and the face
   * baseline only ever travelled inside that insert. So calibration scans two through five — and
   * the frozen, finished baseline most of all — never reached the account, and a new phone restored
   * a one-sample reference and scored every scan against it.
   */
  const faceWith = (n: number) => ({
    periorbital: { n, mean: 0.15, m2: 0.001 },
    redness: { n, mean: 0.05, m2: 0.001 },
    eyeContrast: { n, mean: 1.2, m2: 0.01 },
    motion: { n, mean: 0.02, m2: 0.0001 },
    updatedAt: 1_000 + n,
  });
  // The push rule: send when this device has seen more scans than the account has.
  const shouldPush = (localN: number, remoteN: number) => localN > remoteN;
  check('a finished baseline overwrites a one-sample one', shouldPush(5, 1));
  check('mid-calibration progress is sent too', shouldPush(3, 1));
  check('an equal count is left alone', !shouldPush(5, 5));
  check('and a staler local one never overwrites', !shouldPush(2, 5));

  // The pull rule has to agree, or push and pull ping-pong forever.
  const local: SyncData = { checkIns: [], sleepLogs: [], baseline: null, faceBaseline: faceWith(2) as never };
  const remote: SyncData = { checkIns: [], sleepLogs: [], baseline: null, faceBaseline: faceWith(5) as never };
  check('the merge keeps the more complete baseline', mergeRecords(local, remote).faceBaseline?.periorbital.n === 5);
  check('in either direction', mergeRecords(remote, local).faceBaseline?.periorbital.n === 5);
  check('and one side having none is not a loss', mergeRecords({ ...local, faceBaseline: null }, remote).faceBaseline?.periorbital.n === 5);
}

console.log('\nfire -> snooze -> re-fire -> dismiss, as one session');
{
  /**
   * The whole alarm lifecycle, as the store's own transitions.
   *
   * Written as a walk rather than as separate cases because the bug this exists for only appears on
   * the *third* step: `snoozeArmed` was set true by the snooze and never cleared by the re-fire, so
   * from the moment a snooze rang, JS believed a ring was still pending on an alarm that had already
   * rung. G1 told the user "ringing again in 9 minutes" while it was ringing for exactly that
   * reason, and dismissing issued a cancel-snooze against a pending intent that by then held
   * tomorrow's occurrence. Nothing about any single step looked wrong.
   */
  interface Live {
    snoozes: number;
    snoozeArmed: boolean;
    events: AlarmEventRecord[];
  }

  const ALARM = 1;

  /** beginAlarmSession, both branches. */
  const begin = (state: Live, now: number): Live => {
    const open = sessionFor(state.events, ALARM, now);
    if (open) {
      // A snooze fired. Natively that firing consumed it — the receiver's rearmAfterFiring clears
      // the record — so nothing is armed any more, while the count deliberately carries.
      return { snoozes: open.snoozeCount, snoozeArmed: false, events: state.events };
    }
    return {
      snoozes: 0,
      snoozeArmed: false,
      events: [...state.events, event({ id: `ae_${now}`, alarmId: ALARM, firedAt: now, snoozeCount: 0 })],
    };
  };

  /** snooze(), where `armed` is what the native call reported. */
  const snooze = (state: Live, armed: boolean): Live => ({
    snoozes: state.snoozes + 1,
    snoozeArmed: armed,
    events: state.events.map((e) => (e.dismissedAt == null ? { ...e, snoozeCount: e.snoozeCount + 1 } : e)),
  });

  /** stopAlarm(). The cancel-snooze call is only issued when one is actually pending. */
  const stop = (state: Live, now: number): { next: Live; cancelledSnooze: boolean } => ({
    next: {
      snoozes: state.snoozes,
      snoozeArmed: false,
      events: state.events.map((e) =>
        e.dismissedAt == null ? { ...e, dismissedAt: now, dismissMethod: 'manual_stop' as const } : e
      ),
    },
    cancelledSnooze: state.snoozeArmed,
  });

  const t0 = 5_000_000;
  let live: Live = { snoozes: 0, snoozeArmed: false, events: [] };

  live = begin(live, t0);
  check('the alarm fires with nothing armed', live.snoozes === 0 && !live.snoozeArmed, live);

  live = snooze(live, true);
  check('snoozing arms a ring and counts it', live.snoozes === 1 && live.snoozeArmed, live);

  // Nine minutes later the snooze fires. The app may well have been killed in between.
  live = begin(live, t0 + 9 * 60 * 1000);
  check('the re-fire continues the same session', live.snoozes === 1, live.snoozes);
  check('and no longer believes a snooze is pending', !live.snoozeArmed, live);

  const dismissed = stop(live, t0 + 10 * 60 * 1000);
  check('dismissing after the re-fire cancels nothing', !dismissed.cancelledSnooze);
  check('and closes the event', dismissed.next.events[0].dismissedAt != null, dismissed.next.events[0]);
  check('recording how it ended', dismissed.next.events[0].dismissMethod === 'manual_stop');

  // The next morning is a new session, not a continuation of a closed one.
  const tomorrow = begin(dismissed.next, t0 + 24 * 60 * 60 * 1000);
  check('the next morning starts at zero', tomorrow.snoozes === 0 && !tomorrow.snoozeArmed, tomorrow);
  check('as a second event', tomorrow.events.length === 2, tomorrow.events.length);

  /**
   * The opposite case, which is what `snoozeArmed` is *for*: dismissing while a snooze really is
   * pending has to cancel it, or the alarm the user just stopped rings again in nine minutes.
   */
  let pending: Live = begin({ snoozes: 0, snoozeArmed: false, events: [] }, t0);
  pending = snooze(pending, true);
  check('dismissing before the snooze fires does cancel it', stop(pending, t0 + 60_000).cancelledSnooze);

  // And a snooze the device refused to arm must not be reported as one that was.
  let unarmed: Live = begin({ snoozes: 0, snoozeArmed: false, events: [] }, t0);
  unarmed = snooze(unarmed, false);
  check('a snooze that could not be armed cancels nothing', !stop(unarmed, t0 + 60_000).cancelledSnooze);
  check('though it still counts against the cap', unarmed.snoozes === 1, unarmed.snoozes);
}

console.log(failures === 0 ? '\nAll runtime checks passed.' : `\n${failures} runtime check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
