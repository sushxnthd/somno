import UserNotifications

/// Handles the two moments a Somno alarm notification matters while native code is in control:
///  - delivered while the app happens to be foregrounded/backgrounded-but-alive -> start the
///    looping alarm tone (see AlarmAudioManager).
///  - tapped by the user -> record "open G1 next" (read once by JS via
///    `consumePendingAlarmScreen()`, same contract as the Android module).
final class NotificationDelegateProxy: NSObject, UNUserNotificationCenterDelegate {
  static let shared = NotificationDelegateProxy()
  private var installed = false

  func install() {
    guard !installed else { return }
    installed = true
    UNUserNotificationCenter.current().delegate = self

    let category = UNNotificationCategory(
      identifier: "SOMNO_ALARM",
      actions: [],
      intentIdentifiers: [],
      options: [.customDismissAction]
    )
    UNUserNotificationCenter.current().setNotificationCategories([category])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    if isSomnoAlarm(notification.request.content.userInfo) {
      AlarmAudioManager.shared.startLoopingAlarmTone()
    }
    completionHandler([.banner, .sound, .list])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let userInfo = response.notification.request.content.userInfo
    if isSomnoAlarm(userInfo) {
      PendingAlarmStore.setPendingScreen("G1")
    }
    completionHandler()
  }

  private func isSomnoAlarm(_ userInfo: [AnyHashable: Any]) -> Bool {
    (userInfo["somno_open_screen"] as? String) == "G1"
  }
}
