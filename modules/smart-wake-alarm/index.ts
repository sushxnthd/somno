// JS-facing surface of the SmartWakeAlarm native Expo module.
// See android/ and ios/ for the platform implementations, and src/lib/alarmScheduler.ts for the
// store-integration layer that actually calls this. This file is intentionally thin.

import { requireNativeModule } from 'expo-modules-core';

export interface SmartWakeAlarmNativeModule {
  /**
   * Schedules (or reschedules, if `id` already exists) a native alarm.
   *
   * `timestampMs` is the absolute next-fire time, and the three that follow are the recurrence it
   * came from: the nominal minute past midnight, a seven-character day mask ('1'/'0', index 0 =
   * Monday, the app's own convention), and how many minutes early Smart Wake wants it.
   *
   * The recurrence is passed down rather than kept in JS because AlarmManager entries are one-shot
   * and JS is not running at 6am. With it, the native receiver arms the next morning as it fires,
   * and the boot receiver can restore everything after a restart.
   */
  scheduleAlarm(
    id: number,
    timestampMs: number,
    soundName: string,
    minuteOfDay: number,
    days: string,
    offsetMin: number
  ): void;
  /** Re-arms every alarm the native side remembers, from its stored recurrence. */
  rearmAll?(): void;
  /** Cancels a previously scheduled alarm by id. No-op if it doesn't exist. */
  cancelAlarm(id: number): void;
  /** If the app cold-started because the user tapped an alarm notification (iOS) or the
   * full-screen alarm Activity handed off to the RN layer (Android), returns the screen id to
   * navigate to ('G1') and clears the pending flag. Returns null otherwise. */
  /**
   * Cancels a pending snooze and restores the alarm's recurring schedule.
   *
   * Optional for the same reason as `consumePendingAlarm`: a JS bundle can be newer than the
   * native module it runs against, and callers must degrade rather than throw.
   */
  cancelSnooze?: (id: number) => boolean;
  /** Clears schedules written under a previous id scheme. Optional: newer than some builds. */
  migrateSchedules?: () => boolean;
  consumePendingAlarmScreen(): string | null;
  /**
   * The pending screen and the id of the alarm that caused it.
   *
   * Optional because a JS bundle can be newer than the native module it is running against — an
   * over-the-air-updated app on an older build. Callers try this and fall back to the screen-only
   * call, which is why both still exist.
   */
  consumePendingAlarm?: () => { screen: string; alarmId: number } | null;
  /** Android 12+ lets a user revoke exact-alarm permission, after which alarms still fire but may
   * drift by minutes. Always true on iOS and on Android below 12. */
  canScheduleExactAlarms?(): boolean;
  /** Silences a ringing alarm. Called from every choice on the alarm screen. */
  stopAlarmSound?(): void;
  /** Whether a tone is playing right now. */
  isAlarmSounding?(): boolean;
  /** Plays a tone once, for previewing it in the picker. */
  previewSound?(uri: string | null): void;
  /** Persists the vibrate preference where the alarm receiver can read it. */
  setVibrate?(enabled: boolean): void;
  /** The alarm tones this device actually has, as {uri, name}. */
  listAlarmSounds?(): { uri: string; name: string }[];
}

let nativeModule: SmartWakeAlarmNativeModule | null = null;

/** Lazily resolves the native module. Returns null on web or if the native module isn't linked
 * (e.g. running in plain Expo Go instead of a dev-client build with this module compiled in) —
 * callers must handle null and fail soft, never throw. */
export function getSmartWakeAlarmModule(): SmartWakeAlarmNativeModule | null {
  if (nativeModule) return nativeModule;
  try {
    nativeModule = requireNativeModule<SmartWakeAlarmNativeModule>('SmartWakeAlarm');
    return nativeModule;
  } catch {
    return null;
  }
}
