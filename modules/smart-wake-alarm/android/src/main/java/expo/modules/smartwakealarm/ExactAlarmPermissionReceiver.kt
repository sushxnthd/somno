package expo.modules.smartwakealarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Puts the alarms back when the user grants exact-alarm access again.
 *
 * On Android 12 and 12L, exact-alarm access is user-revocable from system settings. Revoking it
 * does not cancel the alarms outright — they degrade to inexact — but the interesting case is the
 * other direction: after the user grants it back, nothing re-arms anything with the exact
 * scheduling they just enabled. The only thing that re-armed alarms was the next app launch, so
 * somebody who noticed the amber warning, fixed the permission, put the phone down and went to
 * bed still woke up to whatever the inexact schedule happened to do.
 *
 * Android delivers `SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED` for exactly this, and handling
 * it is a documented requirement rather than an optimisation. Re-arming everything is idempotent —
 * `AlarmScheduler.arm` replaces a pending intent rather than stacking one — so acting on the
 * broadcast unconditionally is both correct and the simplest thing that can work.
 *
 * Not needed on 33+, where the app holds USE_EXACT_ALARM and the grant cannot be revoked; the
 * broadcast simply never arrives there.
 */
class ExactAlarmPermissionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED") return
    AlarmScheduler.rearmAll(context)
  }
}
