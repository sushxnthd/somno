import { alarmFromOnboarding } from '../src/lib/alarmPlan.ts';
import type { Alarm } from '../src/store/types.ts';

/**
 * Tests for the alarm onboarding creates.
 *
 * These exist because of the worst bug this app has had. The last onboarding screen has a dial and
 * a button reading "Save alarm"; the button set two flags and navigated, creating nothing. The app
 * separately shipped with two alarms copied from the design's mockup, one of them a 07:00 weekday
 * alarm switched on. So a user who set an evening alarm was woken at seven the next morning by an
 * alarm they had never created — which, from the outside, looks exactly like the app having the
 * wrong time.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

const WEEKDAYS = [true, true, true, true, true, false, false];
const choice = (over: Partial<{ min: number; days: boolean[]; smart: boolean; sound: string; label: string }> = {}) => ({
  min: 19 * 60,
  days: [...WEEKDAYS],
  smart: true,
  sound: '',
  label: '',
  ...over,
});

{
  console.log('the alarm the user actually set');
  const made = alarmFromOnboarding([], choice(), 1);
  check('one is created', made !== null, made);
  check('at the time on the dial, not a default', made?.min === 19 * 60, made?.min);
  check('on the days that were selected', made?.days.join() === WEEKDAYS.join(), made?.days);
  check('switched on — an alarm nobody armed is not an alarm', made?.on === true, made);
  check('carrying the Smart Wake choice', made?.smart === true, made);
  check('with a label, even when none was typed', Boolean(made?.label), made?.label);
}

{
  console.log('when nothing should be created');
  check(
    'no days selected means no alarm',
    alarmFromOnboarding([], choice({ days: [false, false, false, false, false, false, false] }), 1) === null
  );

  const existing: Alarm[] = [
    { id: 9, min: 19 * 60, days: [...WEEKDAYS], smart: true, on: true, sound: '', label: 'Wake up' },
  ];
  check('the same alarm twice is not created twice', alarmFromOnboarding(existing, choice(), 1) === null);
  check(
    'but a different time is a different alarm',
    alarmFromOnboarding(existing, choice({ min: 7 * 60 }), 1) !== null
  );
  check(
    'and so is the same time on different days',
    alarmFromOnboarding(existing, choice({ days: [false, false, false, false, false, true, true] }), 1) !== null
  );
}

{
  console.log('an evening alarm stays in the evening');
  // The literal report: a 7pm alarm that rang in the morning. Nothing in this path may reduce a
  // minute-of-day to a 12-hour clock.
  const evening = alarmFromOnboarding([], choice({ min: 19 * 60 }), 1);
  check('19:00 is stored as 1140 minutes', evening?.min === 1140, evening?.min);
  check('which is after noon', (evening?.min ?? 0) >= 720, evening?.min);
}

console.log(failures === 0 ? '\nAll onboarding-alarm checks passed.' : `\n${failures} onboarding-alarm check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
