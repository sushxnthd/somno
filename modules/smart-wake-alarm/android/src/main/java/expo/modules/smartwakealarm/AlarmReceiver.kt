package expo.modules.smartwakealarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

/**
 * Fires when [AlarmScheduler]'s AlarmManager entry goes off. Two things happen, matching how
 * every full-screen-intent alarm app on Android works:
 *  1. Post a high-priority notification with a full-screen intent — on Android 14+, when the app
 *     has declared itself a core "alarm" app via the Play Console (see the technical doc's
 *     privacy/regulatory notes — this requires a store declaration at publish time, not
 *     something this code alone can grant), the system auto-launches that intent's Activity over
 *     the lock screen. On older versions / before that declaration is approved, the full-screen
 *     intent still shows as a high-priority heads-up notification the user taps to open.
 *  2. Also attempt to start [AlarmActivity] directly — belt-and-suspenders, since some OEM
 *     variants respect a direct startActivity from a foreground-capable context better than
 *     relying solely on the notification's full-screen intent.
 */
class AlarmReceiver : BroadcastReceiver() {
  companion object {
    const val EXTRA_ALARM_ID = "extra_alarm_id"
    const val CHANNEL_ID = "somno_smart_wake"

      fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      val channel = NotificationChannel(CHANNEL_ID, "Smart Wake alarms", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Somno's alarm check-in"
        enableVibration(true)
        setBypassDnd(true)
        // The tone is played by AlarmSoundPlayer on the alarm stream; a second one from the channel
        // would double up. The channel stays silent on purpose.
        setSound(null, null)
      }
      nm.createNotificationChannel(channel)
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    val alarmId = intent.getIntExtra(EXTRA_ALARM_ID, -1)
    val soundName = AlarmScheduler.soundFor(context, alarmId)

    // Arm the next occurrence first, before anything that can fail. An AlarmManager entry is a
    // one-shot, so this is the only moment a repeating alarm gets its next morning — and if the
    // ringing below were to throw on some device, the chain must not break with it.
    AlarmScheduler.rearmAfterFiring(context, alarmId)

    ensureChannel(context)

    val fullScreenIntent = Intent(context, AlarmActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      putExtra(EXTRA_ALARM_ID, alarmId)
      putExtra("sound_name", soundName)
    }

    /**
     * Hand the ringing to a foreground service rather than doing it here.
     *
     * A BroadcastReceiver's process is only guaranteed to survive for the length of onReceive. The
     * tone, the escalation handler and the vibration used to be owned by a singleton started right
     * here, so once this method returned the app was an ordinary background process with nothing
     * running and Android was free to kill it — and 6am on a phone that has been idle all night is
     * exactly when it does. The alarm rang for a moment and stopped.
     *
     * The service owns the notification too, which is what makes it a foreground service and what
     * makes there be exactly one alarm notification rather than one from here and one from there.
     */
    AlarmService.start(context, alarmId, soundName)

    // Belt-and-suspenders direct launch attempt (see class doc comment).
    try {
      context.startActivity(fullScreenIntent)
    } catch (_: Exception) {
      // If this fails (background-start restrictions on some OEM/Android versions), the
      // full-screen-intent notification above is still the primary, documented mechanism.
    }
  }

}
