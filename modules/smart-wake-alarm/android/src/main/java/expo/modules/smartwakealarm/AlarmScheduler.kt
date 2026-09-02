package expo.modules.smartwakealarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build

/**
 * Wraps [AlarmManager] scheduling for Somno's alarms. Uses `setExactAndAllowWhileIdle` (falls
 * back to `setExact` pre-M) rather than `setAlarmClock` — `setAlarmClock` shows a persistent
 * "next alarm" icon in the status bar and is really meant for a device's single system clock
 * app; a wellness app scheduling its own reminder-style alarm fits the `setExactAndAllowWhileIdle`
 * + `USE_FULL_SCREEN_INTENT` pattern better (this is also what most third-party alarm apps use).
 *
 * Alarm identity + next-fire-time bookkeeping intentionally stays entirely on the JS side
 * (src/lib/alarmScheduler.ts already tracks the Somno `Alarm[]` array and recomputes the next
 * matching day/time) — this class just turns "fire a PendingIntent at timestampMs" on and off.
 */
object AlarmScheduler {
  private const val PREFS = "smart_wake_alarm_prefs"
  private const val SOUND_PREFIX = "sound_"
  private const val MINUTE_PREFIX = "minute_"
  private const val DAYS_PREFIX = "days_"
  private const val OFFSET_PREFIX = "offset_"
  private const val SNOOZE_PREFIX = "snooze_at_"
  private const val IDS_KEY = "ids"
  private const val VIBRATE_KEY = "vibrate"
  private const val SCHEDULE_VERSION_KEY = "schedule_version"

  /**
   * The generation of alarm ids this build writes.
   *
   * Bumped when the *meaning* of a stored id changes. It changed once: JS alarm ids are
   * `Date.now()` values far past what an Int holds, and they used to be passed straight across the
   * bridge, so whatever request codes ended up here were whatever the converter produced. They are
   * now folded deterministically into 31 bits on the JS side.
   *
   * That leaves an upgrade hazard with a nasty shape. The old ids are still in this store, and
   * `rearmAll` faithfully re-arms every id it finds — while JS schedules the *new* mapped ids. The
   * user ends up with two alarms for every one they set: a ghost on the old code that nothing in
   * the app can cancel because nothing in the app knows that id any more, and the real one.
   *
   * `migrateIfNeeded` clears the legacy entries once. Losing them is safe *only* because of when it
   * runs: JS calls it at launch immediately before reconciling from its own alarm list, so every
   * alarm the user actually has is re-scheduled seconds later under an id both sides agree on. It is
   * deliberately not called from [rearmAll] — see the note there for why that would be worse than
   * the ghost it prevents.
   */
  private const val SCHEDULE_VERSION = 2

  private fun manager(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun pendingIntent(context: Context, id: Int): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).apply {
      putExtra(AlarmReceiver.EXTRA_ALARM_ID, id)
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getBroadcast(context, id, intent, flags)
  }

  /**
   * Schedules an alarm, and remembers enough about it to schedule the *next* one without help.
   *
   * The recurrence is stored natively on purpose. AlarmManager entries are one-shot: an alarm that
   * fires on Tuesday says nothing about Wednesday, and this app used to have no answer for that —
   * the only thing that ever armed an alarm was the JS layer at app launch, so a repeating alarm
   * rang once and then only if the user happened to open the app again before the next morning.
   * A reboot wiped everything for the same reason. With the day mask and the minute held here,
   * [AlarmReceiver] re-arms itself the moment it fires and [BootReceiver] restores everything.
   *
   * @param minuteOfDay minutes past midnight of the alarm's *nominal* time
   * @param days seven characters, '1' or '0', index 0 = Monday (the app's own convention)
   * @param offsetMin how many minutes early Smart Wake wants it; 0 for a plain alarm
   */
  fun schedule(
    context: Context,
    id: Int,
    timestampMs: Long,
    soundName: String,
    minuteOfDay: Int,
    days: String,
    offsetMin: Int
  ) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val ids = prefs.getStringSet(IDS_KEY, emptySet())!!.toMutableSet()
    ids.add(id.toString())
    prefs.edit()
      .putString(SOUND_PREFIX + id, soundName)
      .putInt(MINUTE_PREFIX + id, minuteOfDay)
      .putString(DAYS_PREFIX + id, days)
      .putInt(OFFSET_PREFIX + id, offsetMin)
      .putStringSet(IDS_KEY, ids)
      .apply()

    /**
     * A pending snooze wins over the recurrence.
     *
     * The JS layer reconciles every enabled alarm through this function at launch and whenever the
     * alarm list changes, always with the *next recurring* fire time. A snooze occupies the same
     * pending intent, so a reconcile during one replaced it with tomorrow morning — and the user,
     * who had pressed snooze and gone back to sleep, was never rung again. Reopening the app in
     * those nine minutes was enough to do it.
     *
     * The recurrence written above is still stored, so the moment the snooze fires or is cancelled
     * the normal schedule resumes from it.
     */
    val snoozeAt = snoozePendingAt(context, id)
    arm(context, id, snoozeAt ?: timestampMs)
  }

  private fun arm(context: Context, id: Int, timestampMs: Long) {
    val pi = pendingIntent(context, id)
    val am = manager(context)
    when {
      // Android 12 made exact alarms a permission, and calling for one without it throws
      // SecurityException — which, from an alarm scheduled in the background, is a crash the user
      // never sees coming and Play counts against the app. USE_EXACT_ALARM covers this on 33+
      // (Somno qualifies: it is an alarm clock), but on 12 and 12L the user can revoke it in
      // Settings, so the capability has to be asked for rather than assumed.
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms() -> {
        // Inexact, but it still fires and still wakes the device — a wake-up a few minutes late is
        // a far better outcome than an alarm that never rings because scheduling it crashed.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestampMs, pi)
      }
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.M -> {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestampMs, pi)
      }
      else -> {
        am.setExact(AlarmManager.RTC_WAKEUP, timestampMs, pi)
      }
    }
  }

  /**
   * Re-arms an alarm that is being snoozed, [minutes] from now.
   *
   * The app had a snooze button, a snooze counter, a snooze cap and a face scan that chose the
   * snooze length — and nothing that made the alarm ring again. Tapping "Snooze 7 minutes" stopped
   * the tone, incremented a number and returned to the alarm screen; the alarm was over. Somebody
   * who trusted it went back to sleep with no alarm running at all, which is worse than an alarm
   * that never rang in the first place, because they believed one was set.
   *
   * Deliberately reuses the alarm's own id and PendingIntent. That replaces the next-morning entry
   * [rearmAfterFiring] set a moment ago, and when the snooze fires [AlarmReceiver] re-arms the
   * following occurrence exactly as a normal firing does — so the daily chain survives a snooze
   * rather than being consumed by it.
   */
  fun snooze(context: Context, id: Int, minutes: Int) {
    val safeMinutes = minutes.coerceIn(1, 60)
    val at = System.currentTimeMillis() + safeMinutes * 60_000L
    // Remembered so a re-arm cannot silently eat it. See [snoozePendingAt].
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(SNOOZE_PREFIX + id, at).apply()
    arm(context, id, at)
  }

  /**
   * When this alarm's snooze is due, or null if none is pending.
   *
   * A snooze occupies the alarm's own pending intent, so anything that re-arms from the stored
   * recurrence overwrites it with tomorrow's occurrence — and the snooze the user is asleep on
   * never rings. That was survivable while re-arming only happened at boot; it stopped being
   * survivable when [BootReceiver] started listening for `TIME_SET`, which the system broadcasts on
   * every automatic clock sync. A phone that syncs its time during a nine-minute snooze would have
   * quietly cancelled it — as would the JS layer reconciling, which happens every time the app is
   * opened.
   *
   * Times in the past are ignored: a snooze that has already fired is not pending, and the key is
   * cleared when it does.
   */
  private fun snoozePendingAt(context: Context, id: Int): Long? {
    val at = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(SNOOZE_PREFIX + id, 0L)
    return if (at > System.currentTimeMillis()) at else null
  }

  /** Forgets a snooze, because it fired or was cancelled. */
  private fun clearSnooze(context: Context, id: Int) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(SNOOZE_PREFIX + id).apply()
  }

  /**
   * Cancel a snooze that has not fired yet, and put the alarm's normal schedule back.
   *
   * Both halves matter, and neither was happening. `snooze` re-arms the *same* pending intent id,
   * because that is what makes the snooze ring with the right tone and reach the right receiver —
   * but it also means the snooze has overwritten the next recurring occurrence. So a user who
   * snoozed and then pressed "Just stop the alarm" got two wrong things at once: the snooze still
   * fired several minutes later, on an alarm they had explicitly stopped, and tomorrow's alarm had
   * been replaced by that snooze and was gone.
   *
   * Cancel then re-arm from the stored schedule fixes both. `rearmAfterFiring` already computes the
   * next occurrence from the alarm's own days and minute, which is exactly the schedule to restore.
   * Idempotent: cancelling a snooze that was never armed just re-arms what was already there.
   */
  fun cancelSnoozeAndRestore(context: Context, id: Int) {
    // Only the pending intent. `cancel` also erases the alarm's stored schedule — its minute, its
    // day mask, its tone — and removes it from the id set, which is right when the user deletes an
    // alarm and catastrophic here: `rearmAfterFiring` then reads a minute of -1, `nextFireAfter`
    // returns null, and it silently returns without arming anything. Stopping a snoozed alarm
    // deleted that alarm permanently. The schedule is exactly what this function exists to restore,
    // so it must survive the cancel.
    manager(context).cancel(pendingIntent(context, id))
    clearSnooze(context, id)
    rearmAfterFiring(context, id)
  }

  /** Whether this device will honour an exact alarm right now. Surfaced to JS so the alarm UI can
   * tell the user their wake-up may drift instead of silently degrading. */
  fun canScheduleExact(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager(context).canScheduleExactAlarms()

  /**
   * Whether the alarm will be allowed to put itself over the lock screen.
   *
   * Android 14 made full-screen intents a permission the user can take away, and taking it away is
   * silent: `setFullScreenIntent` still succeeds, the notification still posts, and it simply
   * arrives as an ordinary heads-up banner instead of launching the alarm activity. For an app
   * whose alarm *is* a full-screen intent, that is the difference between waking up to the alarm
   * screen and waking up to a notification you slept through — with nothing anywhere saying so.
   *
   * The app already warns when exact alarms are unavailable. This is the same class of silent
   * degradation and now gets the same treatment.
   */
  fun canUseFullScreenIntent(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    return try {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
      nm.canUseFullScreenIntent()
    } catch (_: Exception) {
      // An OEM that does not implement the query is not evidence that the alarm is broken.
      true
    }
  }

  fun cancel(context: Context, id: Int) {
    manager(context).cancel(pendingIntent(context, id))
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val ids = prefs.getStringSet(IDS_KEY, emptySet())!!.toMutableSet()
    ids.remove(id.toString())
    prefs.edit()
      .remove(SOUND_PREFIX + id)
      .remove(MINUTE_PREFIX + id)
      .remove(DAYS_PREFIX + id)
      .remove(OFFSET_PREFIX + id)
      .remove(SNOOZE_PREFIX + id)
      .putStringSet(IDS_KEY, ids)
      .apply()
  }

  /**
   * The next time this alarm should ring after [afterMs], or null if it repeats on no days.
   *
   * Mirrors `nextFireTimestamp` in src/lib/alarmScheduler.ts, including its Monday-first day
   * indexing — the two have to agree, or an alarm would move the first time the app reconciled it.
   * The Smart Wake offset is subtracted last, and the result must still be in the future, so an
   * alarm whose offset would place it a moment ago rolls to the following day rather than firing
   * immediately.
   */
  fun nextFireAfter(context: Context, id: Int, afterMs: Long): Long? {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val minuteOfDay = prefs.getInt(MINUTE_PREFIX + id, -1)
    val days = prefs.getString(DAYS_PREFIX + id, null)
    if (minuteOfDay < 0 || days == null || days.length != 7 || !days.contains('1')) return null
    val offsetMin = prefs.getInt(OFFSET_PREFIX + id, 0)

    val cal = java.util.Calendar.getInstance()
    cal.timeInMillis = afterMs
    for (offsetDays in 0..7) {
      val c = cal.clone() as java.util.Calendar
      c.add(java.util.Calendar.DAY_OF_YEAR, offsetDays)
      c.set(java.util.Calendar.HOUR_OF_DAY, minuteOfDay / 60)
      c.set(java.util.Calendar.MINUTE, minuteOfDay % 60)
      c.set(java.util.Calendar.SECOND, 0)
      c.set(java.util.Calendar.MILLISECOND, 0)
      // Calendar is Sunday-first (1..7); the app is Monday-first (0..6).
      val appDay = (c.get(java.util.Calendar.DAY_OF_WEEK) + 5) % 7
      if (days[appDay] != '1') continue
      val fireAt = c.timeInMillis - offsetMin * 60_000L
      if (fireAt > afterMs) return fireAt
    }
    return null
  }

  /** Arms the following occurrence of an alarm that has just fired. */
  fun rearmAfterFiring(context: Context, id: Int) {
    // Whatever just rang consumed the snooze, if there was one.
    clearSnooze(context, id)
    // A minute past, so the occurrence that just rang cannot be re-selected by a clock that has
    // not quite reached the scheduled second.
    val next = nextFireAfter(context, id, System.currentTimeMillis() + 60_000L) ?: return
    arm(context, id, next)
  }

  /**
   * Drops schedules written by an older id scheme, once.
   *
   * Cancels the pending intent as well as clearing the stored keys — an entry left armed under an
   * id nothing will ever reference again is exactly the ghost alarm this exists to prevent, and it
   * would keep ringing on its own schedule forever.
   */
  fun migrateIfNeeded(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val stored = prefs.getInt(SCHEDULE_VERSION_KEY, 1)
    if (stored >= SCHEDULE_VERSION) return

    for (raw in prefs.getStringSet(IDS_KEY, emptySet())!!.toSet()) {
      val id = raw.toIntOrNull() ?: continue
      manager(context).cancel(pendingIntent(context, id))
    }
    val editor = prefs.edit()
    for (key in prefs.all.keys) {
      if (
        key.startsWith(SOUND_PREFIX) ||
        key.startsWith(MINUTE_PREFIX) ||
        key.startsWith(DAYS_PREFIX) ||
        key.startsWith(OFFSET_PREFIX) ||
        key.startsWith(SNOOZE_PREFIX)
      ) {
        editor.remove(key)
      }
    }
    // The vibrate preference is a user setting, not a schedule, and survives.
    editor.putStringSet(IDS_KEY, emptySet())
    editor.putInt(SCHEDULE_VERSION_KEY, SCHEDULE_VERSION)
    editor.apply()
  }

  /**
   * Restores every known alarm. AlarmManager forgets everything across a reboot.
   *
   * Deliberately does **not** migrate.
   *
   * The obvious-looking version of this called [migrateIfNeeded] first, so that a legacy entry was
   * never re-armed on its way out. That is right when JS is about to re-schedule everything a
   * moment later, and catastrophic when it is not — and the two paths that call this without a JS
   * runtime are exactly the ones that matter. `MY_PACKAGE_REPLACED` fires the instant an update
   * installs, and `BOOT_COMPLETED` after a restart; both would have wiped the schedule and re-armed
   * nothing, leaving the user with no alarm at all until they next opened the app. Someone who
   * updates Somno at bedtime and does not reopen it does not wake up.
   *
   * So migration is JS-driven only — `migrateSchedules()`, called at launch immediately before the
   * reconcile that rewrites every alarm under the agreed ids. Until that launch happens, a legacy
   * entry stays armed, which is the right failure: it holds the same minute and day mask, so it
   * rings at the correct time, and [AlarmSoundPlayer.start] stops any current tone before starting
   * a new one, so a legacy entry firing alongside its replacement is one alarm, not two.
   */
  fun rearmAll(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    for (raw in prefs.getStringSet(IDS_KEY, emptySet())!!) {
      val id = raw.toIntOrNull() ?: continue
      // A pending snooze owns this alarm's pending intent until it fires. Re-arming from the
      // recurrence here would replace it with tomorrow's occurrence, cancelling a snooze the user
      // is currently asleep on — and TIME_SET, which the system sends on every clock sync, reaches
      // this function.
      val snoozeAt = snoozePendingAt(context, id)
      if (snoozeAt != null) {
        arm(context, id, snoozeAt)
        continue
      }
      val next = nextFireAfter(context, id, System.currentTimeMillis()) ?: continue
      arm(context, id, next)
    }
  }

  /** Whether the user wants the alarm to vibrate. Set from JS whenever the setting changes. */
  fun setVibrate(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(VIBRATE_KEY, enabled).apply()
  }

  fun vibrateFor(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(VIBRATE_KEY, true)

  fun soundFor(context: Context, id: Int): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return prefs.getString(SOUND_PREFIX + id, "default") ?: "default"
  }

  /**
   * Re-arms every alarm after a reboot.
   *
   * This used to be a no-op that deferred to the JS layer's scheduling pass at app launch. That is
   * not good enough for an alarm clock: a phone restarted overnight — an OS update, a flat battery,
   * a crash — came back with nothing scheduled, and the user found out by oversleeping. The
   * recurrence is stored here precisely so this can be answered without a JS runtime.
   */
  fun onBootCompleted(context: Context) {
    rearmAll(context)
  }
}
