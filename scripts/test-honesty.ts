import { readFileSync } from 'node:fs';
// One stripper, shared: see scripts/_source.ts for the bug that came of having three.
import { code } from './_source.ts';

/**
 * The claims the UI makes, checked against the code that would have to be true for them.
 *
 * Every case here was a screen asserting something the app did not do: a row that explained an
 * export instead of performing one, a projection drawn from a substituted three hours of debt, a
 * comparison against a weekly average of 64 for a user with no week, a toggle promising to wake you
 * at your lightest sleep with the mechanism removed, a notification whose whole purpose was "come
 * and recalibrate" pointing at the permissions screen.
 *
 * They share a failure mode that no amount of exercising the app catches: nothing crashes, nothing
 * looks wrong, and the output is fiction. They are checked at the source because that is where the
 * claim and the implementation sit next to each other.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}


const store = code('src/store/useSomnoStore.ts');
const notifications = code('src/lib/notifications.ts');
const F5 = code('src/screens/settings/F5Screen.tsx');
const F6 = code('src/screens/settings/F6Screen.tsx');
const F4 = code('src/screens/settings/F4Screen.tsx');
const F4E = code('src/screens/settings/F4EScreen.tsx');
const F1 = code('src/screens/settings/F1Screen.tsx');
const A1 = code('src/screens/onboarding/A1Screen.tsx');
const A4 = code('src/screens/onboarding/A4Screen.tsx');
const A5 = code('src/screens/onboarding/A5Screen.tsx');
const A9 = code('src/screens/onboarding/A9Screen.tsx');
const home = code('src/screens/home/HomeScreen.tsx');
const C5 = code('src/screens/checkin/C5Screen.tsx');
const CLog = code('src/screens/checkin/CLogScreen.tsx');
const DScreen = code('src/screens/recovery/DScreen.tsx');
const toggle = code('src/components/Toggle.tsx');

{
  console.log('Data & privacy actually exports');
  // The row opened a sheet describing what an export would contain, on the screen whose subject is
  // what happens to the user's data, while the working flow sat two taps away on the Settings root.
  check('the row calls the export', /onPress=\{handleExport\}/.test(F5), F5.match(/.*Export my data[\s\S]{0,200}/)?.[0]?.slice(0, 160));
  check('which runs the real one', /await exportAllData\(\)/.test(F5));
  check('and reports every outcome', ["'empty'", "'unavailable'", "'ok'"].every((s) => F5.includes(s)));

  // The delete card offered an emailed copy. Nothing emails anything.
  check('no emailed copy is promised', !/email a copy|email you a copy/i.test(F5), F5.match(/.*email.*/i)?.[0]);
  check('it points at the export that exists instead', /Export your data first/.test(F5));
}

{
  console.log('\nnothing is compared against a number nobody produced');
  /**
   * `weeklyAverageOf` returned 64 for an empty history, and Home rendered `sdi - 64` as "+7 vs your
   * weekly average" — an exact difference from a week that never happened.
   */
  check('the weekly average is nullable', /function weeklyAverageOf\(checkIns: CheckInRecord\[\]\): number \| null/.test(store));
  check('and returns null rather than a number', /if \(!recent\.length\) return null;/.test(store), store.match(/.*!recent\.length.*/)?.[0]);
  check('no 64 is left in it', !/return 64/.test(store), store.match(/.*return 64.*/)?.[0]);
  check('the delta goes through one helper', /function deltaAgainstWeek/.test(store));
  check('Home handles the missing comparison', /delta == null/.test(home), home.match(/.*delta.*null.*/)?.[0]);
  check('and the results screen does too', /priorAverage == null/.test(C5));
  check('which compares against the week before this reading', /slice\(0, -1\)\.slice\(-7\)/.test(C5));
  check('rather than a fixed threshold', !/sdi >= 64/.test(C5), C5.match(/.*sdi >= 64.*/)?.[0]);
}

{
  console.log('\nno debt, no recovery curve');
  // `debt.compositeDebtHours || 3` drew a ten-night projection from three hours of sleep debt for
  // anyone whose real figure was zero — every new user, and everyone actually caught up.
  check('the hook returns nothing when there is nothing owed', /debt\.compositeDebtHours > 0 \? recoveryTrajectory/.test(store));
  check('and the substituted three hours is gone', !/compositeDebtHours \|\| 3/.test(store), store.match(/.*compositeDebtHours \|\| 3.*/)?.[0]);
  check('the screen renders the absence', /debtTrendPoints\.length === 0/.test(DScreen));
  check('with a sentence rather than a blank chart', /Nothing to recover from right now/.test(DScreen));
}

{
  console.log('\nreminders go where they say they go');
  const target = (id: string) => {
    // Anchored on the *use*, not the declaration — `MORNING_ID` first appears as a const.
    const seg = notifications.split(`identifier: ${id}`)[1]?.split('trigger:')[0] ?? '';
    return /data: \{ screen: '([A-Z0-9]+)' \}/.exec(seg)?.[1] ?? null;
  };
  check('the morning nudge opens the check-in', target('MORNING_ID') === 'C1', target('MORNING_ID'));
  check('wind-down opens Recovery', target('WIND_DOWN_ID') === 'D', target('WIND_DOWN_ID'));
  check('the weekly summary opens the review', target('WEEKLY_ID') === 'W1', target('WEEKLY_ID'));
  /**
   * The recalibration nudge pointed at F2 — Permissions — so the one notification whose entire
   * purpose is "come and redo your baseline" delivered the user to a list of camera switches.
   */
  check('and recalibration opens recalibration', target('RECAL_ID') === 'F6', target('RECAL_ID'));

  // A grant arriving after the fact has to schedule what is already switched on.
  check('a new permission grant reschedules', /permBecameGranted/.test(notifications));
  check('detected as a transition, not a state', /perm === 'granted' && prevPerm !== 'granted'/.test(notifications));
}

{
  console.log("\ntonight's reminder knows which night it is");
  // A plain boolean that neither expired across days nor survived a restart: "Reminder set for
  // tonight ✓", disabled, on Wednesday, for a notification that fired on Monday.
  check('the flag is an instant', /tonightReminderAt: number \| null/.test(code('src/store/types.ts')));
  check('set from when the notification will actually fire', /markTonightReminderSet: \(at\) => set\(\{ tonightReminderAt: at \}\)/.test(store));
  check('it is persisted', /tonightReminderAt: state\.tonightReminderAt/.test(store));
  check('and only counts while it is still ahead', /at != null && at > Date\.now\(\)/.test(store));
  check('the screen reads it the same way', /reminderAt != null && reminderAt > Date\.now\(\)/.test(DScreen));
  check('and the old boolean is gone', !/tonightReminderSet/.test(store), store.match(/.*tonightReminderSet.*/)?.[0]);
}

{
  console.log('\nSmart Wake describes what it does');
  // The toggle promised a ring "up to 30 minutes early, at the lightest sleep a model of your night
  // predicts", after the early-wake mechanism had been removed.
  check('no light-sleep prediction is promised', !/lightest sleep/.test(F4E), F4E.match(/.*lightest sleep.*/)?.[0]);
  check('no early ring is promised', !/minutes early/.test(F4E), F4E.match(/.*minutes early.*/)?.[0]);
  check('it says it rings at the time you set', /Rings at the time you set/.test(F4E));
  check('and still disclaims stage measurement', /Nothing measures your sleep stages/.test(F4E));

  // The check-in's SDI is fused from four signals; naming the setting after one of them credited
  // the face scan with the whole decision.
  check('the snooze setting is named for the check-in', /Check-in sets snooze length/.test(F4));
  check('not for the face scan alone', !/Face scan sets snooze length/.test(F4), F4.match(/.*Face scan sets snooze.*/)?.[0]);
}

{
  console.log('\nforms refuse states that cannot work');
  // An alarm with no days is stored, shown switched on, and never fires: `nextFireTimestamp`
  // returns null for an empty mask and `planAlarms` skips it.
  check('saveAlarm reports whether it saved', /saveAlarm: \(\) => boolean/.test(store));
  check('and refuses an empty day mask', /if \(!get\(\)\.days\.some\(Boolean\)\) return false;/.test(store));
  check('the editor says so before asking for permissions', /Pick at least one day/.test(F4E));
  check('and so does the onboarding alarm', /Pick at least one day/.test(A9));

  // The slider offered 12 while `setAge` clamped to MIN_AGE, so the dial and the profile disagreed.
  check('the settings age range starts at MIN_AGE', /min=\{MIN_AGE\}/.test(F1));
  check('with no hardcoded floor left', !/min=\{12\}/.test(F1), F1.match(/.*min=\{12\}.*/)?.[0]);
}

{
  console.log('\nnavigation lands where the user asked to go');
  /**
   * Skip on the intro carousel went straight to 'B', which marks onboarding complete on arrival —
   * so one tap permanently recorded a user as set up while stepping over consent, the profile and
   * the reaction-time baseline every later score is measured against.
   */
  check('the intro Skip skips the intro', /go\('A2'\)/.test(A1), A1.match(/.*Skip[\s\S]{0,120}/)?.[0]?.slice(0, 120));
  check('and not the whole of setup', !/go\('B'\)/.test(A1), A1.match(/.*go\('B'\).*/)?.[0]);

  // "Retake quiz" from Settings led onward into A5, whose button starts a baseline calibration.
  check('the profile screen knows where it was entered from', /const fromSettings = cameFrom === 'F1'/.test(A4));
  check('and returns there instead of continuing onboarding', /go\(fromSettings \? 'F1' : 'A5'\)/.test(A4));
  check('including from the back chevron', /go\(fromSettings \? 'F1' : 'A3'\)/.test(A4));
}

{
  console.log('\nnothing claims a duration it does not take');
  // The headline said two minutes over two cards that add up to about ninety seconds.
  check('calibration says 90 seconds', /90 seconds/.test(A5));
  check('not two minutes', !/next 2 minutes/.test(A5), A5.match(/.*2 minutes.*/)?.[0]);
}

{
  console.log('\nthe sleep log starts from the user, not the mockup');
  // The wheels opened at 23:52 and 06:41 — a stranger's night, stated to the minute.
  check('there is a seeded entry point', /startSleepLog: \(\) => \{/.test(store));
  check('seeded from the last logged night or the usual window', /logBed: last \? last\.bedMin : s\.bedMin/.test(store));
  check('the screen says which night it is recording', /nightLabel/.test(CLog));
  check('and warns that saving replaces an existing entry', /Saving replaces the entry you already made/.test(CLog));
}

{
  console.log('\nno affordance that does nothing');
  // "History ›" was a plain Text with a chevron and no handler on a card with no other action.
  check('the recalibration card no longer offers a journey', !/History ›/.test(F6), F6.match(/.*History.*/)?.[0]);
  check('it states the session count instead', /sessionCount === 0 \? 'No sessions yet'/.test(F6));
}

{
  console.log('\na switch inside a row is not two controls');
  /**
   * Every settings row wrapped its Toggle in a Pressable running the same handler. Where events
   * bubble — react-native-web does — tapping the switch fired both and the setting flipped back, so
   * the part of the row users actually aim at was the only part that did nothing. On the alarm list
   * the two handlers *differed*, and flicking an alarm off also pushed the edit screen over it.
   */
  check('the switch can be rendered as scenery', /interactive = true/.test(toggle));
  check('with no touch target of its own', /if \(!interactive\) return <View pointerEvents="none">/.test(toggle));

  const rows = [
    ['F4 snooze setting', F4],
    ['F4E Smart Wake', F4E],
    ['FN reminders', code('src/screens/settings/FNScreen.tsx')],
    ['F4S vibrate', code('src/screens/settings/F4SScreen.tsx')],
    ['F1 stress', F1],
    ['A4 stress', A4],
    ['A9 Smart Wake', A9],
  ] as const;
  for (const [name, source] of rows) {
    check(`${name} owns its tap`, /interactive=\{false\}/.test(source), source.match(/.*<Toggle.*/)?.[0]?.slice(0, 100));
    check(`${name} carries the switch role`, /accessibilityRole="switch"/.test(source));
  }

  // The alarm list is the one case where the two actions genuinely differ, so they are siblings.
  check('the alarm row and its switch are siblings', /styles\.alarmCardBody/.test(F4));
  check('and the card is no longer a Pressable wrapping one', !/<Pressable key=\{a\.id\}/.test(F4), F4.match(/.*<Pressable key=\{a\.id\}.*/)?.[0]);
}

{
  console.log('\nrecalibration replaces both baselines together, or neither');
  /**
   * Two bugs, one promise. `recalibrateBaseline` used to erase the facial baseline on the first tap,
   * before any replacement existed; and the reaction-time baseline was written the moment the tap
   * test finished, so completing the taps and then cancelling the scan had already replaced half of
   * it — on a screen that had just promised "nothing is replaced if you back out". Half a
   * recalibration is worse than none: the two references are supposed to describe the same person on
   * the same day.
   */
  const start = store.split('recalibrateBaseline: () => {')[1]?.split('\n      },')[0] ?? '';
  check('starting a recalibration erases nothing', !/faceBaseline:\s*recalibrateFaceBaseline/.test(start), start.trim().slice(0, 160));
  // `baseline: null` inside the staging object is fine; a bare `baseline:` assignment is not.
  check('and writes no baseline', !/\bbaseline: (?!null)[A-Za-z]/.test(start), start.trim().slice(0, 160));
  check('it only opens an empty staging area', /recalibration: \{ faceBaseline: null, baseline: null, session: null, trials: 0 \}/.test(start));

  // Each half is measured into the staging area rather than applied.
  check('the face half stages its replacement', /recalibration: \{ \.\.\.s\.recalibration, faceBaseline: updateFaceBaseline\(recalibrateFaceBaseline\(\), m\) \}/.test(store));
  check('only while a recalibration is open', /if \(m && s\.recalibration && !s\.recalibration\.faceBaseline\)/.test(store));
  check('the tap test stages its replacement too', /if \(recalibrating\) \{\s*set\(\{ recalibration: \{ \.\.\.recalibrating, baseline: baselineProfile, session, trials: times\.length \} \}\)/.test(store));
  check('and commits directly only when it is not a recalibration', /\} else \{[\s\S]{0,400}?set\(\{ baseline: baselineProfile\.pvtMeanRt/.test(store));

  // One commit, at the end, applying whatever was measured.
  const finish = store.split('finishRecalibration: () => {')[1]?.split("get().go('F0')")[0] ?? '';
  check('the commit applies the staged reaction-time baseline', /staged\?\.baseline/.test(finish), finish.trim().slice(0, 200));
  check('and the staged facial one', /staged\?\.faceBaseline \? \{ faceBaseline: staged\.faceBaseline \}/.test(finish));
  check('restarting the session pool with it', /pvtSessions: staged\.session \? \[staged\.session\] : \[\]/.test(finish));
  check('and closes the recalibration', /recalibration: null/.test(finish));

  // Abandoning it must clear the staging area, or a later scan resets the baseline days afterwards.
  const abort = store.split('abortTest: () => {')[1]?.split('\n      },')[0] ?? '';
  check('cancelling discards everything staged', /set\(\{ recalibration: null \}\)/.test(abort), abort.trim().slice(0, 160));
  check('and returns to the settings screen it started from', /wasRecalibrating \? 'F6'/.test(abort));

  // The staging area is transient: an interrupted recalibration is not one to resume.
  check('it is not persisted', !/recalibration: state\.recalibration/.test(store));
  /**
   * And a recalibration abandoned by some *other* route — a tapped notification, an alarm taking
   * over the screen — is closed when the next check-in starts.
   */
  const reset = store.split('resetCheckInSignals: () => {')[1]?.split('\n      },')[0] ?? '';
  check('starting a check-in closes an abandoned one', /recalibration: null/.test(reset), reset.trim().slice(0, 200));

  /**
   * And the flow ends where it started. Reached from Settings, A8 used to offer "Set up my alarm"
   * into A9 — so correcting a drifting baseline walked the user into the onboarding alarm screen.
   */
  const A8 = code('src/screens/onboarding/A8Screen.tsx');
  check('the summary knows it was a recalibration', /const recalibrating = recalibration != null/.test(A8));
  check('and offers Done rather than the alarm setup', /label=\{recalibrating \? 'Done' : 'Set up my alarm'\}/.test(A8));
  check('which commits and returns to settings', /onPress=\{recalibrating \? finishRecalibration/.test(A8));
  check('it reports the staged trial count, not the live one', /recalibration\?\.trials \?\? baselineTrials/.test(A8));
  check('and whether a replacement face scan was actually taken', /recalibration\?\.faceBaseline/.test(A8));

  // The screen that makes the promise has to describe the behaviour that keeps it.
  check('the recalibration screen promises an all-or-nothing swap', /replaced together at the end/.test(F6));
  check('and no longer claims an immediate clear', !/It clears your facial calibration/.test(F6), F6.match(/.*clears your facial.*/)?.[0]);
}

{
  console.log('\nthe tap that launched the app is not dropped');
  /**
   * `addNotificationResponseReceivedListener` only sees responses delivered after it subscribes, and
   * a cold launch delivers the response while the bundle is still starting — so tapping a reminder
   * on a phone where Somno was not already running reached nothing at all.
   */
  check('the launch response is collected', /getLastNotificationResponseAsync\(\)/.test(notifications));
  check('through the same handler as a warm tap', /addNotificationResponseReceivedListener\(handleResponse\)/.test(notifications));
  check('and cleared once consumed', /clearLastNotificationResponseAsync\(\)/.test(notifications));

  // Both sources can deliver the same response, and both are guarded against re-navigating.
  check('responses are de-duplicated', /const handled = new Set<string>\(\)/.test(notifications));
  check('keyed on the delivery instant, not just the identifier', /request\.identifier\}:\$\{response\.notification\.date/.test(notifications));

  // Routing still waits for the store, so `onRehydrateStorage` cannot overwrite the destination.
  check('routing waits for hydration', /if \(useSomnoStore\.getState\(\)\.hasHydrated\)/.test(notifications));
  check('holding the target until then', /pendingScreen = target/.test(notifications));
}

{
  console.log('\na monthly nudge is monthly');
  /**
   * A single DATE trigger at baseline + 30 days, guarded by `if (at > now)` — so it fired once and
   * every reschedule after that found the date in the past and scheduled nothing. A setting left
   * switched on went permanently silent, and only recalibrating could revive it: the exact act the
   * reminder exists to prompt.
   */
  const recal = notifications.split('if (noteR && baselineCreatedAt != null)')[1]?.split('if (noteW)')[0] ?? '';
  check('the trigger repeats', /SchedulableTriggerInputTypes\.MONTHLY/.test(recal), recal.trim().slice(0, 200));
  check('and is no longer a one-shot date', !/SchedulableTriggerInputTypes\.DATE/.test(recal), recal.match(/.*DATE.*/)?.[0]);
  check('the day is capped so no month is skipped', /Math\.min\(first\.getDate\(\), 28\)/.test(recal));
  check('the settings copy says it repeats', /repeats monthly until you recalibrate/.test(code('src/screens/settings/FNScreen.tsx')));
}

{
  console.log('\nthe restore explainer describes what actually syncs');
  /**
   * It read "Face data was never stored, so the first face scan on the new device recalibrates from
   * your existing baseline" — self-contradictory, and wrong on the part that matters. No image is
   * kept, but the numbers derived from them *are* the facial baseline and they sync like everything
   * else, so a restored phone scores its first scan against the same reference.
   */
  const F9 = code('src/screens/settings/F9Screen.tsx');
  check('the facial calibration is named as something that comes across', /facial calibration download from your account/.test(F9));
  check('and no longer implies a fresh device recalibrates', !/recalibrates from your existing baseline/.test(F9), F9.match(/.*recalibrates from.*/)?.[0]);
  check('while still being clear no image travels', /No photo or video is ever stored or transferred/.test(F9));

  // The sync layer has to actually do it, or the copy is a new false claim.
  const sync = code('src/lib/sync.ts');
  check('the face baseline is pushed', /pushFaceBaseline/.test(sync));
  check('and restored', /faceBaseline/.test(code('src/lib/merge.ts')));
}

{
  console.log('\nediting a check-in edits it, rather than making a second one');
  /**
   * Every commit stamped `Date.now()` and re-derived the trigger type, so re-rating a 7am alarm
   * check-in at nine that evening moved it to 21:00, relabelled it "evening", and — because a
   * check-in's identity upstream *is* its instant — uploaded it as a separate evening reading
   * rather than a correction of the morning one. One morning became two points on the trend.
   */
  check('the record being edited is looked up first', /const editing = s\.activeCheckInId \? s\.checkIns\.find/.test(store));
  check('its instant is kept', /timestamp: at,/.test(store) && /const at = editing\?\.timestamp \?\? Date\.now\(\)/.test(store));
  check('its trigger type is kept', /triggerType: editing\?\.triggerType \?\?/.test(store));
  check('and its id', /id: editing\?\.id \?\? `ci_/.test(store));
  check('an edit updates in place rather than appending', /isEdit \? st\.checkIns\.map/.test(store));
  check('and does not fold the same trials into the baseline twice', /\.\.\.\(isEdit \? \{\} : refineBaseline/.test(store));

  /**
   * And a re-run has to recompute. Both re-runs navigated straight back to the results screen, so
   * the screen redrew with the new *temporary* metrics while the stored check-in and the SDI kept
   * the reading the user had just replaced.
   */
  check('a re-run of the tap test recommits', /else if \(n === 'C5'\) get\(\)\.submitKss\(\)/.test(store));
  check('and so does a re-run of the scan', (store.match(/else if \(n === 'C5'\) get\(\)\.submitKss\(\)/g) ?? []).length === 2);
  check('cancelling a re-run returns to the results', /wasRerun \? 'C5'/.test(store));
  /**
   * And the escape hatch on the scan-error screen escapes. `afterScan` routes a failed scan to
   * SCANERR, and SCANERR's "Continue without it" called `skipScan`, which called `afterScan` with
   * the failure still set — so the button redrew its own screen, on the one screen that exists to
   * offer a way out of a scan that will not work.
   */
  check('skipping a failed scan clears the failure', /set\(\{ signals: 3, scanFailure: null \}\)/.test(store), store.match(/.*signals: 3.*/)?.[0]);
  check('the tap test is re-runnable from the results screen', /rerunPvt/.test(C5), C5.match(/.*explainPvt.*/)?.[0]);
  check('and says what re-running will do', /replaces this check-in/.test(C5));
}

{
  console.log('\na restored account behaves like the phone it came from');
  const sync = code('src/lib/sync.ts');
  const merge = code('src/lib/merge.ts');

  // Uploaded and never read back: the two things that decide how every score is computed.
  check('the profile is pulled', /from\('profiles'\)\.select/.test(sync), sync.match(/.*from\('profiles'\).*/)?.[0]);
  check('and the alarms', /from\('alarm_configs'\)\.select/.test(sync));
  check('both ride in the sync payload', /return \{ checkIns, sleepLogs, baseline, faceBaseline, profile, alarms,/.test(sync));
  check('and the payload type carries them', /profile\?: RestoredProfile \| null;/.test(merge) && /alarms\?: Alarm\[\] \| null;/.test(merge));

  // The personal factors the debt model reads, uploaded as well as pulled.
  for (const field of ['high_stress', 'usual_bedtime_min', 'usual_wake_min', 'natural_wake_min']) {
    check(`${field} is uploaded`, new RegExp(`${field}:`).test(sync), sync.match(new RegExp(`.*${field}.*`))?.[0]);
  }
  // And the baseline metadata, without which a restored baseline scores differently.
  for (const field of ['pvt_speed', 'pvt_sessions', 'captured_at_hour', 'captured_hours_awake']) {
    check(`${field} makes the round trip`, (sync.match(new RegExp(field, 'g')) ?? []).length >= 2, field);
  }

  // Applied only where it is safe to.
  check('restored factors never overwrite newer answers of this device\u2019s own', /s\.profileUpdatedAt === 0 \|\| remoteStamp > s\.profileUpdatedAt/.test(store));
  // Not a choice between two lists any more: alarms the two sides share are settled one at a time
  // by version, which is the only way an edit made on one phone can survive the other syncing.
  check('the account\u2019s alarms are taken by a phone with none of its own', /if \(!mine\.length\) return theirs;/.test(merge));
  check('and a shared alarm is settled by version', /\(other\.updatedAt \?\? 0\) > \(a\.updatedAt \?\? 0\)/.test(merge));
  check('with the store applying the result rather than deciding it', /const settledAlarms = alarms/.test(store));
  // Re-arming every alarm on every sync would cancel a snooze the user is asleep on.
  check('and only when the list actually changed', /JSON\.stringify\(settledAlarms\) !== JSON\.stringify\(s\.alarms\)/.test(store));
  /**
   * The age is a band by design, so a restore approximates — and says so rather than presenting a
   * number nobody entered as the basis of their sleep target.
   */
  check('an approximated age is flagged', /ageNeedsConfirming: true/.test(store));
  check('touching the control confirms it', /ageNeedsConfirming: false, profileUpdatedAt/.test(store));
  check('and the profile screen asks', /Restored from your account as an approximate range/.test(F1));

  /**
   * Settings used to reach the account only when a check-in happened to follow them. Change your
   * alarms and your bedtime, lose the phone that evening, and none of it had gone up.
   */
  check('settings changes are watched, not just records', /const settingsOf = /.test(sync));
  check('including the alarms and the sleep window', /state\.alarms,/.test(sync) && /state\.bedMin,/.test(sync));
  check('debounced rather than per-keystroke', /if \(settingsTimer\) clearTimeout\(settingsTimer\)/.test(sync) && /\}, 2000\)/.test(sync));

  /**
   * Deleting an alarm has to delete it there too, or a restore brings back an alarm the user threw
   * away — and alarms are the one record in this app that acts on its own.
   */
  check('a deletion is recorded, not inferred from absence', /\[\.\.\.s\.deletedAlarmIds, id\]/.test(store));
  check('and survives a restart', /deletedAlarmIds: state\.deletedAlarmIds/.test(store));
  check('sync carries it out explicitly', /async function pushAlarmDeletions/.test(sync));
  check('on every push path, not only the reconcile', /await pushAlarmDeletions\(userId\);/.test(sync));
  check('and forgets it only once the account has agreed', /if \(error\) throw error;\s*\n[\s\S]{0,200}clearAlarmTombstones\(ids, rowIds\)/.test(sync));
  /**
   * A restored alarm's local id is derived from the row's uuid — one-way — so hashing it back
   * addressed a row that has never existed. The delete deleted nothing, the tombstone was dropped
   * as satisfied, and the alarm came back on the next restore and rang.
   */
  check('a restored alarm remembers the row it came from', /remoteId: String\(r\.id\)/.test(sync));
  check('deleting one names that row', /deletedAlarmRowIds:\s*\n?\s*rowId &&/.test(store));
  check('and the delete targets both addresses', /new Set\(\[\.\.\.ids\.map\(\(id\) => alarmUuidFor\(userId, id\)\), \.\.\.rowIds\]\)/.test(sync));
  check('a restore cannot resurrect it by row id either', /s\.deletedAlarmRowIds\.includes\(a\.remoteId\)/.test(store));
  check('and the tombstone survives a restart', /deletedAlarmRowIds: state\.deletedAlarmRowIds/.test(store));

  /**
   * A check-in is its parent row plus its two signal rows. A signal row that was not fetched looked
   * exactly like one that does not exist, so a failed `pvt_results` read produced `pvt: null` — and
   * every rule downstream reads that as a measurement the user removed and deletes the real one.
   */
  check('check-ins are assembled only from a whole read', /fetched\.checkIns \? \(ciRows as unknown as RemoteCheckIn\[\]\) : \[\]/.test(sync));
  check('and none are pushed back against a partial one', /const wholeRemote = remote\.fetched \? remote\.fetched\.checkIns : true;/.test(merge));
  check('which is what the signal reads actually report', /checkIns: ciRes\.complete && pvtRes\.complete && faceRes\.complete/.test(sync));
  check('a short read says so rather than passing as whole', /return \{ rows, complete: false \}/.test(sync));

  /**
   * The signature decides whether a corrected scan is re-sent, so a channel missing from it can be
   * fixed on the phone and stay wrong in the account forever.
   */
  for (const field of ['stillnessMs', 'closureFraction', 'ear', 'mar', 'mouthCornerDrop', 'periorbitalLab', 'scleralRedness', 'skinToneL', 'skinToneChroma']) {
    check(`the signature covers ${field}`, new RegExp(`c\\.face\\.${field}`).test(merge.split('const face = c.face')[1]?.split('return [')[0] ?? ''), field);
  }
  /**
   * Absence is not evidence. The sweep that deleted every account row missing from this device's
   * list is gone: on an account with a second phone it turned "this handset does not have that
   * alarm" into a permanent deletion of one the other handset had just made. A tombstone is now the
   * only thing that deletes an alarm, and it is durable.
   */
  check('an alarm is deleted only by a tombstone', !/not\('id', 'in'/.test(sync), sync.match(/.*not\('id', 'in'.*/)?.[0]);
  check('and the tombstone is a soft delete the account keeps', /update\(\{ deleted_at: new Date\(\)\.toISOString\(\) \}\)/.test(sync));
  check('so a stale upsert cannot revive it', !/deleted_at: null/.test(sync), sync.match(/.*deleted_at: null.*/)?.[0]);
  check('a tombstoned row is not restored as an alarm', /r\.deleted_at == null/.test(sync));
  check('and a device still holding it is told to drop it', /const gone = new Set\(deletedIds \?\? \[\]\)/.test(merge));
  check('with the tombstone beating any live edit', /const mine = \(local \?\? \[\]\)\.filter\(\(a\) => !gone\.has\(a\.id\)\)/.test(merge));
  // An alarm's time, days, tone and both switches are all editable, so all of them need dating.
  check('an alarm edit is dated', /updatedAt: Date\.now\(\),\n\s*\};\n\s*if \(s\.editId == null\)/.test(store));
  check('and so is the on/off switch', /on: !x\.on, updatedAt: Date\.now\(\)/.test(store));
  check('and creation from onboarding', /updatedAt: id,/.test(code('src/lib/alarmPlan.ts')));
  check('the version reaches the account', /updated_at: a\.updatedAt \? new Date\(a\.updatedAt\)/.test(sync));
  check('and comes back from it', /updatedAt: r\.updated_at \? Date\.parse\(String\(r\.updated_at\)\)/.test(sync));
  // The background push fires on any settings change and used to re-send every alarm with it.
  check('a stale alarm is not pushed over a newer one', /pendingAlarmPush\(s\.alarms, remoteAlarmVersions\)/.test(sync));
  // An empty version map is ambiguous, so nothing is upserted before a pull has read the account.
  check('and none at all before the account has been read', /restoreState\.alarmsKnownFor === userId \? pendingAlarmPush/.test(sync));
  check('a restore cannot resurrect a deleted alarm', /deletedAlarmIds\.includes\(a\.id\)/.test(store));
  check('a wipe creates no tombstones for the next user', /deletedAlarmIds: \[\],/.test(store));
  check('every push path carries deletions the same way', (sync.match(/pushAlarmsAndLogs\(userId\)/g) ?? []).length >= 2);
  check('and never runs for an account this data does not belong to', /s\.dataOwnerId !== userId\) return;/.test(sync));

  /**
   * A failed query and an empty table are the same empty answer. Read as the second, a flaky
   * connection overwrote a stored profile with this device's defaults and deleted the account's
   * alarms — both unrecoverable, both on the first launch of a new phone.
   */
  check('the pull records what it actually read', /profile: !profileRes\.error/.test(sync) && /alarms: !alarmRes\.error/.test(sync));
  check('a profile it could not read is never overwritten', /if \(readProfile && !profileIsStale\) await attempt\(\(\) => pushProfile\(userId\)\)/.test(sync));
  check('nor tombstones it could not read acted on', /remote\.fetched\?\.alarms === false \? \[\]/.test(sync));
  /**
   * `dataOwnerId` is set the moment the claim completes, which is before the pull has returned —
   * so it does not fence the window where an untouched device would push its defaults over a real
   * profile nobody has seen yet.
   */
  check('replacing writes wait for a restore to have landed', /restoreState\.restoredFor === userId/.test(sync));
  check('which is only recorded when the pull succeeded', /remote\.fetched\?\.profile && remote\.fetched\.alarms\) restoreState\.restoredFor = userId/.test(sync));
  check('and forgotten on a wipe', /restoreState\.restoredFor = null/.test(code('src/lib/merge.ts')));

  /**
   * `snoozeLen` is recomputed at every firing from the score; `maxSnoozes` is a setting. Uploading
   * the first as the second wrote a transient value into a settings column.
   */
  check('the snooze length uploaded is the setting', /snooze_length_min: FIXED_SNOOZE_MIN/.test(sync));
  check('and the allowance comes back on a new phone', /maxSnoozes: Math\.max\(1, Math\.min\(6, maxSnoozes\)\)/.test(store));

  // Uploaded from the first build, never read back — and the snapshots cannot be recomputed.
  check('debt snapshots are pulled', /pullTable\('sleep_debt_records'/.test(sync));
  check('alarm firings are pulled', /pullTable\('alarm_events'/.test(sync));
  check('and both are applied', /const fromDebt = debtRecords/.test(store) && /const fromEvents = alarmEvents/.test(store));
  // The foreign key cascades, so a firing cannot be re-uploaded once its alarm is gone.
  check('firings of deleted alarms are not re-uploaded', /live\.has\(e\.alarmId\)/.test(sync));
  // An alarm has to come back with the id it left with, or every restore leaves a duplicate.
  check('alarms carry their local id', /local_id: a\.id/.test(sync));
  check('and are restored under it', /Number\(r\.local_id\)/.test(sync));
}

{
  console.log('\nthe export gate counts everything the archive would hold');
  // Someone who had finished onboarding — baseline, profile, alarms, consent — and not yet made a
  // check-in was told there was "nothing to export yet", of an archive that would have held all of it.
  const exportSrc = code('src/lib/exportData.ts');
  for (const field of ['debtRecords', 'alarms', 'consentLog', 'baselineProfile', 'faceBaseline']) {
    check(`${field} counts as data`, new RegExp(`s\\.${field}`).test(exportSrc.split('const records =')[1]?.split('if (!records)')[0] ?? ''), field);
  }

  // Two claims that were not true of the code behind them.
  check('the sleep log makes no Health-weighting claim', !/weighted (below|less)/i.test(CLog), CLog.match(/.*weighted.*/i)?.[0]);
  check('"How Somno works" counts four inputs', /watches four things/.test(code('src/screens/settings/F7Screen.tsx')));
  check('and names the sleep debt among them', /the sleep you have missed/.test(code('src/screens/settings/F7Screen.tsx')));
}

console.log(failures === 0 ? '\nAll honesty checks passed.' : `\n${failures} honesty check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
