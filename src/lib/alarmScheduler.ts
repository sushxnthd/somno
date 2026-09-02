import { Platform } from 'react-native';
import { useSomnoStore } from '../store/useSomnoStore';
export {
  canScheduleExactAlarms,
  canUseFullScreenIntent,
  listAlarmSounds,
  openFullScreenIntentSettings,
  previewSound,
  setNativeVibrate,
  stopAlarmSound,
} from './alarmSound';
export { nextFireTimestamp, planAlarms, type PlannedAlarm } from './alarmPlan';
import { alarmIdFromNative, nativeAlarmIds, planAlarms } from './alarmPlan';
import type { Alarm } from '../store/types';
import type { ScreenId } from '../store/types';

// The native module only exists in a custom dev-client / real device build (expo-dev-client is
// installed and the module is registered via modules/smart-wake-alarm, but this sandboxed
// environment has no Android SDK / Xcode to actually compile that build) — resolve it lazily and
// fail soft everywhere so the web preview and plain-Expo-Go-style JS bundle we CAN run here never
// crash because the native side isn't present.
function getNativeModule() {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('smart-wake-alarm');
    return mod.getSmartWakeAlarmModule();
  } catch {
    return null;
  }
}

/**
 * How many minutes early an alarm fires. Always zero — Smart Wake no longer moves the alarm.
 *
 * It used to. `smartWakeOffsetMin` walked the semi-Markov chain forward from bedtime, scored each
 * minute of a 30-minute window by a WAKEABILITY table (Wake 3, REM 2, NREM 1), and rang at the best
 * one. The output was a real number and the mechanism was coherent, and it was still wrong to ship:
 * nothing measures when this user entered REM. There is no wearable, no microphone, no motion
 * sensing. The chain was seeded with the *previous day's* SDI and a bedtime the user typed in, so
 * the "lightest sleep" it found was a property of a population model, not of the person asleep.
 *
 * Waking someone up to twenty-nine minutes early on that basis costs them real sleep for a
 * prediction with no measurement behind it — and a shortfall the rest of the app would then count
 * as debt. An alarm that rings when it was set is strictly better than one that guesses earlier.
 *
 * Smart Wake keeps the part that is real and was always the core of it: the alarm fires reliably,
 * offers a wake check-in, and the *snooze* adapts to the SDI that check-in actually measured. That
 * is a decision made from a measurement taken seconds earlier, which is the opposite of the case
 * above. See `snoozeLengthFor`.
 *
 * The semi-Markov engine stays where it is defensible — sleep-debt and recovery modelling — and the
 * hypnogram it draws stays labelled as modelled.
 */
function smartWakeOffsetFor(_alarm: Alarm): number {
  return 0;
}

let scheduledIds = new Set<number>();

function reconcile(alarms: Alarm[]) {
  const native = getNativeModule();
  if (!native) return; // web, or no dev-client build available — nothing to schedule natively

  /**
   * JS alarm ids are `Date.now()`; the native module takes an `Int`. Everything crossing the bridge
   * goes through this map, and nothing else does — the ids stored, synced and shown in the UI stay
   * as they are. See `nativeAlarmId` for why truncation was not sufficient.
   */
  const nativeIds = nativeAlarmIds(alarms);

  const enabledIds = new Set<number>();
  for (const plan of planAlarms(alarms, smartWakeOffsetFor)) {
    const nativeId = nativeIds.get(plan.id);
    if (nativeId == null) continue;
    enabledIds.add(nativeId);
    try {
      native.scheduleAlarm(nativeId, plan.fireAt, plan.sound, plan.minuteOfDay, plan.days, plan.offsetMin);
    } catch (e) {
      console.warn('[alarmScheduler] scheduleAlarm failed for', plan.id, e);
    }
  }
  for (const id of scheduledIds) {
    if (!enabledIds.has(id)) {
      try {
        native.cancelAlarm(id);
      } catch (e) {
        console.warn('[alarmScheduler] cancelAlarm failed for', id, e);
      }
    }
  }
  scheduledIds = enabledIds;
}

/** Wires the store's `alarms` array to real native scheduling. Call once at app start; returns
 * an unsubscribe function. No-ops entirely on web or without a compiled dev-client build. */
export function initAlarmScheduler(): () => void {
  if (Platform.OS === 'web') return () => {};

  /**
   * Migrate, then schedule, then re-arm. The order is the whole point.
   *
   * The native store may still hold schedules written under the previous id scheme, when JS ids
   * were passed across the bridge unfolded. `rearmAll` would faithfully put those back while this
   * reconcile schedules the new mapped ids — two alarms for every one the user set, and the ghost
   * on the old code is one nothing in the app can cancel, because nothing knows that id any more.
   *
   * Migrating first clears them while there is nothing to lose: the reconcile immediately below
   * re-schedules every alarm the user actually has, from the store's own list, under ids both sides
   * agree on. Doing it the other way round — migrating after reconcile, or leaving it to rearmAll —
   * would wipe the schedules that had just been written.
   */
  try {
    getNativeModule()?.migrateSchedules?.();
  } catch (e) {
    console.warn('[alarmScheduler] schedule migration failed', e);
  }

  reconcile(useSomnoStore.getState().alarms);

  // A safety net for the alarms the reconcile above did not touch: if the phone was off, or a
  // manufacturer's battery manager dropped the pending intents, the native side still remembers
  // the recurrence and can put them back.
  try {
    getNativeModule()?.rearmAll?.();
  } catch (e) {
    console.warn('[alarmScheduler] rearmAll failed', e);
  }
  const unsubscribe = useSomnoStore.subscribe((state, prev) => {
    if (state.alarms !== prev.alarms) reconcile(state.alarms);
  });
  return unsubscribe;
}

/** What woke the app: the screen to open, and the alarm that actually fired. */
export interface PendingAlarm {
  screen: ScreenId;
  /** The real id from the intent, or null when the native module could not supply one. */
  alarmId: number | null;
}

/**
 * Checks whether the app cold-started because a native alarm fired or was tapped.
 *
 * Returns the alarm's **id** as well as the screen. It used to return only the screen, so the store
 * had to work out which alarm had rung by searching for an enabled one whose minute matched the
 * time currently on display — right by luck with a single alarm, and wrong with two at the same
 * time, or when an alarm's time had been edited since it was scheduled. Every snooze and dismiss
 * then acted on the wrong alarm.
 *
 * Prefers `consumePendingAlarm` and falls back to the screen-only call, because a JS bundle can be
 * newer than the native module it runs against. Call once, early, after the store has hydrated —
 * reading clears it.
 */
export async function getPendingAlarm(): Promise<PendingAlarm | null> {
  const native = getNativeModule();
  if (!native) return null;
  try {
    if (typeof native.consumePendingAlarm === 'function') {
      const pending = native.consumePendingAlarm();
      if (!pending?.screen) return null;
      // -1 is the native module's "no id", and it must stay distinguishable from alarm 0.
      const nativeId = typeof pending.alarmId === 'number' && pending.alarmId >= 0 ? pending.alarmId : null;
      // Native speaks in the folded id; the store, the records and the UI speak in the JS one.
      // Translating here keeps that boundary in a single place.
      const alarmId = nativeId == null ? null : alarmIdFromNative(useSomnoStore.getState().alarms, nativeId);
      return { screen: pending.screen as ScreenId, alarmId };
    }
    const screen = native.consumePendingAlarmScreen();
    return screen ? { screen: screen as ScreenId, alarmId: null } : null;
  } catch {
    return null;
  }
}
