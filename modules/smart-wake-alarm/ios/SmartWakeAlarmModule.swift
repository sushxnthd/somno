import ExpoModulesCore
import UserNotifications

/// JS-facing native module (iOS side). Mirrors the Android module's `scheduleAlarm` /
/// `cancelAlarm` / `consumePendingAlarmScreen` API — see modules/smart-wake-alarm/index.ts.
///
/// Platform-constraint note (documented in the technical spec too, keep this in sync): Apple
/// gives third-party apps no mechanism to force themselves to the foreground the way Android's
/// full-screen intent does. What IS possible, and what this implements:
///   1. A real local notification scheduled for the alarm time, with a custom sound.
///   2. A best-effort looping alarm tone via a background `audio`-mode `AVAudioPlayer`
///      (see AlarmAudioManager.swift) — reliable while the app is still alive in the background,
///      which is the same trick every third-party iOS alarm app uses, with the same platform
///      caveat: iOS can still suspend a backgrounded process under memory pressure, and the user
///      ultimately has to tap the notification (or open the app) to reach the full G1 check-in
///      screen. There is no way around that on iOS — don't remove this comment if "fixing" this
///      later, it's a platform limitation, not a bug in this code.
public class SmartWakeAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SmartWakeAlarm")

    OnCreate {
      NotificationDelegateProxy.shared.install()
    }

    Function("scheduleAlarm") { (id: Int, timestampMs: Double, soundName: String) in
      AlarmScheduling.schedule(id: id, timestampMs: timestampMs, soundName: soundName)
    }

    Function("cancelAlarm") { (id: Int) in
      AlarmScheduling.cancel(id: id)
    }

    Function("consumePendingAlarmScreen") { () -> String? in
      PendingAlarmStore.consume()
    }
  }
}
