package expo.modules.smartwakealarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restores the alarms after a reboot, since AlarmManager entries do not survive one.
 *
 * Also listens for the two events that look like a reboot from an alarm's point of view: some
 * OEM skins deliver only `QUICKBOOT_POWERON`, and an app updated in place is restarted with its
 * alarms cleared and no BOOT_COMPLETED to tell it so.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
      // A clock or timezone change moves every wall-clock alarm. AlarmManager entries are absolute
      // instants, so flying somewhere else left tomorrow's 7am armed for what is now 2am, and
      // nothing put it right until the next reboot or app launch. Re-arming is idempotent, so
      // reacting to both is safe even when they arrive together.
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_TIME_CHANGED -> AlarmScheduler.onBootCompleted(context)
      else -> return
    }
  }
}
