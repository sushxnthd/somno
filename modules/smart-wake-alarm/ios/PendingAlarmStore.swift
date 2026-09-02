import Foundation

/// Same contract as the Android module's PendingAlarmStore.kt — a one-shot flag JS reads once on
/// cold start to know whether to navigate straight to the G1 alarm-check-in screen.
enum PendingAlarmStore {
  private static let key = "somno_pending_alarm_screen"

  static func setPendingScreen(_ screen: String) {
    UserDefaults.standard.set(screen, forKey: key)
  }

  static func consume() -> String? {
    let value = UserDefaults.standard.string(forKey: key)
    if value != nil {
      UserDefaults.standard.removeObject(forKey: key)
    }
    return value
  }
}
