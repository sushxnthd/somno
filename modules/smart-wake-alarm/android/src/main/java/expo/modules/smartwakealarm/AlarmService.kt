package expo.modules.smartwakealarm

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Holds a ringing alarm for as long as it rings.
 *
 * ## Why a service
 *
 * The tone used to be started by a singleton MediaPlayer inside `BroadcastReceiver.onReceive`. That
 * works right up until it doesn't, and the way it fails is the worst possible one for an alarm
 * clock: a broadcast receiver is only guaranteed to keep its process alive *for the duration of
 * onReceive*. The moment that method returns, the app is an ordinary background process with no
 * component running, and Android is free to kill it — taking the MediaPlayer, the escalation
 * handler and the vibration with it. On a device under memory pressure at 6am, which is exactly
 * when a phone that has been idle all night gets trimmed, the alarm rings for a second and stops.
 *
 * A foreground service is the documented answer. Its notification is the alarm notification, so the
 * user sees exactly one thing, and the process stays alive while it is running.
 *
 * ## What it does not do
 *
 * No decisions. The service rings and stops; every rule about snooze counts, check-ins and caps
 * stays in the React Native layer where it is tested. This class exists so that the JS layer is
 * still *there* to be asked.
 */
class AlarmService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.smartwakealarm.START"
    const val ACTION_STOP = "expo.modules.smartwakealarm.STOP"
    const val EXTRA_SOUND_NAME = "sound_name"

    /**
     * The notification id the ringing alarm occupies.
     *
     * Deliberately one fixed id rather than the alarm's own. Only one alarm can be ringing at a
     * time — the second one to fire replaces the first — and a per-alarm id meant a notification
     * could be left behind by an alarm that was never the one the user dismissed.
     */
    const val NOTIFICATION_ID = 424242

    /**
     * The running service, when there is one.
     *
     * The point of holding it is that stopping becomes an ordinary in-process method call rather
     * than an Intent. `startService(ACTION_STOP)` is the only lever the companion had, and it is a
     * *start*: on Android 12+ it can be refused outright from the background, and even when it
     * succeeds it is asynchronous. Either way the audio was silenced but the service itself stayed
     * in the foreground, holding a notification and a running process, with nothing left that would
     * ever ask it to stop.
     */
    @Volatile private var running: AlarmService? = null

    /**
     * Set when a stop is requested, cleared when a start is.
     *
     * Closes the race the Intent version cannot: `start` on O+ is `startForegroundService`, which
     * returns before `onStartCommand` runs, so a stop arriving in that window has nothing to act on
     * and the service then comes up ringing with the user already gone. The flag is checked the
     * moment `onStartCommand` runs, so a start that has been overtaken tears itself down instead.
     */
    @Volatile private var stopRequested = false

    fun start(context: Context, alarmId: Int, soundName: String?) {
      stopRequested = false
      val intent = Intent(context, AlarmService::class.java).apply {
        action = ACTION_START
        putExtra(AlarmReceiver.EXTRA_ALARM_ID, alarmId)
        putExtra(EXTRA_SOUND_NAME, soundName)
      }
      try {
        // startForegroundService on O+, and the service must call startForeground within a few
        // seconds or the system throws. onStartCommand does it first thing.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
      } catch (_: Exception) {
        /**
         * Ring anyway.
         *
         * Android 12 forbids starting a foreground service from the background, with an exemption
         * for a receiver woken by an *exact* alarm. Somno's alarms are exact — except on a device
         * where the user has revoked exact-alarm permission, where [AlarmScheduler.arm] falls back
         * to `setAndAllowWhileIdle` rather than crashing. That fallback is the one case where the
         * exemption may not apply, and it would throw `ForegroundServiceStartNotAllowedException`
         * here: precisely the user whose alarm is already degraded would get no alarm at all.
         *
         * So on failure the alarm rings the old way — a notification and the player, owned by the
         * process rather than by a service. That is weaker (nothing holds the process up, which is
         * the whole reason the service exists) but it is an alarm, and silence is not.
         */
        try {
          val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
          nm.notify(NOTIFICATION_ID, buildNotification(context, alarmId))
        } catch (_: Exception) {
          // No notification is survivable; no sound is not. Fall through and ring.
        }
        AlarmSoundPlayer.start(context, soundName, AlarmScheduler.vibrateFor(context))
      }
    }

    /**
     * Ends the alarm completely: audio, vibration, foreground state, notification, service.
     *
     * Three mechanisms, in order of how much they can be trusted, because a half-stopped alarm is
     * its own bug — silent, but still a foreground service pinning the process with an undismissable
     * notification over it.
     */
    fun stop(context: Context) {
      // 1. Silence, directly and synchronously.
      //
      // The spec's hardest safety rule is that stopping the alarm always works, immediately. The
      // player is a process-wide singleton and `stop()` is idempotent, so this costs nothing and
      // means silencing never depends on anything below it succeeding.
      stopRequested = true
      AlarmSoundPlayer.stop()

      // 2. Tear the service down in-process. No Intent, no start, nothing the system can refuse.
      val service = running
      if (service != null) {
        service.stopRinging()
      } else {
        // 3. Only if there is no instance to call — which normally means nothing is running, but
        // would also cover a service the companion lost track of. `startService` is allowed to fail
        // here; by this point the alarm is already silent and the notification is about to go.
        val intent = Intent(context, AlarmService::class.java).apply { action = ACTION_STOP }
        try {
          context.startService(intent)
        } catch (_: Exception) {
          // Nothing running to stop is not an error, and a background start can be refused.
        }
      }
      clearNotification(context)
    }

    /**
     * Takes the alarm notification down.
     *
     * Separate and public because the notification outlives the service in one case that matters:
     * the service is `setOngoing`, so if the process is killed while ringing, the notification can
     * be left on screen with nothing behind it. Anything that ends an alarm calls this.
     */
    fun clearNotification(context: Context) {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.cancel(NOTIFICATION_ID)
    }

    /**
     * The ringing alarm's notification.
     *
     * On the companion rather than the instance because the fallback path in [start] has no service
     * to build it from, and two builders would be two chances for the fallback notification to
     * differ from the real one.
     */
    fun buildNotification(context: Context, alarmId: Int): Notification {
      AlarmReceiver.ensureChannel(context)

      val fullScreenIntent = Intent(context, AlarmActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        putExtra(AlarmReceiver.EXTRA_ALARM_ID, alarmId)
      }
      val pending = PendingIntent.getActivity(
        context,
        alarmId,
        fullScreenIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

      return NotificationCompat.Builder(context, AlarmReceiver.CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setContentTitle("Somno")
        .setContentText("Good morning — time to check in.")
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setFullScreenIntent(pending, true)
        .setContentIntent(pending)
        .setOngoing(true)
        // Not auto-cancel: tapping it opens the alarm screen, and the alarm is still ringing until
        // something stops it. The notification going away on tap while the tone continued was its
        // own small confusion.
        .setAutoCancel(false)
        .build()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    running = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    running = this
    if (intent?.action == ACTION_STOP) {
      stopRinging()
      return START_NOT_STICKY
    }

    val alarmId = intent?.getIntExtra(AlarmReceiver.EXTRA_ALARM_ID, -1) ?: -1
    val soundName = intent?.getStringExtra(EXTRA_SOUND_NAME)

    // Android still requires startForeground promptly after a startForegroundService, even when the
    // start is going to be abandoned — skipping it here and calling stopSelf would leave the system
    // waiting for a foreground promise that never arrives, and it kills the app for that. So go
    // foreground, then immediately come back down.
    startForeground(NOTIFICATION_ID, buildNotification(this, alarmId))

    /**
     * A stop that overtook this start.
     *
     * `startForegroundService` returns before this method runs, so a dismiss landing in that window
     * had nothing to act on and the service came up ringing at someone who had already stopped it.
     */
    if (stopRequested) {
      stopRinging()
      return START_NOT_STICKY
    }

    AlarmSoundPlayer.start(this, soundName, AlarmScheduler.vibrateFor(this))

    // START_NOT_STICKY: if the system does kill this, it must not silently restart the alarm later
    // with no user in front of it. A missed alarm is bad; one that rings at an arbitrary time is
    // worse and is the kind of thing that gets an app uninstalled.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    // Cleared before the teardown, not after: `stopRinging` calls `stopSelf`, and a stale reference
    // here would send the next `stop()` to a dead instance instead of falling through to the Intent.
    if (running === this) running = null
    stopRinging()
    super.onDestroy()
  }

  private fun stopRinging() {
    if (running === this) running = null
    AlarmSoundPlayer.stop()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE)
    else @Suppress("DEPRECATION") stopForeground(true)
    clearNotification(this)
    stopSelf()
  }

}
