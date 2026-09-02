import Foundation
import UserNotifications

/// Local-notification-based alarm scheduling. Alarm identity/next-fire-time bookkeeping is owned
/// by the JS side (src/lib/alarmScheduler.ts) exactly like the Android implementation — this just
/// turns "deliver a notification at timestampMs, with this sound" on and off.
enum AlarmScheduling {
  static func requestIdentifier(for id: Int) -> String { "somno-alarm-\(id)" }

  static func schedule(id: Int, timestampMs: Double, soundName: String) {
    let center = UNUserNotificationCenter.current()
    let identifier = requestIdentifier(for: id)
    center.removePendingNotificationRequests(withIdentifiers: [identifier])

    let content = UNMutableNotificationContent()
    content.title = "Somno"
    content.body = "Good morning — time to check in."
    content.categoryIdentifier = "SOMNO_ALARM"
    // iOS caps a single notification sound at 30s; this is the platform's own limit, not
    // something this code can extend. The looping continuation (if the app is still alive in
    // the background) is handled by AlarmAudioManager, started from NotificationDelegateProxy
    // when the notification is delivered while foregrounded/backgrounded-but-alive.
    if soundName == "default" || soundName.isEmpty {
      content.sound = .default
    } else {
      content.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: "\(soundName).caf"))
    }
    content.userInfo = ["somno_open_screen": "G1", "alarm_id": id]

    let date = Date(timeIntervalSince1970: timestampMs / 1000)
    let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
    let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)

    let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
    center.add(request) { error in
      if let error = error {
        print("[SmartWakeAlarm] failed to schedule alarm \(id): \(error)")
      }
    }
  }

  static func cancel(id: Int) {
    let identifier = requestIdentifier(for: id)
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
  }
}
