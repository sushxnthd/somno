import type { Alarm } from '../store/types';

/**
 * What the alarm scheduler decides to arm, and when — kept in its own module with no imports that
 * touch React Native, the store or the native module.
 *
 * This is here because the bug it had could not have been caught anywhere else. Alarms without
 * Smart Wake were skipped by a single `continue`, so a plain alarm could be created, listed, shown
 * with its toggle on, and never ring; nothing threw and nothing was logged. The decision is pure,
 * so `scripts/test-alarms.ts` can pin it under plain node, with no device and no native build.
 *
 * The rules here are also a contract with the Kotlin side: `AlarmScheduler.nextFireAfter` computes
 * the following occurrence with the same Monday-first day order and the same strictly-in-the-future
 * rule, because after the first firing it — not this — is what schedules the next morning.
 */

/** The app's day order is Monday-first (see src/utils/format.ts); `Date#getDay` is Sunday-first. */
function jsDayToAppIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/**
 * Next epoch-ms at which `min` (minutes past midnight) occurs on one of the enabled `days`,
 * strictly in the future. Null if no days are enabled.
 *
 * Strictly future matters more than it looks: the native receiver re-arms an alarm at the moment it
 * fires, so an implementation that accepted "now" would schedule the occurrence that is ringing and
 * the alarm would repeat forever.
 */
export function nextFireTimestamp(min: number, days: boolean[], from: Date = new Date()): number | null {
  if (!days.some(Boolean)) return null;
  for (let offset = 0; offset < 8; offset++) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(Math.floor(min / 60), min % 60, 0, 0);
    if (days[jsDayToAppIndex(candidate.getDay())] && candidate.getTime() > from.getTime()) {
      return candidate.getTime();
    }
  }
  return null;
}

/** One alarm, resolved into exactly what the native side needs to arm and re-arm it. */
export interface PlannedAlarm {
  id: number;
  fireAt: number;
  sound: string;
  minuteOfDay: number;
  /** Seven characters, '1'/'0', index 0 = Monday — the app's own day order. */
  days: string;
  offsetMin: number;
}

export function planAlarms(
  alarms: Alarm[],
  offsetFor: (a: Alarm) => number,
  from: Date = new Date()
): PlannedAlarm[] {
  const planned: PlannedAlarm[] = [];
  for (const alarm of alarms) {
    // Every alarm that is switched on, not only the Smart Wake ones: Smart Wake decides *when* an
    // alarm rings, not *whether* it is an alarm.
    if (!alarm.on) continue;
    const scheduledAt = nextFireTimestamp(alarm.min, alarm.days, from);
    if (scheduledAt == null) continue;
    // The offset is retained as a hook and is always zero: the early-wake mechanism it served was
    // removed because nothing on the phone can tell which sleep stage anyone is in. Kept floored at
    // zero because an alarm that can fire late is not an alarm.
    const offsetMin = alarm.smart ? Math.max(0, offsetFor(alarm)) : 0;
    planned.push({
      id: alarm.id,
      fireAt: scheduledAt - offsetMin * 60_000,
      sound: alarm.sound || 'default',
      minuteOfDay: alarm.min,
      days: alarm.days.map((d) => (d ? '1' : '0')).join(''),
      offsetMin,
    });
  }
  return planned;
}

/**
 * The alarm onboarding's dial should create, or null if it should not create one.
 *
 * Pure because of what it replaced. "Save alarm" on the last onboarding screen set two flags and
 * navigated — it never created anything, so the time the user had just chosen was thrown away and
 * whatever the app had seeded rang instead. The app also seeded a 07:00 weekday alarm, switched on,
 * that nobody had asked for. Together those produced a user setting an evening alarm and being
 * woken at seven the next morning.
 */
export function alarmFromOnboarding(
  existing: Alarm[],
  choice: { min: number; days: boolean[]; smart: boolean; sound: string; label: string },
  id: number
): Alarm | null {
  // Nothing to arm if no day is selected — an alarm that repeats on no days never fires, and
  // creating one would leave a dead row in the list.
  if (!choice.days.some(Boolean)) return null;
  // Going back through onboarding must not stack duplicates of the same alarm.
  const duplicate = existing.some((a) => a.min === choice.min && a.days.join() === choice.days.join());
  if (duplicate) return null;
  return {
    id,
    min: choice.min,
    days: choice.days.slice(),
    smart: choice.smart,
    on: true,
    sound: choice.sound,
    label: choice.label || 'Wake up',
    // The id is `Date.now()` at creation, and so is the version. Stamping it here rather than at
    // the call site keeps every route that creates an alarm versioned by construction.
    updatedAt: id,
  };
}

/**
 * How long a snooze should be, in minutes.
 *
 * Zero means "you are awake enough that a snooze would not help" — the alarm screen offers to open
 * the app instead of snoozing at that point, so this never reaches the scheduler as a zero.
 *
 * `scanOptimize` is the settings toggle "Check-in sets snooze length". It is honoured here because
 * for a long time it was honoured nowhere: the adaptive length was applied whether the toggle was
 * on or off, so a setting that persisted, synced and rendered its own state changed nothing.
 */
export function snoozeLengthFor(sdi: number, scanOptimize: boolean, fixedMin: number, smartWake = true): number {
  /**
   * Smart Wake is what makes the snooze adaptive; without it this is an ordinary alarm.
   *
   * The per-alarm toggle had become decorative. It used to select the early-ring window, and when
   * that was removed — because nothing measures sleep stages — the flag was left feeding only an
   * offset that is now always zero. It sat in the UI, synced to the backend, and changed nothing.
   *
   * Adapting the *snooze* to the SDI is the part of Smart Wake that is real: the score comes from a
   * check-in taken seconds earlier, not from a model of the night. So that is what the toggle now
   * governs, and an alarm with it off snoozes for the fixed interval like any other alarm.
   */
  if (!smartWake) return fixedMin;
  if (!scanOptimize) return fixedMin;
  if (sdi > 60) return 0;
  if (sdi > 45) return 7;
  return 11;
}

/**
 * Whether another snooze is allowed.
 *
 * The cap is the spec's one hard safety rule about snoozing: past it the alarm stops and the screen
 * offers a way out rather than another round. `>=` rather than `>` because `snoozes` counts snoozes
 * already taken.
 */
export function snoozeAllowed(snoozes: number, maxSnoozes: number): boolean {
  return snoozes < maxSnoozes;
}

/**
 * The largest alarm id Kotlin can receive.
 *
 * The native module's every alarm entry point takes an `Int` — 32-bit, signed — because that is what
 * `PendingIntent.getBroadcast` uses as its request code. JS alarm ids are `Date.now()`, which passed
 * 2^31 milliseconds after the epoch in January 1970 and is now around 1.76e12: roughly 800 times too
 * large. Every alarm this app has ever created has been handing Kotlin a number it cannot represent.
 *
 * Nothing here caught it because nothing here compiles Kotlin, and the JS-side tests only ever check
 * the plan, never the crossing. Depending on the Expo Modules converter, the call either throws or
 * silently truncates — and a truncated request code is a *different* PendingIntent, so scheduling
 * writes one alarm and cancelling addresses another.
 */
export const MAX_NATIVE_ALARM_ID = 0x7fffffff;

/**
 * Folds a JS alarm id into the positive 31-bit range Kotlin can hold.
 *
 * Deterministic, so the same alarm maps to the same native id on every launch — which it must, since
 * the native side stores schedules under that id and re-arms them after a reboot with no help from
 * JS. A plain truncation would also be deterministic and is not enough: `Date.now() | 0` wraps every
 * 2^32 ms, so two alarms created 49 days apart collide, and a collision here means one alarm's
 * schedule overwrites another's.
 *
 * The mix below is an integer avalanche step, chosen because it spreads adjacent inputs — and alarm
 * ids created in the same session are adjacent, differing by milliseconds. Zero is excluded so an
 * id can never be confused with the "no alarm" sentinel the native store uses.
 */
export function nativeAlarmId(jsId: number): number {
  const value = Math.abs(Math.trunc(jsId));
  // Both halves. Reducing mod 2^32 first — which is what a bare `| 0` does, and what the first
  // version of this function did before its own test caught it — throws away every bit above the
  // 32nd, so two ids exactly 2^32 ms apart (49 days) become the same input and no amount of mixing
  // afterwards can separate them again. A `Date.now()` id has about 41 significant bits.
  const lo = value % 0x100000000;
  const hi = Math.floor(value / 0x100000000);

  let h = (lo ^ Math.imul(hi, 0x9e3779b1)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const folded = h % MAX_NATIVE_ALARM_ID;
  return folded === 0 ? 1 : folded;
}

/**
 * Native ids for a whole set of alarms, with collisions resolved.
 *
 * A hash into 31 bits is not injective, and "vanishingly unlikely" is not the same as impossible —
 * a collision would silently merge two alarms into one, which is the exact failure the width bug
 * caused and is not worth reintroducing by a different route. Resolution walks forward from the
 * hash, and is deterministic given the same set in the same order, so a device that reconciles the
 * same alarms twice gets the same mapping both times.
 */
export function nativeAlarmIds(alarms: { id: number }[]): Map<number, number> {
  const byJsId = new Map<number, number>();
  const taken = new Set<number>();
  // Sorted by id so the mapping does not depend on array order, which changes as alarms are edited.
  for (const alarm of [...alarms].sort((a, b) => a.id - b.id)) {
    let candidate = nativeAlarmId(alarm.id);
    while (taken.has(candidate)) candidate = (candidate % MAX_NATIVE_ALARM_ID) + 1;
    taken.add(candidate);
    byJsId.set(alarm.id, candidate);
  }
  return byJsId;
}

/**
 * The native id for one alarm, resolved against the whole set it belongs to.
 *
 * Always this rather than `nativeAlarmId` directly. The bare fold does not know about the other
 * alarms, so if two of them collided and the set-wide mapping moved one, a snooze or a cancel that
 * folded on its own would address the id the scheduler did *not* use — arming a PendingIntent
 * nothing else can find, or cancelling one that belongs to a different alarm.
 */
export function nativeIdFor(alarms: { id: number }[], jsId: number): number {
  return nativeAlarmIds(alarms).get(jsId) ?? nativeAlarmId(jsId);
}

/** The alarm a native id belongs to, or null. Used to attribute a firing to the right alarm. */
export function alarmIdFromNative(alarms: { id: number }[], nativeId: number): number | null {
  for (const [jsId, native] of nativeAlarmIds(alarms)) if (native === nativeId) return jsId;
  return null;
}
