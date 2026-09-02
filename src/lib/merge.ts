import type { Alarm, AlarmEventRecord, BaselineProfile, CheckInRecord, ConsentRecord, DebtRecord, FaceBaseline, Gender, Medication, SleepLogRecord } from '../store/types';

/**
 * The merge rules for two-way sync, kept in their own module with no imports that touch the
 * network, the store or React Native.
 *
 * This is the part of sync most able to lose data silently — a bad rule here doesn't crash, it
 * just quietly drops a night — so it is pure, and `scripts/test-merge.ts` exercises it directly
 * under plain node, with no Supabase project and no device involved.
 */

export interface SyncData {
  checkIns: CheckInRecord[];
  sleepLogs: SleepLogRecord[];
  baseline: BaselineProfile | null;
  faceBaseline: FaceBaseline | null;
  /**
   * The account's personal factors and alarms, when the pull found them.
   *
   * Both are model-critical and neither used to come back: a returning user restored a year of
   * check-ins onto a phone that computed their sleep debt against a default target, with no stress
   * flag, no sleep window and no alarms — a restore that looked complete and scored like a stranger.
   * Optional because a local-only merge has neither, and because an account written by an older
   * build may not have them either.
   */
  profile?: RestoredProfile | null;
  alarms?: Alarm[] | null;
  /**
   * The account's alarm tombstones — rows marked deleted rather than removed.
   *
   * A device that did not do the deleting has nothing local to tell it the alarm is gone, so the
   * account has to say so. Without it the second phone kept the alarm, pushed it back, and the one
   * it was deleted from was woken by it again on the next restore.
   */
  deletedAlarmRowIds?: string[] | null;
  /**
   * The same tombstones, already resolved to the local ids this device knows them by.
   *
   * Resolving needs the account id and the uuid derivation, both of which live in sync.ts, so it is
   * done there and handed in. Every id here is deleted whoever said so — this device's own pending
   * deletions are folded in too — and a tombstone beats any live version of the same alarm however
   * recently it was edited. A deletion is a decision; an edit is a detail of something that no
   * longer exists.
   */
  deletedAlarmIds?: number[] | null;
  /**
   * The snooze allowance the account holds.
   *
   * Stored on every alarm row and uploaded from the start, but never read back, so a restore left
   * the phone enforcing this build's default of three regardless of what the user had chosen. It
   * is one setting rather than one per alarm, so the account's rows agree and the first is taken.
   */
  maxSnoozes?: number | null;
  /**
   * Which parts of the remote side were actually read.
   *
   * A failed query and an empty table both produce no rows, and the two must not be treated alike:
   * "the account has no alarms" is an instruction to delete, while "the alarms query failed" is an
   * instruction to do nothing. Reading the second as the first is how a flaky connection turns into
   * a wiped profile and a set of alarms deleted from the account before the restore that would have
   * brought them back.
   *
   * Absent on a purely local payload, where nothing was fetched and nothing may be pushed on the
   * strength of it.
   */
  fetched?: { profile: boolean; alarms: boolean; checkIns: boolean; sleepLogs: boolean; baseline: boolean };
  /**
   * The account's consent trail.
   *
   * Append-only and never rewritten, so restoring it is a straight copy rather than a merge. It was
   * uploaded and never read back, which left the export — the one place a user goes to *get* their
   * consent history — unable to produce it on any device but the one it was granted on.
   */
  consentLog?: ConsentRecord[] | null;
  /**
   * The nightly debt snapshots and the record of alarms that rang.
   *
   * Both were uploaded from the first build and neither was read back. The snapshots in particular
   * cannot be rebuilt: each was taken with the model as it stood on the night it covers, so
   * recomputing them from today's would quietly rewrite the past. Both are also named in the
   * export, which a restored phone could therefore not honour.
   */
  debtRecords?: DebtRecord[] | null;
  alarmEvents?: AlarmEventRecord[] | null;
}

/**
 * What the account knows about the person, as far as privacy allows.
 *
 * The age is a *band*, not a number — that is what is stored (schema §6), and it is all that is
 * needed to pick a sleep-need target. Restoring it therefore recovers a range rather than the exact
 * figure the user set, which is why `ageIsApproximate` exists: the app asks them to confirm rather
 * than presenting a number it guessed as one they entered.
 */
export interface RestoredProfile {
  ageBand: string | null;
  gender: Gender | null;
  medication: Medication | null;
  highStress: boolean | null;
  bedMin: number | null;
  wakeMin: number | null;
  idealWake: number | null;
  onboardingComplete: boolean;
  /**
   * When the account's profile row was last written, by the clock of the device that wrote it.
   *
   * One row shared by every device, and the push replaced it unconditionally — so a phone that had
   * been in a drawer for a month overwrote the sleep window someone had corrected that morning.
   * Zero for a row written before this column existed, which loses to any device that has answers.
   */
  updatedAt: number;
}

/**
 * The midpoint of a stored age band, or null for one this build does not know.
 *
 * A band is all the account holds — a birthdate is not needed to pick a sleep-need target and is
 * deliberately not stored — so a restore can only ever recover an approximation. It is applied so
 * the model has something defensible to work from, and flagged so the app asks rather than
 * presenting a number it inferred as one the user typed.
 */
export function ageFromBand(band: string | null): number | null {
  switch (band) {
    case 'under-18':
      return 17;
    case '18-24':
      return 21;
    case '25-34':
      return 30;
    case '35-44':
      return 40;
    case '45-54':
      return 50;
    case '55-64':
      return 60;
    case '65-plus':
      return 70;
    default:
      return null;
  }
}

/** A check-in's identity is its instant, so the local id is derived from it and is stable. */
export const checkInLocalId = (timestampMs: number) => `ci_${timestampMs}`;
/** A sleep log's identity is its date. */
export const sleepLogLocalId = (date: string) => `sl_${date}`;

/**
 * Union of two naturally-keyed collections, local winning a tie, sorted by key.
 *
 * Null when neither side has anything, so "this build pulled nothing" stays distinguishable from
 * "the account holds an empty list" all the way to the store.
 */
function unionBy<T>(a: T[] | null | undefined, b: T[] | null | undefined, key: (x: T) => string): T[] | null {
  if (!a && !b) return null;
  const byKey = new Map<string, T>();
  (b ?? []).forEach((x) => byKey.set(key(x), x));
  (a ?? []).forEach((x) => byKey.set(key(x), x));
  return [...byKey.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([, v]) => v);
}

/**
 * Which version of each alarm this device should hold.
 *
 * Alarms were merged as a *set*: the account's list was adopted only onto a phone that had none of
 * its own, because two lists of alarms have no safe union — the same 7am on both sides is one alarm
 * or two depending on what the user meant. That is still true of alarms the two sides do not share,
 * and they are still left alone. What it got wrong is the alarms they *do* share, which are not
 * ambiguous at all: the local id round-trips through the account, so the same id on both sides is
 * one alarm in two versions, and refusing to merge meant a phone in a drawer kept 7:00 and pushed
 * it back over the 6:30 someone had set that morning.
 *
 * So: same id, newer `updatedAt` wins; different ids, both sides keep what they have. Alarms with
 * no version — written before the column existed — count as oldest and therefore never overwrite a
 * version somebody has actually edited, which is what keeps a legacy account safe to restore from.
 *
 * Tombstones come first and are not negotiable. A deleted alarm is gone whatever either side thinks
 * it looks like, so an edit racing a deletion loses: reviving an alarm is the failure that wakes
 * somebody at 6am, and losing an edit to an alarm that no longer exists costs nothing.
 */
export function mergeAlarms(
  local: Alarm[] | null | undefined,
  remote: Alarm[] | null | undefined,
  deletedIds: number[] | null | undefined
): Alarm[] | null {
  if (!local && !remote) return null;
  const gone = new Set(deletedIds ?? []);
  const mine = (local ?? []).filter((a) => !gone.has(a.id));
  const theirs = (remote ?? []).filter((a) => !gone.has(a.id));

  // A phone with no alarms of its own takes the account's, which is what makes a new device useful.
  if (!mine.length) return theirs;

  const byId = new Map(theirs.map((a) => [a.id, a]));
  return mine.map((a) => {
    const other = byId.get(a.id);
    return other && (other.updatedAt ?? 0) > (a.updatedAt ?? 0) ? { ...other, remoteId: other.remoteId ?? a.remoteId } : a;
  });
}

/**
 * The alarms worth sending, given what the account is known to already hold.
 *
 * The push upserts every alarm this device has, which is correct right after a merge and wrong at
 * every other moment: the background push fires on any settings change, so editing one alarm sent
 * all of them — including a stale copy of an alarm another device had since changed, overwriting it.
 * An alarm the account holds a strictly newer version of is not an unsent change.
 */
export function pendingAlarmPush(alarms: Alarm[], remoteVersions: Map<number, number>): Alarm[] {
  return alarms.filter((a) => (a.updatedAt ?? 0) >= (remoteVersions.get(a.id) ?? 0));
}

/**
 * Union of local and remote, keyed on natural identity.
 *
 * Two records sharing a key are two versions of one record, not two records: a check-in can be
 * corrected from the results screen and a night can be re-logged. Which version survives is decided
 * by `updatedAt`, stamped when it was written — so the later write wins regardless of which device
 * happens to be syncing. Local still wins an actual tie, because that is the device the user is
 * holding and the copy they can see. The newer baseline wins outright, since recalibration is
 * explicitly meant to supersede.
 */
export function mergeRecords(local: SyncData, remote: SyncData): SyncData {
  /**
   * Which of two versions of one record survives.
   *
   * Local used to win every tie, which is only right when the two sides differ because this device
   * knows something the account does not. With a second phone in the picture that stopped being
   * true: a device left in a drawer holds an *older* copy of the same check-in, and letting it win
   * meant the correction someone made that morning on the phone they actually use was replaced by
   * the reading they had rejected — and then pushed back over it.
   *
   * `updatedAt` is stamped at the moment of the write, so the later write wins. Records from before
   * it existed have none and count as oldest, which keeps the previous behaviour for them: two
   * unversioned copies tie, and local still wins a tie because it is the copy the user can see.
   */
  const newer = <T extends { updatedAt?: number }>(mine: T, theirs: T): T =>
    (theirs.updatedAt ?? 0) > (mine.updatedAt ?? 0) ? theirs : mine;

  const checkIns = new Map<number, CheckInRecord>();
  local.checkIns.forEach((c) => checkIns.set(c.timestamp, c));
  remote.checkIns.forEach((c) => {
    const mine = checkIns.get(c.timestamp);
    checkIns.set(c.timestamp, mine ? newer(mine, c) : c);
  });

  const logs = new Map<string, SleepLogRecord>();
  local.sleepLogs.forEach((l) => logs.set(l.date, l));
  remote.sleepLogs.forEach((r) => {
    const mine = logs.get(r.date);
    logs.set(r.date, mine ? newer(mine, r) : r);
  });

  const baseline =
    !local.baseline ? remote.baseline
    : !remote.baseline ? local.baseline
    : remote.baseline.createdAt > local.baseline.createdAt ? remote.baseline
    : local.baseline;

  // Two Welford states cannot be added together — they were computed from overlapping scans, and
  // combining them would count the shared ones twice. The one built from more scans is the more
  // complete picture of the same face, so it wins; an equal count falls back to the more recent.
  const fa = local.faceBaseline;
  const fb = remote.faceBaseline;
  const faceBaseline =
    !fa ? fb
    : !fb ? fa
    : fb.periorbital.n > fa.periorbital.n ? fb
    : fa.periorbital.n > fb.periorbital.n ? fa
    : fb.updatedAt > fa.updatedAt ? fb
    : fa;

  return {
    checkIns: [...checkIns.values()].sort((a, b) => a.timestamp - b.timestamp),
    sleepLogs: [...logs.values()].sort((a, b) => a.date.localeCompare(b.date)),
    baseline,
    faceBaseline,
    /**
     * Carried through, not merged.
     *
     * These two arrive from the account and there is nothing on the local side of this function to
     * merge them against — `SyncData` for the local device is built without them. Dropping them
     * here, which is what this used to do, made the whole restore inert: `pullAll` fetched the
     * profile and the alarms, `mergeRecords` silently discarded both, and `applyRestoredData` was
     * handed a payload that had never contained them. Every guard downstream was correct and
     * unreachable.
     *
     * Whether they are *applied* is the store's decision, not this one — see `applyRestoredData`,
     * which refuses to overwrite a device that has answers of its own.
     */
    // Newest wins here too, and for the same reason as the records above: whichever device wrote
    // the profile last is the one holding the answers the user most recently gave.
    profile:
      remote.profile && local.profile
        ? remote.profile.updatedAt > local.profile.updatedAt
          ? remote.profile
          : local.profile
        : remote.profile ?? local.profile ?? null,
    alarms: mergeAlarms(local.alarms, remote.alarms, remote.deletedAlarmIds),
    maxSnoozes: remote.maxSnoozes ?? local.maxSnoozes ?? null,
    deletedAlarmRowIds: remote.deletedAlarmRowIds ?? local.deletedAlarmRowIds ?? null,
    // Provenance travels with them: "the account has no profile" and "we could not ask" are
    // different facts, and only one of them may be acted on. See `fetched` on SyncData.
    fetched: remote.fetched ?? local.fetched,
    /**
     * Both are keyed naturally — a debt snapshot *is* its date, a firing *is* its instant — so a
     * union keyed on that is exact, and the local copy wins where the two disagree because it was
     * written by the device that was there.
     */
    debtRecords: unionBy(local.debtRecords, remote.debtRecords, (d) => d.date),
    alarmEvents: unionBy(local.alarmEvents, remote.alarmEvents, (e) => e.id),
    /**
     * Union by content, not by id.
     *
     * The trail is append-only, so neither side may drop an entry the other has — but the two sides
     * name the same entry differently: locally it is `cl_<time>`, remotely a row uuid the database
     * generated. Keyed on the id, every restore would file a second copy of every grant the user
     * had ever given. The content *is* the entry: which permission, granted when, revoked when.
     */
    consentLog: (() => {
      const key = (c: ConsentRecord) => `${c.permissionType}|${c.grantedAt ?? ''}|${c.revokedAt ?? ''}`;
      const byKey = new Map<string, ConsentRecord>();
      (local.consentLog ?? []).forEach((c) => byKey.set(key(c), c));
      (remote.consentLog ?? []).forEach((c) => {
        if (!byKey.has(key(c))) byKey.set(key(c), c);
      });
      return byKey.size ? [...byKey.values()].sort((a, b) => (a.grantedAt ?? a.revokedAt ?? 0) - (b.grantedAt ?? b.revokedAt ?? 0)) : null;
    })(),
  };
}

/**
 * What the account is actually missing.
 *
 * Every write is an upsert, so pushing everything is *correct* — but a year of use is roughly a
 * thousand rows, and re-sending all of them on every launch is minutes of radio on a phone that
 * gained nothing by it. The reconcile has already read the remote side, so the difference is free
 * to compute here rather than paid for in requests.
 *
 * A check-in is immutable — its timestamp is the event — so the account having one at that instant
 * is enough to skip it. A night can be re-logged, and nothing records when, so a date the account
 * already holds is only skipped when the values match; an edit still goes up.
 */
/**
 * Everything about a check-in that a correction can change.
 *
 * A check-in's *identity* is its instant, which is what makes push and pull idempotent — but the
 * results screen can now re-run the scan, re-run the tap test or re-rate, and all three deliberately
 * keep that instant so the correction lands on the same record rather than inventing a second
 * morning. The upload's "have we sent this?" test was still `has the account got this timestamp`,
 * so every one of those corrections was filtered out and never reached the account: the phone showed
 * the corrected reading and the account kept the one the user had rejected.
 *
 * The signature is what the account would store, so two records with the same signature genuinely
 * have nothing to send.
 */
export function checkInSignature(c: CheckInRecord): string {
  const pvt = c.pvt
    ? [c.pvt.trialCount, c.pvt.meanRt, c.pvt.medianRt, c.pvt.lapses, c.pvt.falseStarts, c.pvt.rtCv, c.pvt.timeOnTaskSlope, c.pvt.zScore].join(',')
    : '-';
  /**
   * Every field the scan puts in the account, and only those.
   *
   * The signature decides whether a corrected check-in is sent, so a measurement missing from it is
   * a measurement that can be corrected on the phone and stay wrong in the account forever. Six of
   * the spec's facial channels were missing — a rerun that changed only the mouth or skin-tone
   * readings produced an identical signature and was silently treated as already uploaded.
   *
   * `longClosures`, `framesPerSecond` and `photoUri` are deliberately absent: the first two are not
   * uploaded, and the photo never leaves the device, so none of them can differ from what the
   * account holds.
   */
  const face = c.face
    ? [
        c.face.brightness,
        c.face.redness,
        c.face.periorbital,
        c.face.eyeContrast,
        c.face.motion,
        c.face.stillnessMs,
        c.face.zScore,
        c.face.provisional,
        c.face.closureFraction ?? '',
        c.face.ear ?? '',
        c.face.mar ?? '',
        c.face.mouthCornerDrop ?? '',
        c.face.periorbitalLab ?? '',
        c.face.scleralRedness ?? '',
        c.face.skinToneL ?? '',
        c.face.skinToneChroma ?? '',
      ].join(',')
    : '-';
  return [c.triggerType, c.kss ?? '', c.sdi, c.confidence, c.signalsUsed, pvt, face].join('|');
}

export function pendingPush(local: SyncData, remote: SyncData): { checkIns: CheckInRecord[]; sleepLogs: SleepLogRecord[] } {
  const remoteCheckIns = new Map(remote.checkIns.map((c) => [c.timestamp, checkInSignature(c)]));
  const remoteCheckInAt = new Map(remote.checkIns.map((c) => [c.timestamp, c.updatedAt ?? 0]));
  const remoteLogs = new Map(remote.sleepLogs.map((l) => [l.date, l]));
  const sameNight = (a: SleepLogRecord, b: SleepLogRecord) =>
    a.bedMin === b.bedMin &&
    a.wakeMin === b.wakeMin &&
    a.durationMin === b.durationMin &&
    a.quality === b.quality &&
    a.restPct === b.restPct;

  /**
   * Nothing goes up when the account's check-ins were not read whole.
   *
   * A check-in is its parent row plus its PVT and face rows, and the push writes all three — then
   * deletes the signal rows the record it sent does not carry, which is how a rerun the user
   * cancelled stops the old measurement reappearing. That rule is only safe against a remote side
   * this device has actually seen. If the signal reads failed, every local record differs from the
   * half-read remote one by signature, so all of them would be re-sent and every one of them would
   * take the delete pass with it — wiping real measurements from the account on the strength of a
   * request that never arrived. Skipping the pass costs one sync; getting it wrong is unrecoverable.
   */
  const wholeRemote = remote.fetched ? remote.fetched.checkIns : true;

  return {
    // Absent *or changed*. Keyed on the timestamp alone, a corrected check-in looked identical to
    // one already sent and was never uploaded.
    /**
     * Different *and* not already superseded.
     *
     * A stale device differs from the account in both directions at once: it is missing corrections
     * made elsewhere, and it holds the versions those corrections replaced. Sending everything that
     * differs pushed the second kind back over the first, so the phone in a drawer got the last
     * word. `updatedAt` is what separates the two — a local copy older than the account's is not an
     * unsent change, it is the change that was already undone.
     */
    checkIns: wholeRemote
      ? local.checkIns.filter(
          (c) =>
            remoteCheckIns.get(c.timestamp) !== checkInSignature(c) &&
            (c.updatedAt ?? 0) >= (remoteCheckInAt.get(c.timestamp) ?? 0)
        )
      : [],
    sleepLogs: local.sleepLogs.filter((l) => {
      const r = remoteLogs.get(l.date);
      return (!r || !sameNight(l, r)) && (!r || (l.updatedAt ?? 0) >= (r.updatedAt ?? 0));
    }),
  };
}

/**
 * What this process has already pushed, keyed the way the records are identified.
 *
 * Module-level and therefore outliving any store reset, which is wrong the moment the data under
 * them changes owner: after a wipe or an account switch they still held the previous data's natural
 * keys, and `pendingPush` filters by exactly those — so a record whose key had been seen before was
 * silently never uploaded. Sleep logs made that concrete rather than theoretical, because their key
 * is a *date*: wiping the app and re-logging last night produced a record whose date was already in
 * the set, and it never reached the account.
 *
 * They live here rather than in sync.ts because sync.ts imports the store and the store needs to
 * clear them on a wipe — which would be an import cycle. This module imports nothing of either.
 */
/**
 * Keyed by instant, valued by content, for the same reason `pendingPush` compares signatures: an
 * edit keeps its instant, so a set of instants reported every correction as already sent.
 */
export const seenCheckIns = new Map<number, string>();
export const seenSleepLogs = new Set<string>();
/** The version of each alarm the account was last seen holding. See `pendingAlarmPush`. */
export const remoteAlarmVersions = new Map<number, number>();

/**
 * The account whose data this device has successfully read back, if any.
 *
 * Until a pull has completed, an empty local store is not evidence of an empty account — it is a
 * device that has not been told yet. Writes that can *replace* what the account holds are held
 * back until this matches, so the window between signing in and the restore landing cannot be used
 * to push a fresh install's defaults over a real profile. Cleared by a wipe, because after one the
 * device has again been told nothing.
 */
export const restoreState: { restoredFor: string | null; alarmsKnownFor: string | null } = {
  restoredFor: null,
  // Set once a pull has actually read the account's alarms. Until then this device does not know
  // what the account holds, so it must not upsert alarms it may be holding a stale copy of.
  alarmsKnownFor: null,
};

export function resetSyncCaches(): void {
  seenCheckIns.clear();
  seenSleepLogs.clear();
  remoteAlarmVersions.clear();
  restoreState.restoredFor = null;
  restoreState.alarmsKnownFor = null;
}
