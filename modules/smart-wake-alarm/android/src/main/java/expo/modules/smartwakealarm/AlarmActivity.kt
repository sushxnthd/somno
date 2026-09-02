package expo.modules.smartwakealarm

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager

/**
 * Transparent hand-off activity: shown full-screen over the lock screen (manifest already sets
 * `showWhenLocked`/`turnScreenOn`), it does nothing visible itself — it immediately records "open
 * G1 next" via [PendingAlarmStore] and launches the app's MainActivity, then finishes. All of the
 * actual alarm UI (the "Good morning" / "Check in" / "Just stop the alarm" screen, the snooze
 * logic, the hard-capped max-snooze rule) already exists as real, tested React Native screens
 * (src/screens/alarm/G1Screen.tsx, G3Screen.tsx) and store actions (useSomnoStore.ts's `snooze`,
 * `stopAlarm`, `computeAlarm`) — this class's only job is "wake the device and get the JS layer
 * on screen G1", never to reimplement any of that logic natively.
 */
class AlarmActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      )
    }

    // The id the receiver put in this intent, carried through instead of dropped. Without it JS
    // has to guess which alarm rang, and a wrong guess sends snooze and dismiss to the wrong one.
    val firedAlarmId = intent?.getIntExtra(AlarmReceiver.EXTRA_ALARM_ID, PendingAlarmStore.NO_ALARM_ID)
      ?: PendingAlarmStore.NO_ALARM_ID
    PendingAlarmStore.setPendingScreen(this, "G1", firedAlarmId)

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
      ?: Intent().setClassName(packageName, "$packageName.MainActivity")
    launchIntent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_CLEAR_TOP or
        Intent.FLAG_ACTIVITY_SINGLE_TOP
    )
    startActivity(launchIntent)
    finish()
  }
}
