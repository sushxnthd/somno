import { readdirSync, readFileSync } from 'node:fs';
import { stripComments } from './_source.ts';

/**
 * Invariants of the Android alarm module, checked against its source.
 *
 * This suite exists because of an asymmetry that is easy to forget: every model in this app is a
 * pure TypeScript module with a real test, and the one part that actually wakes the user is Kotlin
 * that nothing here can compile, let alone run. The alarm is the feature with the highest cost of
 * failure and the least coverage.
 *
 * These are not a substitute for running it on a phone — the runbook still says to test a reboot,
 * a locked screen and a killed app. They are a substitute for *silently losing* a fix. Each check
 * below encodes a specific defect that was found and fixed; without them, an edit that reintroduces
 * one produces a green suite and an alarm that rings for one second at 6am.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

const NATIVE = 'modules/smart-wake-alarm/android/src/main';
const read = (f: string) => readFileSync(`${NATIVE}/${f}`, 'utf8');

/**
 * Kotlin with its comments removed.
 *
 * Every one of these files carries a long comment explaining the defect it fixes, and those
 * comments quote the code they are about — so a check that greps the raw file passes on the
 * explanation of the bug as happily as on the fix.
 */
const code = (f: string) => stripComments(read(f));


const manifest = read('AndroidManifest.xml').replace(/<!--[\s\S]*?-->/g, '');
const service = code('java/expo/modules/smartwakealarm/AlarmService.kt');
const receiver = code('java/expo/modules/smartwakealarm/AlarmReceiver.kt');
const scheduler = code('java/expo/modules/smartwakealarm/AlarmScheduler.kt');
const module = code('java/expo/modules/smartwakealarm/SmartWakeAlarmModule.kt');
const boot = code('java/expo/modules/smartwakealarm/BootReceiver.kt');
/** The JS half of the alarm lifecycle, which owns the ordering the native half depends on. */
const js = stripComments(readFileSync('src/lib/alarmScheduler.ts', 'utf8'));

{
  console.log('the tone rings from a service, not from a receiver');
  /**
   * A BroadcastReceiver's process is only guaranteed to survive for the duration of onReceive.
   * Starting a MediaPlayer there and returning leaves the audio owned by a process with no running
   * component, which Android may reclaim at will — most likely on a phone that has been idle all
   * night, which is every morning.
   */
  check('AlarmService exists and is a Service', /class AlarmService : Service\(\)/.test(service));
  check('it goes foreground before anything else', /startForeground\(\s*NOTIFICATION_ID/.test(service));
  check('the receiver starts the service instead of the player', /AlarmService\.start\(/.test(receiver));
  check(
    'and does not start the player itself any more',
    !/AlarmSoundPlayer\.start\(/.test(receiver),
    receiver.match(/.*AlarmSoundPlayer\.start\(.*/)?.[0]
  );
  check('the service is the one that starts the player', /AlarmSoundPlayer\.start\(/.test(service));
  check(
    'it is declared with the mediaPlayback type',
    /<service[\s\S]*?android:name="\.AlarmService"[\s\S]*?android:foregroundServiceType="mediaPlayback"/.test(manifest)
  );
  check('and holds both foreground-service permissions', /FOREGROUND_SERVICE"/.test(manifest) && /FOREGROUND_SERVICE_MEDIA_PLAYBACK/.test(manifest));
  check(
    'a killed service does not silently restart the alarm later',
    /return START_NOT_STICKY/.test(service) && !/START_STICKY/.test(service)
  );

  /**
   * And if the service cannot be started, it rings anyway.
   *
   * Android 12 forbids background foreground-service starts, exempting a receiver woken by an
   * *exact* alarm. Somno's alarms are exact — except where the user revoked exact-alarm permission
   * and the scheduler fell back to `setAndAllowWhileIdle`. Without a fallback, the one user whose
   * alarm was already degraded would get an exception instead of a wake-up.
   */
  check('the start is guarded', /fun start\(context: Context, alarmId: Int, soundName: String\?\)[\s\S]*?try \{/.test(service));
  check(
    'and falls back to ringing directly',
    /catch \(_: Exception\) \{[\s\S]*?AlarmSoundPlayer\.start\(context, soundName, AlarmScheduler\.vibrateFor\(context\)\)/.test(service)
  );
  check('with the same notification the service would have shown', /buildNotification\(context: Context, alarmId: Int\)/.test(service));
  check('built in one place, not two', (service.match(/NotificationCompat\.Builder/g) ?? []).length === 1);
}

{
  console.log('the notification goes away when the alarm does');
  // A foreground-service notification is setOngoing, so it cannot be swiped. If nothing takes it
  // down, silencing the alarm leaves a permanent "Somno — time to check in" in the shade, on an
  // alarm that stopped an hour ago.
  check('there is one fixed notification id', /const val NOTIFICATION_ID = \d+/.test(service));
  check('clearing it is a public entry point', /fun clearNotification\(context: Context\)/.test(service));
  check('stop() clears it', /fun stop\(context: Context\)[\s\S]*?clearNotification\(context\)/.test(service));
  // Silencing must not depend on a startService call that a background start can refuse.
  // Before anything that can be refused, so the guarantee never depends on one.
  check(
    'stop() silences the player directly, not only via the service',
    /fun stop\(context: Context\) \{\s*stopRequested = true\s*AlarmSoundPlayer\.stop\(\)/.test(service),
    service.split('fun stop(context: Context)')[1]?.trim().slice(0, 120)
  );
  check('and so does the service tearing itself down', /private fun stopRinging\(\)[\s\S]*?clearNotification\(this\)/.test(service));

  /**
   * Stopping cannot depend on an Intent being delivered.
   *
   * `startService(ACTION_STOP)` is a *start*: refusable from the background on Android 12+, and
   * asynchronous even when it succeeds. Silencing the player alone therefore left the service still
   * in the foreground, pinning the process behind an undismissable notification with nothing left
   * that would ever ask it to stop. Holding the instance makes the teardown an ordinary method call.
   */
  const stopBody = service.split('fun stop(context: Context)')[1]?.split('\n    fun ')[0] ?? '';
  check('the running instance is held', /@Volatile private var running: AlarmService\? = null/.test(service));
  check('and set when the service starts', /override fun onCreate\(\)[\s\S]*?running = this/.test(service));
  check('and cleared when it goes away', /override fun onDestroy\(\)[\s\S]*?running = null/.test(service));
  check('stop() tears it down in-process when it can', /service\.stopRinging\(\)/.test(stopBody), stopBody.trim().slice(0, 200));
  check('falling back to the Intent only when there is no instance', /else \{[\s\S]*?startService\(intent\)/.test(stopBody));

  /**
   * And a stop that overtakes a start is not lost. `startForegroundService` returns before
   * `onStartCommand` runs, so a dismiss landing in that window had nothing to act on and the service
   * came up ringing at a user who had already stopped it.
   */
  check('a stop request is recorded', /@Volatile private var stopRequested = false/.test(service));
  check('set by stop()', /stopRequested = true/.test(service));
  check('cleared by start()', /fun start\(context: Context, alarmId: Int, soundName: String\?\) \{\s*stopRequested = false/.test(service));
  check('and honoured the moment the service comes up', /if \(stopRequested\) \{\s*stopRinging\(\)/.test(service));
  // startForeground must still happen first: Android kills an app that promises a foreground
  // service and does not deliver one, even if it is about to stop.
  check(
    'after going foreground, so the foreground promise is kept',
    service.indexOf('startForeground(NOTIFICATION_ID') < service.indexOf('if (stopRequested)')
  );

  // Each of the three ways an alarm can end has to reach AlarmService.stop.
  for (const fn of ['stopAlarmSound', 'snoozeAlarm', 'cancelSnooze']) {
    const body = module.split(`Function("${fn}")`)[1]?.split('Function("')[0] ?? '';
    check(`${fn} stops the service`, /AlarmService\.stop\(/.test(body), body.trim().slice(0, 120));
  }
}

{
  console.log('legacy schedules do not survive an upgrade as ghosts');
  /**
   * JS alarm ids are Date.now() values; they are now folded into 31 bits before crossing the
   * bridge. Installs made before that fold still hold the old request codes in the module's prefs,
   * and rearmAll re-arms every id it finds — so the phone ends up with the ghost *and* the real
   * alarm, and nothing in the app knows the ghost's id well enough to cancel it.
   */
  check('there is a schedule version', /const val SCHEDULE_VERSION = (\d+)/.test(scheduler));
  check('it is past the implicit first generation', Number(/const val SCHEDULE_VERSION = (\d+)/.exec(scheduler)?.[1] ?? 1) >= 2);
  check('the migration is version-gated, so it runs once', /if \(stored >= SCHEDULE_VERSION\) return/.test(scheduler));
  check('it cancels the legacy pending intents', /fun migrateIfNeeded[\s\S]*?manager\(context\)\.cancel\(pendingIntent\(context, id\)\)/.test(scheduler));
  check('it writes the new version so it does not repeat', /fun migrateIfNeeded[\s\S]*?putInt\(SCHEDULE_VERSION_KEY, SCHEDULE_VERSION\)/.test(scheduler));
  check('JS can trigger the migration explicitly', /Function\("migrateSchedules"\)/.test(module));
  check('and does so at launch', /migrateSchedules\?\.\(\)/.test(js));
  check('before it reconciles, not after', js.indexOf('migrateSchedules') < js.indexOf('reconcile(useSomnoStore'), js.indexOf('migrateSchedules'));

  /**
   * The migration must not run on a path that has no JS behind it to re-schedule.
   *
   * `rearmAll` is what BOOT_COMPLETED and MY_PACKAGE_REPLACED call, with no React runtime alive.
   * Migrating there wipes the schedule and re-arms nothing, so someone who updates the app at
   * bedtime and does not reopen it has no alarm in the morning — strictly worse than the duplicate
   * this migration exists to prevent.
   */
  const rearmBody = scheduler.split('fun rearmAll')[1]?.split('\n  fun ')[0] ?? '';
  check('rearmAll does not migrate', !/migrateIfNeeded/.test(rearmBody), rearmBody.trim().slice(0, 160));
  check('so a reboot before the first launch still re-arms', /nextFireAfter\(context, id, System\.currentTimeMillis\(\)\)/.test(rearmBody));
}

{
  console.log('alarms survive a clock change, not only a reboot');
  // AlarmManager entries are absolute instants. Crossing a timezone leaves tomorrow's 7am armed for
  // what is now 2am, and nothing re-armed it until the next reboot or app launch.
  check('the boot receiver is registered for TIMEZONE_CHANGED', /android\.intent\.action\.TIMEZONE_CHANGED/.test(manifest));
  check('and for TIME_SET', /android\.intent\.action\.TIME_SET/.test(manifest));
  check('an in-place update still counts', /android\.intent\.action\.MY_PACKAGE_REPLACED/.test(manifest));
  check('the receiver actually handles the clock actions', /ACTION_TIMEZONE_CHANGED/.test(boot) && /ACTION_TIME_CHANGED/.test(boot));
  check('and all of them re-arm', /onBootCompleted\(context\)/.test(boot));
  // The next fire time is recomputed from the recurrence at re-arm time, not read back from a
  // stored absolute instant — which is the only reason a timezone change lands on the right hour.
  check('re-arming recomputes rather than restoring a stored instant', /fun rearmAll[\s\S]*?nextFireAfter\(context, id, System\.currentTimeMillis\(\)\)/.test(scheduler));

  /**
   * And a pending snooze survives it.
   *
   * A snooze occupies the alarm's own pending intent. Re-arming from the recurrence replaces it
   * with tomorrow's occurrence — so listening for TIME_SET, which the system broadcasts on every
   * automatic clock sync, would otherwise have introduced a new failure: a snooze silently
   * cancelled mid-morning while the user was asleep on it.
   */
  const rearm = scheduler.split('fun rearmAll')[1]?.split('\n  fun ')[0] ?? '';
  check('a snooze is recorded when it is armed', /fun snooze\(context: Context, id: Int, minutes: Int\)[\s\S]*?putLong\(SNOOZE_PREFIX \+ id, at\)/.test(scheduler));
  check('re-arming honours a pending snooze instead of overwriting it', /snoozePendingAt\(context, id\)[\s\S]*?arm\(context, id, snoozeAt\)/.test(rearm), rearm.trim().slice(0, 200));
  check('a snooze in the past does not count as pending', /at > System\.currentTimeMillis\(\)/.test(scheduler));
  // The same hazard from the JS side: reconcile() re-schedules every enabled alarm at its next
  // recurrence, so reopening the app during a snooze would have cancelled it.
  check('scheduling a recurrence does not overwrite a pending snooze', /arm\(context, id, snoozeAt \?: timestampMs\)/.test(scheduler));
  check('firing clears it', /fun rearmAfterFiring[\s\S]{0,200}?clearSnooze\(context, id\)/.test(scheduler));
  check('and so does cancelling it', /fun cancelSnoozeAndRestore[\s\S]*?clearSnooze\(context, id\)/.test(scheduler));
  check('deleting the alarm takes the record with it', /fun cancel\(context: Context, id: Int\)[\s\S]*?remove\(SNOOZE_PREFIX \+ id\)/.test(scheduler));
}

{
  console.log('cancelling a snooze does not delete the alarm');
  /**
   * AlarmScheduler.cancel() erases the stored minute and day mask along with the pending intent, so
   * the rearm that followed had nothing left to read: stopping a snoozed alarm removed tomorrow's
   * alarm entirely. Only the pending intent may be cancelled here.
   */
  const body = scheduler.split('fun cancelSnoozeAndRestore')[1]?.split('\n  fun ')[0] ?? '';
  check('it does not call the full cancel', !/\bcancel\(context/.test(body), body.trim().slice(0, 200));
  check('it cancels only the pending intent', /manager\(context\)\.cancel\(pendingIntent\(context, id\)\)/.test(body));
  check('and re-arms the recurrence afterwards', /rearmAfterFiring\(context, id\)/.test(body));
}

{
  console.log('every Kotlin file is at least structurally intact');
  /**
   * The cheapest possible stand-in for a compiler.
   *
   * Nothing in this repo can compile Kotlin — the Android SDK is not available here — so an edit
   * that drops a brace produces a file that looks fine in a diff, passes every check above, and
   * fails at build time on someone else's machine. Balanced delimiters do not prove it compiles;
   * unbalanced ones prove it does not.
   */
  const strip = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/"""[\s\S]*?"""/g, '""')
      .replace(/"(\\.|[^"\\])*"/g, '""')
      .replace(/'(\\.|[^'\\])'/g, "''");

  const dir = `${NATIVE}/java/expo/modules/smartwakealarm`;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.kt')).sort()) {
    const source = strip(readFileSync(`${dir}/${file}`, 'utf8'));
    const counts: Record<string, number> = { '{': 0, '(': 0, '[': 0 };
    const closes: Record<string, string> = { '}': '{', ')': '(', ']': '[' };
    for (const ch of source) {
      if (ch in counts) counts[ch] += 1;
      else if (ch in closes) counts[closes[ch]] -= 1;
    }
    const balanced = Object.values(counts).every((n) => n === 0);
    check(`${file} has balanced delimiters`, balanced, JSON.stringify(counts));
  }
}

console.log(failures === 0 ? '\nAll native checks passed.' : `\n${failures} native check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
