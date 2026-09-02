package expo.modules.smartwakealarm

import android.content.Context

/**
 * What the app needs to know when it cold-starts because an alarm fired: which screen to open, and
 * **which alarm did it**.
 *
 * The alarm id used to be dropped here. This stored a screen name and nothing else, so JS knew a
 * wake-up had happened but not whose, and `beginAlarmSession` guessed by looking for an enabled
 * alarm whose minute matched the one currently on screen. With one alarm that is right by accident.
 * With two alarms at the same time, or an alarm whose time had since been edited, or the 6:40 that
 * fired while the UI still showed the 7:15, it attributed the event to the wrong alarm — and then
 * snooze and dismiss operated on that wrong alarm, which is the part that actually costs someone a
 * morning. The id travels with the intent from AlarmReceiver all the way here; there was never a
 * reason to throw it away at the last step.
 *
 * Read once and cleared, so a later unrelated app open does not re-trigger the alarm screen.
 */
object PendingAlarmStore {
  private const val PREFS = "smart_wake_alarm_prefs"
  private const val KEY_PENDING_SCREEN = "pending_screen"
  private const val KEY_PENDING_ALARM_ID = "pending_alarm_id"

  /** No alarm id — the alarm demo, or a legacy value written before ids were carried. */
  const val NO_ALARM_ID = -1

  fun setPendingScreen(context: Context, screen: String, alarmId: Int = NO_ALARM_ID) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_PENDING_SCREEN, screen)
      .putInt(KEY_PENDING_ALARM_ID, alarmId)
      .apply()
  }

  /** The pending screen and the alarm that caused it, or null. Cleared by reading. */
  fun consume(context: Context): Pair<String, Int>? {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val screen = prefs.getString(KEY_PENDING_SCREEN, null) ?: return null
    val alarmId = prefs.getInt(KEY_PENDING_ALARM_ID, NO_ALARM_ID)
    prefs.edit().remove(KEY_PENDING_SCREEN).remove(KEY_PENDING_ALARM_ID).apply()
    return Pair(screen, alarmId)
  }
}
