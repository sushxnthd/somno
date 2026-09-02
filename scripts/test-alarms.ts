import { nextFireTimestamp, planAlarms, snoozeAllowed, snoozeLengthFor } from '../src/lib/alarmPlan.ts';
import type { Alarm } from '../src/store/types.ts';

/**
 * Tests for what the alarm scheduler decides to arm.
 *
 * These exist because of a bug that made the app's headline feature not work: alarms without Smart
 * Wake were skipped entirely, so a plain alarm could be created, listed, and switched on, and then
 * never ring. Nothing failed and nothing was logged — it was a `continue` in a loop.
 *
 * The native half of the same chain (re-arming after firing, and after a reboot) cannot be reached
 * from here, but it computes its next occurrence with the same rules as `nextFireTimestamp`, so the
 * rules those two have to share are pinned below: Monday-first days, strictly-future firing, and
 * the Smart Wake offset applied last.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

const EVERY_DAY = [true, true, true, true, true, true, true];
const WEEKDAYS = [true, true, true, true, true, false, false];

const alarm = (over: Partial<Alarm> = {}): Alarm => ({
  id: 1,
  min: 7 * 60,
  days: [...EVERY_DAY],
  smart: false,
  on: true,
  sound: 'default',
  label: 'Wake',
  ...over,
});

// A Wednesday, 06:00 local.
const WED_6AM = new Date(2026, 7, 12, 6, 0, 0, 0);
const noOffset = () => 0;

{
  console.log('what gets armed');
  const plain = planAlarms([alarm({ smart: false })], noOffset, WED_6AM);
  check('a plain alarm is armed', plain.length === 1, plain);
  check('and carries no Smart Wake offset', plain[0]?.offsetMin === 0, plain[0]);

  const smart = planAlarms([alarm({ smart: true })], () => 18, WED_6AM);
  check('a Smart Wake alarm is armed too', smart.length === 1, smart);
  check('moved earlier by the offset', smart[0]?.offsetMin === 18, smart[0]);
  check(
    'which is subtracted from the fire time, never added',
    smart[0].fireAt === new Date(2026, 7, 12, 7, 0, 0, 0).getTime() - 18 * 60_000,
    new Date(smart[0].fireAt).toString()
  );

  check('an alarm switched off is not armed', planAlarms([alarm({ on: false })], noOffset, WED_6AM).length === 0);
  check(
    'an alarm repeating on no days is not armed',
    planAlarms([alarm({ days: [false, false, false, false, false, false, false] })], noOffset, WED_6AM).length === 0
  );
  check(
    'a negative offset cannot push an alarm later',
    planAlarms([alarm({ smart: true })], () => -30, WED_6AM)[0].offsetMin === 0
  );
}

{
  console.log('the recurrence handed to the native side');
  const [plan] = planAlarms([alarm({ days: [...WEEKDAYS] })], noOffset, WED_6AM);
  // The native re-arm reads this string, so its order is a contract between the two languages:
  // index 0 is Monday here and in AlarmScheduler.nextFireAfter, which converts from Calendar's
  // Sunday-first numbering to match.
  check('days are seven characters, Monday first', plan.days === '1111100', plan.days);
  check('the nominal minute travels with it', plan.minuteOfDay === 420, plan.minuteOfDay);
}

{
  console.log('when the next one lands');
  const today = nextFireTimestamp(7 * 60, [...EVERY_DAY], WED_6AM);
  check('later today, if the time has not passed', today === new Date(2026, 7, 12, 7, 0).getTime(), new Date(today!).toString());

  const passed = nextFireTimestamp(5 * 60, [...EVERY_DAY], WED_6AM);
  check('tomorrow, once it has', passed === new Date(2026, 7, 13, 5, 0).getTime(), new Date(passed!).toString());

  // 06:00 exactly: the occurrence happening right now must not be selected, or an alarm re-armed
  // by the receiver at the moment it fires would immediately fire again.
  const exactlyNow = nextFireTimestamp(6 * 60, [...EVERY_DAY], WED_6AM);
  check('never the instant that is already happening', exactlyNow === new Date(2026, 7, 13, 6, 0).getTime(), new Date(exactlyNow!).toString());

  // Wednesday 06:00 with a Saturday-only alarm.
  const sat = nextFireTimestamp(7 * 60, [false, false, false, false, false, true, false], WED_6AM);
  check('skips forward to the next enabled day', sat === new Date(2026, 7, 15, 7, 0).getTime(), new Date(sat!).toString());

  // Sunday is index 6, the far end of the week — the classic off-by-one in a Monday-first array.
  const sun = nextFireTimestamp(7 * 60, [false, false, false, false, false, false, true], WED_6AM);
  check('Sunday is index 6, not index 0', sun === new Date(2026, 7, 16, 7, 0).getTime(), new Date(sun!).toString());
}

{
  console.log('snooze length');
  // "Face scan sets snooze length" is a real setting now. It used to persist, sync and render its
  // own state while nothing read it — the adaptive length was applied either way.
  check('a sharp reading means no snooze is needed', snoozeLengthFor(72, true, 9) === 0, snoozeLengthFor(72, true, 9));
  check('a middling one gets seven minutes', snoozeLengthFor(52, true, 9) === 7, snoozeLengthFor(52, true, 9));
  check('a poor one gets eleven', snoozeLengthFor(30, true, 9) === 11, snoozeLengthFor(30, true, 9));
  check('with the setting off, the fixed length wins at every score', [72, 52, 30].every((v) => snoozeLengthFor(v, false, 9) === 9));
  check('and the fixed length is never zero, so a snooze is always a snooze', snoozeLengthFor(95, false, 9) > 0);

  // Per-alarm Smart Wake. Until this argument existed, `alarm.smart` changed nothing observable:
  // the adaptive length was chosen for every alarm, smart or not, so the toggle in the alarm editor
  // was a switch wired to nothing. An alarm with it off must behave like an alarm clock — the same
  // number of minutes every time, whatever the scan said.
  check('Smart Wake off ignores the reading entirely', [72, 52, 30].every((v) => snoozeLengthFor(v, true, 9, false) === 9));
  check('Smart Wake off never returns the no-snooze zero', snoozeLengthFor(95, true, 9, false) === 9);
  check('Smart Wake on still adapts', snoozeLengthFor(30, true, 9, true) === 11, snoozeLengthFor(30, true, 9, true));
  check('and defaults to on when the flag is not passed', snoozeLengthFor(30, true, 9) === snoozeLengthFor(30, true, 9, true));
}

{
  console.log('the snooze cap');
  // The spec's hard safety rule: past the cap the alarm stops rather than offering another round.
  check('the first snooze is allowed', snoozeAllowed(0, 3));
  check('so is the third', snoozeAllowed(2, 3));
  check('the fourth is not', !snoozeAllowed(3, 3));
  check('and a cap of zero means no snoozing at all', !snoozeAllowed(0, 0));
}

console.log(failures === 0 ? '\nAll alarm checks passed.' : `\n${failures} alarm check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
