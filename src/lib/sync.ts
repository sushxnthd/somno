import { supabase, isSupabaseConfigured } from './supabase';
import { useSomnoStore, FIXED_SNOOZE_MIN } from '../store/useSomnoStore';
import { checkInLocalId, checkInSignature, mergeRecords, pendingAlarmPush, pendingPush, remoteAlarmVersions, restoreState, seenCheckIns, seenSleepLogs, sleepLogLocalId, type RestoredProfile, type SyncData } from './merge';
import { chronotypeDriftMin } from '../utils/chronotype';
import type { Alarm, AlarmEventRecord, BaselineProfile, CheckInRecord, ConsentRecord, DebtRecord, Gender, Medication, SleepLogRecord } from '../store/types';

export { mergeRecords, resetSyncCaches, type SyncData } from './merge';

/**
 * Two-way sync between local storage and Supabase.
 *
 * Local AsyncStorage stays the source of truth: the app is fully usable with no account and no
 * network, and nothing here is ever allowed to block, fail loudly, or lose a local record. The
 * cloud is a second copy that makes "restore on a new phone" real.
 *
 * Identity across devices comes from each record's natural key, not from a locally-generated id:
 * a check-in IS its instant, a sleep log IS its date. That is what the unique indexes in
 * schema.sql enforce, and it makes both push and pull idempotent — pushing twice writes the same
 * row, pulling twice produces the same local record.
 *
 * How the two sides are reconciled lives in ./merge, kept separate so it can be tested without a
 * network or a Supabase project.
 */

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

/**
 * How many rows go up in one request.
 *
 * Large enough that a year of history is a handful of requests rather than a thousand; small
 * enough that one dropped connection costs a chunk, not the whole upload, and that the JSON body
 * stays well inside what a phone on a bad connection can push in one go.
 */
const PUSH_CHUNK = 200;
/** PostgREST caps a select at 1000 rows by default, so reads are paged rather than truncated. */
const PULL_PAGE = 1000;

const chunk = <T,>(rows: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

/**
 * Sends check-ins and their PVT and face results.
 *
 * Three requests per chunk instead of three per check-in. The ids come back from the parent upsert
 * so the child rows can be matched to them without a second read — which is also why the whole
 * thing is chunked rather than sent as one enormous statement: the returned id list has to fit in
 * a response too.
 */
async function pushCheckIns(userId: string, list: CheckInRecord[]): Promise<void> {
  for (const part of chunk(list, PUSH_CHUNK)) {
    const { error: ciError, data: ciRows } = await supabase
      .from('check_ins')
      .upsert(
        part.map((c) => ({
          user_id: userId,
          timestamp: new Date(c.timestamp).toISOString(),
          trigger_type: c.triggerType,
          kss_rating: c.kss,
          computed_sdi: c.sdi,
          confidence_level: c.confidence,
          signals_used: c.signalsUsed,
          // The version this device is sending, so another one can tell whether what it holds is
          // older. Without it two phones could only argue about who synced most recently.
          updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
        })),
        { onConflict: 'user_id,timestamp' }
      )
      .select('id, timestamp');
    if (ciError || !ciRows) throw ciError ?? new Error('check_ins upsert returned no rows');

    const idByTimestamp = new Map<number, string>(ciRows.map((r) => [Date.parse(r.timestamp), r.id]));

    const pvtRows = part
      .filter((c) => c.pvt && idByTimestamp.has(c.timestamp))
      .map((c) => ({
        check_in_id: idByTimestamp.get(c.timestamp) as string,
        user_id: userId,
        trial_count: c.pvt!.trialCount,
        mean_rt: c.pvt!.meanRt,
        median_rt: c.pvt!.medianRt,
        lapses: c.pvt!.lapses,
        false_starts: c.pvt!.falseStarts,
        rt_cv: c.pvt!.rtCv,
        time_on_task_slope: c.pvt!.timeOnTaskSlope,
        z_score_vs_baseline: c.pvt!.zScore,
      }));
    if (pvtRows.length) {
      const { error } = await supabase.from('pvt_results').upsert(pvtRows, { onConflict: 'check_in_id' });
      if (error) throw error;
    }

    /**
     * A signal the user removed has to be removed there too.
     *
     * The results screen can re-run the face scan and skip it, which drops the face from that
     * check-in — and the push only ever *wrote* child rows. So the parent came back corrected while
     * the old measurement sat untouched in `facial_scan_results`, and the next restore reassembled
     * the check-in with a reading the user had deliberately thrown away. The same for a tap test
     * whose re-run was skipped.
     */
    const withoutPvt = part.filter((c) => !c.pvt && idByTimestamp.has(c.timestamp)).map((c) => idByTimestamp.get(c.timestamp) as string);
    if (withoutPvt.length) {
      const { error } = await supabase.from('pvt_results').delete().in('check_in_id', withoutPvt);
      if (error) throw error;
    }

    const faceRows = part
      .filter((c) => c.face && idByTimestamp.has(c.timestamp))
      .map((c) => ({
        check_in_id: idByTimestamp.get(c.timestamp) as string,
        user_id: userId,
        brightness: c.face!.brightness,
        redness_idx: c.face!.redness,
        periorbital_idx: c.face!.periorbital,
        eye_contrast: c.face!.eyeContrast,
        motion_idx: c.face!.motion,
        stillness_ms: c.face!.stillnessMs,
        provisional: c.face!.provisional,
        z_score_vs_baseline: c.face!.zScore,
        // The eyelid measure, into the column that was standing empty for it. It is the strongest
        // channel the scan has, and leaving it behind meant a restore came back with the weakest
        // three and a score that could not be reproduced from them.
        perclos: c.face!.closureFraction ?? null,
        // The rest of the spec's FacialScanResult vector (§7). Columns existed in the schema from
        // the start and stood empty until the detector could actually produce them.
        ear_value: c.face!.ear ?? null,
        mar_value: c.face!.mar ?? null,
        mouth_corner_drop: c.face!.mouthCornerDrop ?? null,
        periorbital_lab: c.face!.periorbitalLab ?? null,
        scleral_redness: c.face!.scleralRedness ?? null,
        skin_tone_delta: c.face!.skinToneL ?? null,
        skin_tone_chroma: c.face!.skinToneChroma ?? null,
        // Deliberately not sent: face.photoUri. It is a path on this device, meaningless on any
        // other, and the schema's whole privacy premise is that no image or image reference leaves
        // the phone.
        //
        // The version matters more than it looks. Rows written before this are on different scales:
        // detection was a skin-colour rule, so the regions these numbers were measured over sat
        // somewhere else on the face, and `perclos` did not exist because closure was a ratio
        // normalised against each scan's own maximum rather than an absolute probability. Anything
        // that ever compares two rows has to be able to tell which method produced them.
        model_version: 'mlkit-v1',
      }));
    if (faceRows.length) {
      const { error } = await supabase.from('facial_scan_results').upsert(faceRows, { onConflict: 'check_in_id' });
      if (error) throw error;
    }

    // See the note above `withoutPvt`: a removed scan must not survive as a stale child row.
    const withoutFace = part.filter((c) => !c.face && idByTimestamp.has(c.timestamp)).map((c) => idByTimestamp.get(c.timestamp) as string);
    if (withoutFace.length) {
      const { error } = await supabase.from('facial_scan_results').delete().in('check_in_id', withoutFace);
      if (error) throw error;
    }
  }
}

/**
 * The profile row: coarse by design.
 *
 * Age goes up as a band, not a number, and medication as a category, not a name — the spec's
 * coarse-not-precise rule, which is both better privacy practice and keeps the stored dataset out
 * of the more sensitive classifications. The chronotype score is the signed drift between the
 * alarm and the natural wake time, in hours.
 */
function ageBandOf(age: number): string {
  if (age < 18) return 'under-18';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  if (age < 65) return '55-64';
  return '65-plus';
}

async function pushProfile(userId: string): Promise<void> {
  const s = useSomnoStore.getState();
  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
      age_range: ageBandOf(s.age),
      gender: s.gender,
      chronotype_score: Number((chronotypeDriftMin(s.wakeMin, s.idealWake) / 60).toFixed(2)),
      medication_flag: s.medication === 'unspecified' ? 'prefer_not_to_say' : s.medication,
      onboarding_complete: s.onboardingComplete,
      // The rest of what the models actually read. Uploading a chronotype *score* alone meant a new
      // phone could restore a year of check-ins and still compute its debt against a default sleep
      // window and a default stress flag — the history looked restored and the scoring was not.
      high_stress: s.highStress,
      usual_bedtime_min: s.bedMin,
      usual_wake_min: s.wakeMin,
      natural_wake_min: s.idealWake,
      // When this device last had an answer changed. The caller refuses to send at all when the
      // account's row is newer, so this is a record of the write rather than a claim to win.
      updated_at: s.profileUpdatedAt ? new Date(s.profileUpdatedAt).toISOString() : null,
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

async function pushSleepLogs(userId: string, list: SleepLogRecord[]): Promise<void> {
  for (const part of chunk(list, PUSH_CHUNK)) {
    const { error } = await supabase.from('sleep_logs').upsert(
      part.map((l) => ({
        user_id: userId,
        date: l.date,
        bedtime_min: l.bedMin,
        waketime_min: l.wakeMin,
        duration_min: l.durationMin,
        quality: l.quality,
        rest_pct: l.restPct,
        updated_at: l.updatedAt ? new Date(l.updatedAt).toISOString() : null,
        source: l.source,
      })),
      { onConflict: 'user_id,date' }
    );
    if (error) throw error;
  }
}

/**
 * Updates the newest baseline row's facial vector when this device's is further along.
 *
 * "Further along" is sample count, matching how `mergeRecords` decides which of two face baselines
 * wins — the one built from more scans is the more complete picture of the same face. Using the
 * same rule in both directions keeps a push and a pull from disagreeing and ping-ponging.
 */
async function pushFaceBaseline(
  userId: string,
  remoteFace: SyncData['faceBaseline'] | null,
  newestRemoteAt: number
): Promise<void> {
  const local = useSomnoStore.getState().faceBaseline;
  if (!local) return;
  const localN = local.periorbital?.n ?? 0;
  const remoteN = remoteFace?.periorbital?.n ?? 0;
  if (localN <= remoteN) return;

  const { error } = await supabase
    .from('baseline_profiles')
    .update({ facial_feature_baseline: local })
    .eq('user_id', userId)
    .eq('created_at', new Date(newestRemoteAt).toISOString());
  // A failed facial update must not fail the whole sync: the reaction-time baseline and every
  // check-in are already up, and this is the one part that can be caught up on the next pass.
  if (error) console.warn('[sync] face baseline update failed', error);
}

async function pushBaseline(userId: string, b: BaselineProfile): Promise<void> {
  // Baselines are history, not a mutable row — recalibrating adds a new one. Only insert when the
  // account has none newer, so repeated pushes of the same baseline don't pile up duplicates.
  const { data: existing } = await supabase
    .from('baseline_profiles')
    .select('created_at, facial_feature_baseline')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  const newestRemote = existing?.[0]?.created_at ? Date.parse(existing[0].created_at) : 0;
  if (newestRemote >= b.createdAt) {
    // The reaction-time baseline is unchanged, but the *facial* one may not be, and returning here
    // is why it usually was not. The face baseline only ever travelled inside this insert, and the
    // insert happens once — when the PVT baseline is captured. Calibration scans two through five
    // update the face baseline locally and create no baseline row, so nothing after the first scan
    // ever reached the account: a new phone restored a one-sample reference and scored every scan
    // against it. The frozen, finished baseline in particular never synced at all.
    await pushFaceBaseline(userId, existing?.[0]?.facial_feature_baseline ?? null, newestRemote);
    return;
  }

  const { error } = await supabase.from('baseline_profiles').insert({
    user_id: userId,
    created_at: new Date(b.createdAt).toISOString(),
    pvt_mean_rt: b.pvtMeanRt,
    pvt_std_rt: b.pvtStdRt,
    // A baseline is not two numbers. `pvtSpeed` is what the z-score is actually taken against, and
    // the captured_* pair is the circadian phase it was measured at; a restore without them scores
    // the same person differently on a new phone and blames the body clock's swing on sleep loss.
    pvt_speed: b.pvtSpeed ?? null,
    pvt_sessions: b.pvtSessions ?? null,
    captured_at_hour: b.capturedAtHour ?? null,
    captured_hours_awake: b.capturedHoursAwake ?? null,
    // Numbers only, and no image ever: this is the running mean/variance of the user's own facial
    // measurements, which is what makes a scan on a new phone scoreable before it has seen the
    // face three times.
    facial_feature_baseline: useSomnoStore.getState().faceBaseline,
  });
  if (error) throw error;
}

/**
 * Carries out the deletions the user actually made.
 *
 * Alarms are the one kind of record in this app that acts on its own, so a row that outlives its
 * deletion is not a stale row — it is somebody woken at 6am on a new phone by an alarm they threw
 * away months ago. Deletion used to be inferred instead: the reconcile deleted every remote row
 * whose id was missing from the local list. That inference is only sound in the instant after a
 * pull, so the background push could not delete at all, and deleting an alarm offline — or the last
 * one, leaving nothing to compare against — left the row in the account until some later reconcile
 * happened to notice. A tombstone says *this one, deliberately*, which is equally true of an empty
 * device and a stale one, and it survives the process because it is persisted.
 *
 * Cleared only after the delete comes back clean, so a failure means it is tried again rather than
 * forgotten. Deleting a row that is already gone is not an error, so a repeat is harmless.
 *
 * Check-ins and sleep logs are deliberately not treated this way: those are history, the app offers
 * no way to delete one, and "absent locally" there means "not pulled yet".
 */
async function pushAlarmDeletions(userId: string): Promise<void> {
  const { deletedAlarmIds: ids, deletedAlarmRowIds: rowIds } = useSomnoStore.getState();
  if (!ids.length && !rowIds.length) return;

  /**
   * Both addresses at once, because one of them does not always exist.
   *
   * `alarmUuidFor` reproduces the row id only for rows this app wrote, which have a `local_id` to
   * hash. A row restored from before that column existed has its local id derived from its uuid
   * instead — one-way — so hashing it back produced an address nothing has ever been stored at. The
   * delete succeeded, deleted nothing, and the tombstone was dropped as satisfied; the real row
   * stayed, and the next restore handed the alarm back and armed it. `remoteId` is that row's own
   * uuid, kept at restore for exactly this. Deleting a row that is already gone is not an error, so
   * naming both costs nothing.
   */
  const targets = [...new Set([...ids.map((id) => alarmUuidFor(userId, id)), ...rowIds])];
  /**
   * Marked deleted, not removed.
   *
   * Removing the row is only enough on a one-phone account. A second device still holds the alarm,
   * and its next push upserts it straight back — so the alarm the user threw away returns to the
   * account and rings on the phone it was deleted from. The tombstone is the fix and it works
   * without the other device cooperating: the alarm upsert lists the alarm's own columns and not
   * this one, so a stale write updates the schedule of a row that stays deleted, and the pull then
   * takes the alarm off that device.
   */
  const { error } = await supabase
    .from('alarm_configs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('id', targets);
  if (error) throw error;

  /**
   * The firings stay. They are history — a record that this alarm rang and how it ended — and the
   * row they point at still exists, so the foreign key is satisfied and nothing has to be cleaned
   * up. Only the alarm itself is gone, which is what the user asked for.
   */
  useSomnoStore.getState().clearAlarmTombstones(ids, rowIds);
}

/**
 * The rest of the spec's model: alarms and their firings, the daily debt snapshots, and the
 * consent trail.
 *
 * These are append-mostly and small, so they go up as one batch rather than record by record. The
 * consent log in particular is never updated or deleted — an audit trail that can be rewritten is
 * not an audit trail — so it is inserted with `ignoreDuplicates`, keyed on its local id.
 */
async function pushAlarmsAndLogs(userId: string): Promise<void> {
  const s = useSomnoStore.getState();

  /**
   * Deletions are explicit, and that is now the only way an alarm is deleted.
   *
   * There used to be a second mechanism: during a full reconcile, every account row missing from
   * this device's list was swept. It existed because deletion was inferred from absence and there
   * was nothing else. With a real tombstone there is, and the sweep became the more dangerous of
   * the two — on an account with a second phone it turns "this handset does not have that alarm"
   * into a permanent deletion of an alarm the other handset had just made. Absence is not evidence;
   * a tombstone is.
   */
  await pushAlarmDeletions(userId);

  /**
   * Only the alarms the account does not already hold a newer version of.
   *
   * The push sends every alarm this device has, which is right after a merge and wrong at every
   * other moment — the background push fires on any settings change, so editing one alarm re-sent
   * all of them, and a stale copy of an alarm another phone had since changed overwrote it.
   */
  /**
   * And nothing at all until a pull has told this device what the account holds.
   *
   * An empty version map is ambiguous — an account with no alarms looks exactly like one this
   * device has never read — so before the first reconcile of a session every local alarm would pass
   * the filter, and the background push fires on any settings change. A phone opened after a week
   * could push its whole stale set before its own pull had returned. Deletions above are unaffected:
   * those are explicit, and safe whether or not anything has been read.
   */
  const outgoing = restoreState.alarmsKnownFor === userId ? pendingAlarmPush(s.alarms, remoteAlarmVersions) : [];
  if (outgoing.length) {
    const { error } = await supabase.from('alarm_configs').upsert(
      outgoing.map((a) => ({
        id: alarmUuidFor(userId, a.id),
        user_id: userId,
        time_min: a.min,
        days_active: a.days,
        smart_wake_enabled: a.smart,
        max_snoozes: s.maxSnoozes,
        // The *setting*, not `snoozeLen`. That one is recomputed at every firing from the score and
        // whether Smart Wake is on, so uploading it wrote a transient value into a settings column
        // and a restore would have handed the account's chosen length back as whatever the last
        // alarm happened to pick.
        snooze_length_min: FIXED_SNOOZE_MIN,
        escalation_enabled: true,
        label: a.label,
        sound: a.sound,
        is_on: a.on,
        // So a restore can hand the alarm back its own id. See the column comment in schema.sql.
        local_id: a.id,
        // The version, so another device can tell whether the copy it holds is the older one.
        updated_at: a.updatedAt ? new Date(a.updatedAt).toISOString() : null,
      })),
      { onConflict: 'id' }
    );
    if (error) throw error;
  }

  /**
   * Firings of alarms that still exist, and no others.
   *
   * `alarm_events.alarm_config_id` is a not-null foreign key that cascades, so a firing cannot
   * outlive the alarm it belongs to: deleting the config takes its events with it, and re-uploading
   * one afterwards is a constraint violation that would fail the whole batch — and with it every
   * later write in this function. The device keeps its own copy either way, so nothing the user can
   * see is lost here; what the account can hold is decided by the schema.
   *
   * The same filter catches the sentinel `-1` that `beginAlarmSession` records when no configured
   * alarm matches — the demo on the settings screen, most often. Those rows point at a config that
   * has never existed, so every one of them failed the same way, taking the nightly debt snapshots
   * and the consent trail down with it.
   */
  const live = new Set(s.alarms.map((a) => a.id));
  const closed = s.alarmEvents.filter((e) => e.dismissedAt && live.has(e.alarmId));
  if (closed.length) {
    const { error } = await supabase.from('alarm_events').upsert(
      closed.map((e) => ({
        id: eventUuidFor(userId, e.id),
        alarm_config_id: alarmUuidFor(userId, e.alarmId),
        user_id: userId,
        fired_at: new Date(e.firedAt).toISOString(),
        snooze_count: e.snoozeCount,
        dismissed_at: e.dismissedAt ? new Date(e.dismissedAt).toISOString() : null,
        dismiss_method: e.dismissMethod,
      })),
      { onConflict: 'id' }
    );
    if (error) throw error;
  }

  // One row per day, so this is the collection that grows without limit — chunked for the same
  // reason the check-ins are.
  for (const part of chunk(s.debtRecords, PUSH_CHUNK)) {
    const { error } = await supabase.from('sleep_debt_records').upsert(
      part.map((d) => ({
        user_id: userId,
        date: d.date,
        wake_debt_hours: d.wakeDebtHours,
        nrem_debt_hours: d.nremDebtHours,
        rem_debt_hours: d.remDebtHours,
        composite_debt_score: d.compositeDebtHours,
      })),
      { onConflict: 'user_id,date' }
    );
    if (error) throw error;
  }

  if (s.consentLog.length) {
    // The table is append-only by design — an audit trail you can update is not one — so there is
    // no upsert to lean on. Read what is already there and insert only the entries it is missing,
    // otherwise every sync would file a fresh copy of the user's entire consent history.
    const { data: existing } = await supabase
      .from('consent_log')
      .select('permission_type, granted_at, revoked_at')
      .eq('user_id', userId);
    const seen = new Set(
      (existing ?? []).map((r) => `${r.permission_type}|${r.granted_at ?? ''}|${r.revoked_at ?? ''}`)
    );
    const rows = s.consentLog
      .map((c) => ({
        user_id: userId,
        permission_type: c.permissionType,
        granted_at: c.grantedAt ? new Date(c.grantedAt).toISOString() : null,
        revoked_at: c.revokedAt ? new Date(c.revokedAt).toISOString() : null,
      }))
      .filter((r) => !seen.has(`${r.permission_type}|${r.granted_at ?? ''}|${r.revoked_at ?? ''}`));
    if (rows.length) {
      const { error } = await supabase.from('consent_log').insert(rows);
      if (error) throw error;
    }
  }
}

/**
 * Stable UUIDs for records whose local id is a number or a short string.
 *
 * Deriving them from the user id and the local id means the same alarm keeps the same row across
 * pushes and across devices, without adding a server round-trip to find out what it was called.
 */
function uuidFrom(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i) * (i + 1), 2246822519) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  const raw = (hex(h1) + hex(h2) + hex(h1 ^ h2) + hex(Math.imul(h1, h2) >>> 0)).slice(0, 32);
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-a${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}
const alarmUuidFor = (userId: string, alarmId: number) => uuidFrom(`${userId}:alarm:${alarmId}`);
/**
 * A local alarm id for a row that predates `local_id`.
 *
 * Deterministic, so restoring the same row twice produces the same alarm rather than a second one.
 * Kept well inside the safe-integer range and away from `Date.now()` values, which is what the ids
 * created on a device look like, so the two cannot collide.
 */
function uuidSeedToId(uuid: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < uuid.length; i++) h = Math.imul(h ^ uuid.charCodeAt(i), 16777619) >>> 0;
  return h;
}
const eventUuidFor = (userId: string, eventId: string) => uuidFrom(`${userId}:event:${eventId}`);

/**
 * Pushes what the account does not already hold. Safe to call repeatedly — every write is an
 * upsert, so a chunk that fails halfway is simply sent again next time.
 *
 * `remote` is the account's side as already read by `syncNow`. Without it every local record is
 * treated as missing, which is correct but sends the whole history; with it, a launch on a phone
 * that is already in step sends nothing but the profile row.
 */
export async function pushAll(userId: string, remote?: SyncData): Promise<{ pushed: number; failed: number }> {
  const s = useSomnoStore.getState();
  const local: SyncData = {
    checkIns: s.checkIns,
    sleepLogs: s.sleepLogs,
    baseline: s.baselineProfile ?? null,
    faceBaseline: s.faceBaseline,
  };
  const outstanding = remote
    ? pendingPush(local, remote)
    : { checkIns: local.checkIns, sleepLogs: local.sleepLogs };

  let pushed = 0;
  let failed = 0;
  const attempt = async (fn: () => Promise<void>) => {
    try {
      await fn();
      pushed += 1;
    } catch (e) {
      failed += 1;
      console.warn('[sync] push failed', e);
    }
  };

  /**
   * Neither of these may act on a question the pull could not ask.
   *
   * A failed `profiles` select and an account with no profile are the same empty answer, and this
   * device's defaults are a perfectly plausible profile — so on a flaky connection the reconcile
   * overwrote a real stored profile with a blank one. That is unrecoverable from the phone that did
   * it, and it happens at exactly the moment the user is least able to notice: the first launch on
   * a new device.
   *
   * `fetched` is absent only when there is no remote side at all (`pushAll` called without one),
   * where the writes are a first upload rather than a reconciliation and are safe.
   */
  const readProfile = remote?.fetched ? remote.fetched.profile : true;
  /**
   * And not when the account's profile is newer than this device's.
   *
   * There is one profile row per account and the push replaces it whole, so a phone that has been
   * in a drawer would otherwise write its month-old answers over a change made this morning on the
   * other one. The merge has already decided which side wins; this stops the loser sending anyway.
   */
  const profileIsStale = Boolean(remote?.profile) && (remote as SyncData).profile!.updatedAt > s.profileUpdatedAt;

  if (readProfile && !profileIsStale) await attempt(() => pushProfile(userId));
  if (s.baselineProfile) await attempt(() => pushBaseline(userId, s.baselineProfile as BaselineProfile));
  // `pendingPush` returns nothing here when the check-in signals were not read whole — see the note
  // on `fetched` there. The push deletes signal rows to match the record it sends, so it may only
  // run against a remote side this device has actually seen.
  if (outstanding.checkIns.length) await attempt(() => pushCheckIns(userId, outstanding.checkIns));
  if (outstanding.sleepLogs.length) await attempt(() => pushSleepLogs(userId, outstanding.sleepLogs));
  await attempt(() => pushAlarmsAndLogs(userId));
  return { pushed, failed };
}

// ---------------------------------------------------------------------------
// pull
// ---------------------------------------------------------------------------

type RemoteCheckIn = {
  id: string;
  timestamp: string;
  trigger_type: CheckInRecord['triggerType'];
  kss_rating: number | null;
  computed_sdi: number;
  confidence_level: CheckInRecord['confidence'];
  signals_used: number;
  updated_at: string | null;
};

type SleepLogRow = {
  date: string;
  bedtime_min: number;
  waketime_min: number;
  duration_min: number;
  quality: SleepLogRecord['quality'];
  rest_pct: number | null;
  updated_at: string | null;
};

/**
 * Reads every row of a table for this user, a page at a time.
 *
 * PostgREST returns at most 1000 rows per request and says nothing about the ones it left behind,
 * so a plain select silently truncates a long history — the restore would look successful and be
 * missing three years. Returns what it managed to read rather than throwing, so one unreachable
 * table still leaves a partial restore usable.
 */
async function pullTable(
  table: string,
  userId: string,
  orderBy: string
): Promise<{ rows: Record<string, never>[]; complete: boolean }> {
  const rows: Record<string, never>[] = [];
  for (let from = 0; ; from += PULL_PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order(orderBy, { ascending: true })
      .range(from, from + PULL_PAGE - 1);
    // Says so rather than passing off a short read as the whole table: `fetched` is what decides
    // whether anything downstream may act on an absence, and a lie there is the expensive kind.
    if (error || !data) {
      console.warn(`[sync] ${table} pull failed`, error);
      return { rows, complete: false };
    }
    rows.push(...(data as Record<string, never>[]));
    if (data.length < PULL_PAGE) return { rows, complete: true };
  }
}

/** Reads the account's history back out. Returns empty collections rather than throwing when a
 * table is unreachable, so a partial restore still delivers what it could reach. */
export async function pullAll(userId: string): Promise<SyncData> {
  const [ciRes, pvtRes, faceRes, logRes, debtRes, eventRes, baseRes, profileRes, alarmRes, consentRes] = await Promise.all([
    pullTable('check_ins', userId, 'timestamp'),
    pullTable('pvt_results', userId, 'check_in_id'),
    pullTable('facial_scan_results', userId, 'check_in_id'),
    pullTable('sleep_logs', userId, 'date'),
    // Both of these were uploaded from the first build and never read back. The nightly debt
    // snapshots cannot be re-derived — each was taken with the model as it stood that night, and
    // recomputing them from today's would rewrite last month's chart — and both are named in the
    // export, which on a restored phone could therefore not produce them.
    pullTable('sleep_debt_records', userId, 'date'),
    pullTable('alarm_events', userId, 'fired_at'),
    supabase.from('baseline_profiles').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
    // Both of these were pushed and never read back, which is what made a "restored" account run on
    // defaults: no personal factors behind the debt model, and no alarms at all.
    supabase.from('profiles').select('*').eq('id', userId).limit(1),
    supabase.from('alarm_configs').select('*').eq('user_id', userId),
    // The consent trail. Append-only and never rewritten, so restoring it is a straight copy — and
    // the export claims to hand the user their consent history, which on a new phone it could not.
    supabase.from('consent_log').select('*').eq('user_id', userId),
  ]);

  const ciRows = ciRes.rows;
  const pvtRows = pvtRes.rows;
  const faceRows = faceRes.rows;
  const logRows = logRes.rows;
  const debtRows = debtRes.rows;
  const eventRows = eventRes.rows;

  /**
   * Whether each answer is an answer.
   *
   * PostgREST reports a failure in `error` and leaves `data` null, which is indistinguishable from
   * an empty table unless somebody looks. Nothing did: a profile query that failed on a flaky
   * connection produced `profile: null`, the reconcile read that as "the account has no profile"
   * and pushed this device's defaults over the real one. That is unrecoverable from the phone that
   * did it.
   */
  const fetched = {
    checkIns: ciRes.complete && pvtRes.complete && faceRes.complete,
    sleepLogs: logRes.complete,
    baseline: !baseRes.error,
    profile: !profileRes.error,
    alarms: !alarmRes.error,
  };
  if (profileRes.error) console.warn('[sync] profile pull failed', profileRes.error);
  if (alarmRes.error) console.warn('[sync] alarm pull failed', alarmRes.error);
  if (baseRes.error) console.warn('[sync] baseline pull failed', baseRes.error);

  const pvtByCheckIn = new Map<string, Record<string, number | null>>();
  (pvtRows as unknown as { check_in_id: string }[]).forEach((r) =>
    pvtByCheckIn.set(r.check_in_id, r as unknown as Record<string, number | null>)
  );
  const faceByCheckIn = new Map<string, Record<string, number | null>>();
  (faceRows as unknown as { check_in_id: string }[]).forEach((r) =>
    faceByCheckIn.set(r.check_in_id, r as unknown as Record<string, number | null>)
  );

  /**
   * A check-in is its parent row *and* its two signal rows, so it is assembled only when all three
   * reads completed.
   *
   * The join is by id, and a signal row that was not fetched is indistinguishable from one that
   * does not exist — both are a miss in the map, and both used to produce `pvt: null`. That is not
   * a harmless approximation. A stripped record entering the local store is then, by every rule
   * downstream, a check-in whose measurement the user removed: `pendingPush` sees the signature
   * change and sends it, and `pushCheckIns` deletes the `pvt_results` and `facial_scan_results`
   * rows to match. One failed request on a new phone would have destroyed the account's real
   * measurements — from the device that had never seen them.
   *
   * Nothing is lost by waiting. The parent rows are still there next time, the merge is a union, and
   * `pushAll` withholds the check-in push on the same condition so the round trip cannot start.
   */
  if (!fetched.checkIns) console.warn('[sync] check-in signals incomplete; not restoring check-ins this pass');
  const checkIns: CheckInRecord[] = (fetched.checkIns ? (ciRows as unknown as RemoteCheckIn[]) : []).map((r) => {
    const ts = Date.parse(r.timestamp);
    const pvt = pvtByCheckIn.get(r.id);
    const face = faceByCheckIn.get(r.id);
    return {
      id: checkInLocalId(ts),
      timestamp: ts,
      triggerType: r.trigger_type,
      kss: r.kss_rating,
      sdi: r.computed_sdi,
      confidence: r.confidence_level,
      signalsUsed: r.signals_used,
      updatedAt: r.updated_at ? Date.parse(r.updated_at) : undefined,
      pvt: pvt
        ? {
            trialCount: Number(pvt.trial_count ?? 0),
            meanRt: Number(pvt.mean_rt ?? 0),
            medianRt: Number(pvt.median_rt ?? 0),
            lapses: Number(pvt.lapses ?? 0),
            falseStarts: Number(pvt.false_starts ?? 0),
            rtCv: Number(pvt.rt_cv ?? 0),
            timeOnTaskSlope: Number(pvt.time_on_task_slope ?? 0),
            zScore: Number(pvt.z_score_vs_baseline ?? 0),
          }
        : null,
      face: face
        ? {
            brightness: Number(face.brightness ?? 0),
            redness: Number(face.redness_idx ?? 0),
            periorbital: Number(face.periorbital_idx ?? 0),
            eyeContrast: Number(face.eye_contrast ?? 0),
            motion: Number(face.motion_idx ?? 0),
            stillnessMs: Number(face.stillness_ms ?? 0),
            provisional: Boolean(face.provisional),
            zScore: Number(face.z_score_vs_baseline ?? 0),
            // Absent on every row written before the eyelid channel existed, and left absent rather
            // than defaulted to 0 — a scan with no closure measurement is not a scan with the eyes
            // open, and `closureFraction` is optional precisely so that distinction survives.
            closureFraction: face.perclos == null ? undefined : Number(face.perclos),
            // Left undefined where absent, never defaulted: a scan from before a channel existed
            // did not measure zero of it.
            ear: face.ear_value == null ? undefined : Number(face.ear_value),
            mar: face.mar_value == null ? undefined : Number(face.mar_value),
            mouthCornerDrop: face.mouth_corner_drop == null ? undefined : Number(face.mouth_corner_drop),
            periorbitalLab: face.periorbital_lab == null ? undefined : Number(face.periorbital_lab),
            scleralRedness: face.scleral_redness == null ? undefined : Number(face.scleral_redness),
            skinToneL: face.skin_tone_delta == null ? undefined : Number(face.skin_tone_delta),
            skinToneChroma: face.skin_tone_chroma == null ? undefined : Number(face.skin_tone_chroma),
            photoUri: null, // the photo never left the device it was taken on
          }
        : null,
    };
  });

  const sleepLogs: SleepLogRecord[] = (logRows as unknown as SleepLogRow[]).map((r) => ({
    id: sleepLogLocalId(r.date),
    date: r.date,
    bedMin: r.bedtime_min,
    wakeMin: r.waketime_min,
    durationMin: r.duration_min,
    quality: r.quality,
    restPct: r.rest_pct ?? 0,
    updatedAt: r.updated_at ? Date.parse(r.updated_at) : undefined,
    source: 'manual',
  }));

  const baseRow = baseRes.data?.[0];
  const baseline: BaselineProfile | null = baseRow
    ? {
        pvtMeanRt: Number(baseRow.pvt_mean_rt),
        pvtStdRt: Number(baseRow.pvt_std_rt),
        createdAt: Date.parse(baseRow.created_at),
        // Left undefined where the account has no value, never defaulted: the scoring code treats
        // an absent circadian phase as "do not adjust", and a fabricated 0 would mean midnight.
        ...(baseRow.pvt_speed == null ? null : { pvtSpeed: Number(baseRow.pvt_speed) }),
        ...(baseRow.pvt_sessions == null ? null : { pvtSessions: Number(baseRow.pvt_sessions) }),
        ...(baseRow.captured_at_hour == null ? null : { capturedAtHour: Number(baseRow.captured_at_hour) }),
        ...(baseRow.captured_hours_awake == null ? null : { capturedHoursAwake: Number(baseRow.captured_hours_awake) }),
      }
    : null;

  // The facial baseline rides on the newest baseline_profiles row as numbers-only JSON.
  const faceBaseline = (baseRow?.facial_feature_baseline as SyncData['faceBaseline']) ?? null;

  const profileRow = profileRes.data?.[0] as Record<string, unknown> | undefined;
  const profile: RestoredProfile | null = profileRow
    ? {
        ageBand: (profileRow.age_range as string) ?? null,
        gender: (profileRow.gender as Gender | undefined) ?? null,
        medication:
          profileRow.medication_flag == null || profileRow.medication_flag === 'prefer_not_to_say'
            ? null
            : (profileRow.medication_flag as Medication),
        highStress: profileRow.high_stress == null ? null : Boolean(profileRow.high_stress),
        bedMin: profileRow.usual_bedtime_min == null ? null : Number(profileRow.usual_bedtime_min),
        wakeMin: profileRow.usual_wake_min == null ? null : Number(profileRow.usual_wake_min),
        idealWake: profileRow.natural_wake_min == null ? null : Number(profileRow.natural_wake_min),
        onboardingComplete: Boolean(profileRow.onboarding_complete),
        updatedAt: profileRow.updated_at ? Date.parse(String(profileRow.updated_at)) : 0,
      }
    : null;

  /**
   * Alarms the account says were deleted, and the ones that are still alive.
   *
   * A tombstoned row is not an alarm any more, so it is not restored — and its id is reported so a
   * device still holding that alarm can drop it. That is the half a stale phone needs: it deleted
   * nothing itself, so nothing local tells it the alarm is gone.
   */
  const alarmRows = (alarmRes.data ?? []) as Record<string, unknown>[];
  const deletedAlarmRowIds = alarmRows.filter((r) => r.deleted_at != null).map((r) => String(r.id));
  const liveAlarmRows = alarmRows.filter((r) => r.deleted_at == null);

  const alarms: Alarm[] = liveAlarmRows.map((r) => ({
    // The id this alarm had on the device that created it. Anything else would hash to a different
    // row on the next push and leave a duplicate behind; a row written before this column existed
    // has no id to give back, and a fresh one keyed on the row's own uuid is the closest safe thing.
    id: r.local_id == null ? uuidSeedToId(String(r.id)) : Number(r.local_id),
    // Kept so a later deletion can name this exact row. `alarmUuidFor` reproduces the address only
    // for rows written with a `local_id`; for the rest it addresses a row that has never existed.
    remoteId: String(r.id),
    updatedAt: r.updated_at ? Date.parse(String(r.updated_at)) : undefined,
    min: Number(r.time_min ?? 420),
    days: Array.isArray(r.days_active) ? (r.days_active as boolean[]) : [true, true, true, true, true, false, false],
    smart: Boolean(r.smart_wake_enabled),
    on: Boolean(r.is_on),
    sound: (r.sound as string) ?? '',
    label: (r.label as string) ?? '',
  }));

  /**
   * The snooze allowance, which is one setting written onto every alarm row.
   *
   * Taken from the first row that carries one: the rows are all written together from the same
   * single setting, so they agree, and a row from an older build that has none is skipped rather
   * than read as zero.
   */
  const alarmSettingRow = liveAlarmRows.find((r) => r.max_snoozes != null);
  const maxSnoozes = alarmSettingRow ? Number(alarmSettingRow.max_snoozes) : null;

  const debtRecords: DebtRecord[] = (debtRows as unknown as Record<string, unknown>[]).map((r) => ({
    date: String(r.date),
    wakeDebtHours: Number(r.wake_debt_hours ?? 0),
    nremDebtHours: Number(r.nrem_debt_hours ?? 0),
    remDebtHours: Number(r.rem_debt_hours ?? 0),
    compositeDebtHours: Number(r.composite_debt_score ?? 0),
  }));

  // The row uuid back to the alarm it belongs to, so a restored firing points at a restored alarm
  // rather than at a hash nothing can resolve.
  const alarmIdByUuid = new Map<string, number>();
  liveAlarmRows.forEach((r) =>
    alarmIdByUuid.set(String(r.id), r.local_id == null ? uuidSeedToId(String(r.id)) : Number(r.local_id))
  );

  const alarmEvents: AlarmEventRecord[] = (eventRows as unknown as Record<string, unknown>[]).map((r) => {
    const firedAt = Date.parse(String(r.fired_at));
    return {
      // The same natural key the device uses, so restoring twice produces one event, not two.
      id: `ae_${firedAt}`,
      alarmId: alarmIdByUuid.get(String(r.alarm_config_id)) ?? 0,
      firedAt,
      snoozeCount: Number(r.snooze_count ?? 0),
      dismissedAt: r.dismissed_at ? Date.parse(String(r.dismissed_at)) : null,
      dismissMethod: (r.dismiss_method as AlarmEventRecord['dismissMethod']) ?? null,
      // Not uploaded, so not restorable. The link from a firing to the check-in made off it lives
      // only on the device that made it; the check-in itself is restored either way.
      checkInId: null,
    };
  });

  const consentLog: ConsentRecord[] = ((consentRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    permissionType: r.permission_type as ConsentRecord['permissionType'],
    grantedAt: r.granted_at ? Date.parse(String(r.granted_at)) : null,
    revokedAt: r.revoked_at ? Date.parse(String(r.revoked_at)) : null,
  }));

  return { checkIns, sleepLogs, baseline, faceBaseline, profile, alarms, deletedAlarmRowIds, maxSnoozes, consentLog, debtRecords, alarmEvents, fetched };
}

// ---------------------------------------------------------------------------
// orchestration
// ---------------------------------------------------------------------------

export type SyncOutcome =
  | { status: 'ok'; checkIns: number; sleepLogs: number; hadBaseline: boolean }
  | { status: 'unconfigured' }
  | { status: 'signed-out' }
  | { status: 'error'; message: string };

/**
 * Full reconcile: pull what the account holds, merge it with what this device holds, write the
 * union back to both. This is what "Restore from another device" runs, and what runs once after a
 * sign-in.
 */
export async function syncNow(): Promise<SyncOutcome> {
  if (!isSupabaseConfigured) return { status: 'unconfigured' };

  try {
    // Inside the try, not before it. `getSession` reads the cached token first, but it refreshes an
    // expired one over the network — so on a phone with no signal it rejects, and it was the one
    // await in this function outside the guard. `signInFlow.ts` documents that syncNow never throws
    // and calls it without a catch, so an offline sign-in surfaced an unhandled rejection instead of
    // the "we'll sync later" path that was written for exactly this.
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return { status: 'signed-out' };

    const remote = await pullAll(userId);
    const s = useSomnoStore.getState();
    const local: SyncData = {
      checkIns: s.checkIns,
      sleepLogs: s.sleepLogs,
      baseline: s.baselineProfile ?? null,
      faceBaseline: s.faceBaseline,
      // Named here so the union keeps what this device holds. Omitted, the merge would have only
      // the account's side to offer and a restore would drop anything logged offline since.
      debtRecords: s.debtRecords,
      alarmEvents: s.alarmEvents,
      consentLog: s.consentLog,
      // The device's own alarms, so the merge can settle them one by one rather than choosing a
      // whole list. Without them here it only ever saw the account's side.
      alarms: s.alarms,
    };

    /**
     * The account's alarm tombstones, resolved against what this device is holding.
     *
     * Only here can it be done: the store knows the alarms, and this module knows how a local id
     * becomes an account row id. A row restored from before `local_id` existed carries its uuid on
     * the alarm itself, so both kinds resolve.
     */
    // Only when the alarm read succeeded: a query that failed returns no rows, which must not be
    // read as "the account has no tombstones" any more than as "the account has no alarms".
    const tombstoned = new Set(remote.fetched?.alarms === false ? [] : remote.deletedAlarmRowIds ?? []);
    const deletedAlarmIds = [
      ...new Set([
        ...useSomnoStore
          .getState()
          .alarms.filter((a) => tombstoned.has(a.remoteId ?? alarmUuidFor(userId, a.id)))
          .map((a) => a.id),
        // This device's own deletions, not yet carried out, count too — the alarm they name may
        // still be sitting in the account and would otherwise be merged straight back in.
        ...s.deletedAlarmIds,
      ]),
    ];

    const merged = mergeRecords(local, { ...remote, deletedAlarmIds });
    useSomnoStore.getState().applyRestoredData(merged);
    /**
     * What the account is now known to hold, so the background push can tell an unsent edit from a
     * stale copy of one another device has already changed.
     */
    if (remote.fetched?.alarms !== false) {
      remoteAlarmVersions.clear();
      (remote.alarms ?? []).forEach((a) => remoteAlarmVersions.set(a.id, a.updatedAt ?? 0));
      restoreState.alarmsKnownFor = userId;
    }
    /**
     * Only now may the background pushes replace anything.
     *
     * And only when the pull read the parts they would replace: a reconcile that could not reach
     * `profiles` has not restored this device, whatever else it managed, and a background push on
     * the strength of it would write defaults over a profile nobody has seen yet.
     */
    if (remote.fetched?.profile && remote.fetched.alarms) restoreState.restoredFor = userId;
    /**
     * What just came down is not news to the account.
     *
     * The subscriber that watches for new check-ins compares against these caches, and a restore
     * writes a whole history into the store at once — so without this, every restored record looked
     * new and was uploaded straight back, running the signal-delete pass over the entire history to
     * no purpose. `pushAll` below still sends the genuine difference, which is what `remote` is for.
     */
    merged.checkIns.forEach((c) => seenCheckIns.set(c.timestamp, checkInSignature(c)));
    merged.sleepLogs.forEach((l) => seenSleepLogs.add(l.date));
    // Push after merging so anything this device held that the account didn't now goes up too —
    // and only that, which is what `remote` is doing here.
    await pushAll(userId, remote);

    return {
      status: 'ok',
      checkIns: merged.checkIns.length,
      sleepLogs: merged.sleepLogs.length,
      hadBaseline: Boolean(merged.baseline),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed';
    console.warn('[sync] syncNow failed', e);
    return { status: 'error', message };
  }
}

/** Natural keys already pushed (or known to have come from the account) this session. */

/** Resolves once the persisted store has come back off disk. */
export function whenHydrated(): Promise<void> {
  if (useSomnoStore.getState().hasHydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useSomnoStore.subscribe((s) => {
      if (!s.hasHydrated) return;
      unsub();
      resolve();
    });
  });
}

/**
 * One reconcile at launch, for the device that was not the one the last check-in was made on.
 *
 * It waits for hydration first, and that wait is not optional: before the persisted state loads,
 * this device looks like it has no history at all, so syncing early would merge the account
 * against an empty local side and then be overwritten by hydration a moment later.
 */
async function syncOnLaunch(): Promise<void> {
  await whenHydrated();
  const { data } = await supabase.auth.getSession();
  if (data.session) await syncNow();
}

/**
 * Background push: whenever a new check-in or sleep log lands locally, send it up. Fire-and-forget
 * by design — a failure here is logged and dropped, never surfaced, because the local record is
 * already safe and the next `syncNow` will carry it. Call once at start; returns an unsubscribe.
 */
export function initSync(): () => void {
  if (!isSupabaseConfigured) return () => {};

  syncOnLaunch().catch((e) => console.warn('[sync] launch sync failed', e));

  let armed = false;

  // Hydration and a restore both replace the whole history in one go. Watching for records this
  // watcher has not itself seen — rather than for the array simply getting longer — is what stops
  // either event from being read as "the user just made 200 check-ins" and re-pushing all of them.
  const seed = () => {
    const s = useSomnoStore.getState();
    s.checkIns.forEach((c) => seenCheckIns.set(c.timestamp, checkInSignature(c)));
    s.sleepLogs.forEach((l) => seenSleepLogs.add(l.date));
  };
  whenHydrated().then(() => {
    seed();
    armed = true;
  });

  /**
   * Settings are watched as well as records.
   *
   * This subscriber only ever looked for new check-ins and sleep logs, so everything else — the
   * profile answers, the sleep window, the alarms, a fresh baseline — went up *only* when a check-in
   * happened to follow it. Change your alarms and your bedtime, lose your phone that evening, and
   * the account had none of it. The settings are small and change rarely, so the whole of them is
   * pushed on any change, debounced so that dragging a dial is one request rather than forty.
   */
  const settingsOf = (state: ReturnType<typeof useSomnoStore.getState>) =>
    JSON.stringify([
      state.age,
      state.gender,
      state.medication,
      state.highStress,
      state.bedMin,
      state.wakeMin,
      state.idealWake,
      state.onboardingComplete,
      state.baselineProfile?.createdAt ?? null,
      state.faceBaseline?.periorbital?.n ?? 0,
      state.alarms,
      // A deletion recorded but not yet carried out is itself a change worth pushing, and on the
      // path that matters most — the last alarm — the list it left behind is empty either way.
      state.deletedAlarmIds,
      state.deletedAlarmRowIds,
      state.maxSnoozes,
    ]);
  let prevSettings = settingsOf(useSomnoStore.getState());
  let settingsTimer: ReturnType<typeof setTimeout> | null = null;

  const pushSettingsSoon = () => {
    if (settingsTimer) clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
      settingsTimer = null;
      supabase.auth.getSession().then(({ data }) => {
        const userId = data.session?.user.id;
        if (!userId) return;
        const s = useSomnoStore.getState();
        /**
         * Only for the account this device's data actually belongs to.
         *
         * Between `claimDataFor` wiping the device and the new account's restore landing, the local
         * state is nobody's — and a push in that window would write a blank profile and an empty
         * sleep window over the incoming user's real ones. `dataOwnerId` is set the moment the claim
         * completes, so requiring it to match is a precise fence around exactly that gap.
         */
        if (s.dataOwnerId !== userId) return;
        /**
         * The profile row is replaced wholesale, so it waits for the restore.
         *
         * `dataOwnerId` alone is not enough: it is set the instant the claim completes, which is
         * before the pull has returned, and this device's untouched defaults are a perfectly
         * plausible profile to overwrite a real one with. Nothing is lost by waiting — `pushAll`
         * sends the current profile at the end of every reconcile.
         */
        if (restoreState.restoredFor === userId) {
          pushProfile(userId).catch((e) => console.warn('[sync] profile push failed', e));
        }
        // Additive: upserts the alarms this device has and carries out the deletions it recorded.
        pushAlarmsAndLogs(userId).catch((e) => console.warn('[sync] alarm push failed', e));
        if (s.baselineProfile) {
          pushBaseline(userId, s.baselineProfile).catch((e) => console.warn('[sync] baseline push failed', e));
        }
      });
    }, 2000);
  };

  const unsubscribe = useSomnoStore.subscribe((state) => {
    if (!armed) return;

    const nextSettings = settingsOf(state);
    if (nextSettings !== prevSettings) {
      prevSettings = nextSettings;
      pushSettingsSoon();
    }

    // Changed as well as new: an edit keeps its instant, so `has` reported every correction as
    // already uploaded and the account kept the reading the user had just rejected.
    const newCheckIns = state.checkIns.filter((c) => seenCheckIns.get(c.timestamp) !== checkInSignature(c));
    const newSleepLogs = state.sleepLogs.filter((l) => !seenSleepLogs.has(l.date));
    if (!newCheckIns.length && !newSleepLogs.length) return;
    seed();

    supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user.id;
      if (!userId) return; // local-only until there's an account; nothing is lost
      if (newCheckIns.length) {
        pushCheckIns(userId, newCheckIns).catch((e) => console.warn('[sync] check-in push failed', e));
      }
      if (newSleepLogs.length) {
        pushSleepLogs(userId, newSleepLogs).catch((e) => console.warn('[sync] sleep-log push failed', e));
      }
    });
  });

  return () => {
    if (settingsTimer) clearTimeout(settingsTimer);
    unsubscribe();
  };
}
