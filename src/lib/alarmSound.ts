import { Platform } from 'react-native';
import { nativeAlarmIds } from './alarmPlan';

/**
 * Direct calls into the native alarm module that do not need any app state.
 *
 * Separate from alarmScheduler.ts for one structural reason: the store has to be able to silence a
 * ringing alarm, and alarmScheduler reads the store. Putting these here keeps that from becoming an
 * import cycle, which Metro resolves in an order nobody should have to reason about at 6am.
 *
 * Every call fails soft. The native module does not exist in Expo Go or on web, and none of this is
 * ever allowed to be the reason a screen throws.
 */

interface AlarmSoundNative {
  cancelAlarm?(id: number): void;
  snoozeAlarm?(id: number, minutes: number): void;
  /** Cancels a pending snooze and restores the recurring schedule. Optional: newer than some builds. */
  cancelSnooze?(id: number): boolean;
  stopAlarmSound?(): void;
  isAlarmSounding?(): boolean;
  previewSound?(uri: string | null): void;
  setVibrate?(enabled: boolean): void;
  listAlarmSounds?(): { uri: string; name: string }[];
  canScheduleExactAlarms?(): boolean;
  canUseFullScreenIntent?(): boolean;
  openFullScreenIntentSettings?(): void;
}

function nativeModule(): AlarmSoundNative | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('smart-wake-alarm');
    return mod.getSmartWakeAlarmModule() as AlarmSoundNative | null;
  } catch {
    return null;
  }
}

/**
 * Silences a ringing alarm.
 *
 * Called from every branch of the alarm screen. A tone still playing during the face scan would
 * both ruin the capture and make the user's choice feel ignored, and one still playing after
 * "just stop the alarm" would be the single worst bug this app could ship.
 */
export function stopAlarmSound(): void {
  const mod = nativeModule();
  try {
    mod?.stopAlarmSound?.();
  } catch {
    // nothing playing, or no native module — either way there is nothing to silence
  }
}

/** The alarm tones this device actually has. Empty off-device, where there is no picker to fill. */
export function listAlarmSounds(): { uri: string; name: string }[] {
  const mod = nativeModule();
  try {
    return mod?.listAlarmSounds?.() ?? [];
  } catch {
    return [];
  }
}

/** Plays a tone once so the user can hear what they are choosing. */
export function previewSound(uri: string): void {
  const mod = nativeModule();
  try {
    mod?.previewSound?.(uri);
  } catch {
    // preview is a nicety; failing to play one is not worth surfacing
  }
}

/** Pushes the vibrate preference down to where the alarm receiver can read it. */
export function setNativeVibrate(enabled: boolean): void {
  const mod = nativeModule();
  try {
    mod?.setVibrate?.(enabled);
  } catch {
    // the alarm still rings; it just may not buzz
  }
}

/**
 * Whether this device will honour exact alarm times right now.
 *
 * On Android 12 and 12L the user can revoke the exact-alarm permission in system settings, and the
 * scheduler then falls back to an inexact alarm that can drift by minutes — which for a wake-up
 * alarm is worth telling someone about rather than letting them discover it by oversleeping.
 */
export function canScheduleExactAlarms(): boolean {
  const mod = nativeModule();
  if (!mod || typeof mod.canScheduleExactAlarms !== 'function') return true;
  try {
    return mod.canScheduleExactAlarms();
  } catch {
    return true;
  }
}


/**
 * Whether the alarm will be allowed to cover the lock screen.
 *
 * Android 14 made this revocable, and revoking it is silent — the notification still posts, it just
 * arrives as a banner instead of launching the alarm. For an alarm clock that is the difference
 * between waking up and not, so it is surfaced next to the exact-alarm warning rather than left to
 * be discovered by oversleeping. Defaults to true wherever the question does not apply.
 */
export function canUseFullScreenIntent(): boolean {
  const mod = nativeModule();
  if (!mod || typeof mod.canUseFullScreenIntent !== 'function') return true;
  try {
    return mod.canUseFullScreenIntent();
  } catch {
    return true;
  }
}

/** Opens the system screen where that access is granted back. */
export function openFullScreenIntentSettings(): void {
  const mod = nativeModule();
  try {
    mod?.openFullScreenIntentSettings?.();
  } catch {
    // nothing to open; the warning text still explains what to look for
  }
}

/**
 * Rings an alarm again after `minutes`.
 *
 * The snooze button used to do three things — silence the tone, add one to a counter, and go back
 * to the alarm screen — none of which was "ring again". There was no scheduling behind it at all,
 * on either side of the bridge, so every snooze silently ended the alarm. Whether this succeeds is
 * reported back, because a snooze that could not be armed must not be presented as one that was.
 */
/**
 * Cancels a pending snooze and puts the alarm's recurring schedule back.
 *
 * Returns false when the native module is older than this bundle and has no such call, so the
 * caller can record that the snooze may still be armed rather than assume it was cleared.
 */
export function cancelNativeSnooze(id: number): boolean {
  const mod = nativeModule();
  if (!mod?.cancelSnooze) return false;
  try {
    return mod.cancelSnooze(id) !== false;
  } catch {
    return false;
  }
}

export function snoozeNativeAlarm(id: number, minutes: number): boolean {
  const mod = nativeModule();
  if (!mod?.snoozeAlarm) return false;
  try {
    mod.snoozeAlarm(id, minutes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Takes down every alarm this device has armed.
 *
 * Called when local data is wiped — a sign-out, a delete, a restore onto a shared phone. Alarms are
 * the only local state that keeps acting once the app is closed: the recurrence lives in native
 * SharedPreferences and the receiver re-arms itself as it fires, so an alarm left behind by a wipe
 * would go on ringing for whoever holds the phone next, indefinitely, with nothing in the app's own
 * data to explain where it came from.
 *
 * Takes the ids rather than reading them natively because the native side keys on the same ids the
 * store holds, and `cancel` is what removes them from that stored set.
 */
export function cancelAllNativeAlarms(alarms: { id: number }[]): void {
  const mod = nativeModule();
  if (!mod?.cancelAlarm) return;
  // Through the same collision-resolved mapping every other native call uses. This passed the raw
  // JS id — a `Date.now()` timestamp some 800 times larger than a Kotlin Int can hold — so the one
  // path whose entire job is leaving nothing behind was addressing request codes that either threw
  // or belonged to some other alarm. A wipe that silently fails to cancel is how the next person to
  // use the device gets woken by the last person's alarm.
  const nativeIds = nativeAlarmIds(alarms);
  for (const a of alarms) {
    try {
      mod.cancelAlarm(nativeIds.get(a.id) as number);
    } catch {
      // one that will not cancel must not stop the rest, or the wipe leaves a partial mess
    }
  }
}
