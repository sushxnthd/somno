package expo.modules.smartwakealarm

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS-facing native module. Thin wrapper — actual scheduling lives in [AlarmScheduler], and the
 * "did we cold-start from a tapped/fired alarm" flag lives in [PendingAlarmStore]. Kept this way
 * so [AlarmReceiver] / [AlarmActivity] (which run without a JS runtime available) can share the
 * same scheduling/flag logic without going through the module boundary.
 */
class SmartWakeAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmartWakeAlarm")

    Function("scheduleAlarm") { id: Int, timestampMs: Double, soundName: String, minuteOfDay: Int, days: String, offsetMin: Int ->
      val context = appContext.reactContext ?: return@Function
      AlarmScheduler.schedule(context, id, timestampMs.toLong(), soundName, minuteOfDay, days, offsetMin)
    }

    /**
     * Re-arms everything from what was last scheduled.
     *
     * Called at launch after the JS layer has reconciled, as a safety net: if the app was killed
     * for long enough that a firing was missed entirely, or a manufacturer's battery manager
     * dropped the pending intents, this puts the schedule back without waiting for the next reboot.
     */
    /** Clears schedules written under the previous id scheme. Safe to call repeatedly. */
    Function("migrateSchedules") {
      val context = appContext.reactContext ?: return@Function false
      AlarmScheduler.migrateIfNeeded(context)
      true
    }

    Function("rearmAll") {
      val context = appContext.reactContext ?: return@Function
      AlarmScheduler.rearmAll(context)
    }

    /**
     * Rings this alarm again in [minutes]. What "snooze" has always claimed to do.
     *
     * Silencing the tone is [stopAlarmSound]'s job and happens first, from JS; this is the half
     * that was missing entirely.
     */
    Function("snoozeAlarm") { id: Int, minutes: Int ->
      // A snooze ends this ringing: stop the tone and take the notification down before re-arming.
      appContext.reactContext?.let { AlarmService.stop(it) }
      val context = appContext.reactContext ?: return@Function
      AlarmScheduler.snooze(context, id, minutes)
    }

    /** Drop a pending snooze and put the recurring schedule back. See AlarmScheduler. */
    Function("cancelSnooze") { id: Int ->
      val context = appContext.reactContext ?: return@Function false
      AlarmService.stop(context)
      AlarmScheduler.cancelSnoozeAndRestore(context, id)
      true
    }

    Function("cancelAlarm") { id: Int ->
      val context = appContext.reactContext ?: return@Function
      AlarmScheduler.cancel(context, id)
    }

    // Whether exact alarms are permitted right now. Android 12 lets a user revoke that, and an
    // alarm app that silently starts firing late owes them the truth about it.
    /**
     * Silences a ringing alarm. Called the moment the user chooses anything on the alarm screen —
     * "just stop", snooze, or start a check-in — because a tone still playing under a face scan
     * would make the scan unusable and the choice feel ignored.
     */
    Function("stopAlarmSound") {
      val context = appContext.reactContext ?: return@Function false
      // Through the service, which owns both the tone and the ongoing notification. Stopping the
      // player alone left the notification on screen with nothing behind it — a permanent "Somno,
      // time to check in" the user could not dismiss because it was marked ongoing.
      AlarmService.stop(context)
      AlarmSoundPlayer.stop()
      true
    }

    Function("isAlarmSounding") {
      AlarmSoundPlayer.isPlaying()
    }

    /** Plays the given tone once, for previewing one in the sound picker. Never loops. */
    Function("previewSound") { uri: String? ->
      val context = appContext.reactContext ?: return@Function
      AlarmSoundPlayer.preview(context, uri)
    }

    Function("setVibrate") { enabled: Boolean ->
      val context = appContext.reactContext ?: return@Function
      AlarmScheduler.setVibrate(context, enabled)
    }

    /**
     * The alarm tones this device actually has.
     *
     * The sound picker used to offer invented names that no code could play. These are the real
     * ringtones from RingtoneManager, so picking one selects a file that exists.
     */
    Function("listAlarmSounds") {
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, String>>()
      val manager = android.media.RingtoneManager(context)
      manager.setType(android.media.RingtoneManager.TYPE_ALARM)
      val cursor = manager.cursor
      val out = mutableListOf<Map<String, String>>()
      try {
        while (cursor.moveToNext()) {
          val position = cursor.position
          out.add(
            mapOf(
              "uri" to manager.getRingtoneUri(position).toString(),
              "name" to cursor.getString(android.media.RingtoneManager.TITLE_COLUMN_INDEX)
            )
          )
        }
      } catch (_: Exception) {
        // A device with no alarm tones at all still gets the system default below.
      }
      if (out.isEmpty()) {
        out.add(mapOf("uri" to AlarmSoundPlayer.defaultAlarmUri().toString(), "name" to "Default alarm"))
      }
      out
    }

    /**
     * Whether the alarm can still show itself over the lock screen. False on Android 14+ once the
     * user has revoked full-screen-intent access, which otherwise degrades the alarm to a banner
     * with no indication that it has.
     */
    Function("canUseFullScreenIntent") {
      val context = appContext.reactContext ?: return@Function true
      AlarmScheduler.canUseFullScreenIntent(context)
    }

    /** Opens the system screen where full-screen-intent access is granted back. */
    Function("openFullScreenIntentSettings") {
      val context = appContext.reactContext ?: return@Function
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return@Function
      try {
        val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
          data = android.net.Uri.fromParts("package", context.packageName, null)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      } catch (_: Exception) {
        // Nothing to open on a device without the screen; the warning text still explains it.
      }
    }

    Function("canScheduleExactAlarms") {
      val context = appContext.reactContext ?: return@Function true
      AlarmScheduler.canScheduleExact(context)
    }

    Function("consumePendingAlarmScreen") {
      val context = appContext.reactContext ?: return@Function null
      PendingAlarmStore.consume(context)?.first
    }

    /**
     * The pending screen *and* the alarm that caused it.
     *
     * Separate from the older screen-only call so an app bundle built before this module still
     * works: JS tries this first and falls back. Returns a map rather than a pair so the
     * JS side reads it by name.
     */
    Function("consumePendingAlarm") {
      val context = appContext.reactContext ?: return@Function null
      val pending = PendingAlarmStore.consume(context) ?: return@Function null
      mapOf("screen" to pending.first, "alarmId" to pending.second)
    }
  }
}
