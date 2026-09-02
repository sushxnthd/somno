import type { FaceBaseline } from '../lib/faceBaseline';
import type { SessionSummary } from '../engine/pvt';

export type { FaceBaseline, SessionSummary };

export type ScreenId =
  | 'SPLASH' | 'AU1' | 'AU2' | 'AU3' | 'AU4' | 'AU5'
  | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'PVT' | 'SCAN' | 'SCANERR' | 'A8' | 'A9'
  | 'B'
  | 'C1' | 'C4' | 'C5' | 'CLOG'
  | 'D' | 'DL' | 'DD'
  | 'E'
  | 'F0' | 'F1' | 'F2' | 'F3' | 'F4' | 'F4E' | 'F4S' | 'F5' | 'F6' | 'F7' | 'F8' | 'FN' | 'F9' | 'F9E'
  | 'W1'
  | 'G1' | 'G3';

export type PermState = 'ask' | 'granted' | 'denied' | 'skip';

export type Gender = 'female' | 'male' | 'other' | 'unspecified';
export type Medication = 'none' | 'sedative' | 'stimulant' | 'antidepressant' | 'unspecified';

export interface Alarm {
  id: number;
  min: number;
  days: boolean[];
  smart: boolean;
  on: boolean;
  sound: string;
  label: string;
  /**
   * The account row this alarm was restored from, when it came from one.
   *
   * Every other row is addressed by hashing the local id, which only works for rows this app wrote.
   * A row from before `local_id` existed has no id to give back, so the local id is derived from the
   * row's uuid instead — a one-way hash. Deleting such an alarm therefore aimed at an address that
   * has never existed: the real row survived, and the next restore brought the alarm back and rang
   * it. Keeping the uuid is what lets a deletion name the row it actually means.
   */
  remoteId?: string;
  /**
   * When this alarm was last written on some device. See `CheckInRecord.updatedAt`.
   *
   * Deletion was made safe first, but a live edit was not: an alarm moved to 6:30 on the phone in
   * use was still overwritten with 7:00 by the one in a drawer, because the two versions were
   * indistinguishable. Absent on alarms written before this existed, which sort oldest and so never
   * overwrite a version somebody has actually edited.
   */
  updatedAt?: number;
}

export interface ChatMsg {
  r: 'u' | 'a';
  t: string;
}

export interface SheetContent {
  title: string;
  body: string;
  /**
   * An optional destructive choice. Present only for actions that cannot be undone, which is why
   * the sheet is the app's confirmation surface rather than the platform Alert: `Alert.alert` is an
   * empty function in react-native-web, so a dialog-based confirmation is silently unavailable on
   * one of the platforms this code runs on — and untestable in the interaction sweep on all of them.
   */
  confirm?: {
    label: string;
    onConfirm: () => void;
  };
}

export interface PVTMetricsRecord {
  trialCount: number;
  meanRt: number;
  medianRt: number;
  lapses: number;
  falseStarts: number;
  rtCv: number;
  timeOnTaskSlope: number;
  zScore: number;
}

/** Measured photometry from one face scan. See src/lib/faceFeatures.ts for how each is derived. */
export interface FaceMetricsRecord {
  /** Mean face luminance, 0..1. */
  brightness: number;
  /** Cheek redness index. */
  redness: number;
  /** Eye-region darkness relative to the cheeks. */
  periorbital: number;
  /** Eye-band edge energy over face edge energy — an eyelid-opening proxy, not a true EAR. */
  eyeContrast: number;
  /** Mean luminance change between frames — head steadiness. */
  motion: number;
  /** How long the frame series took. */
  stillnessMs: number;
  /** Deviation from this user's own facial baseline. Positive = more alert. */
  zScore: number;
  /**
   * Time-weighted fraction of the scan with the eyes closed — the heaviest channel in the face
   * score. Absent when the camera could not sample fast enough to measure it.
   */
  closureFraction?: number;
  /**
   * The architecture spec's facial feature vector (§7, FacialScanResult). All optional: each depends
   * on the detector returning contours or a usable region on that scan, and "not measured" has to
   * stay distinguishable from "measured as zero".
   */
  ear?: number;
  mar?: number;
  mouthCornerDrop?: number;
  periorbitalLab?: number;
  scleralRedness?: number;
  skinToneL?: number;
  skinToneChroma?: number;
  /** Closure episodes long enough to be a slow eyelid closure rather than a blink. */
  longClosures?: number;
  /** Frames per second the device managed, which is what decides whether the two above exist. */
  framesPerSecond?: number;
  /** True while the baseline is too thin to compare against; excluded from the fused score. */
  provisional: boolean;
  photoUri?: string | null;
}

export interface CheckInRecord {
  id: string;
  timestamp: number;
  /**
   * When this version of the check-in was written, by the clock of the device that wrote it.
   *
   * The instant identifies the check-in; this identifies the *version* of it. A check-in can be
   * corrected from the results screen, so two phones can hold the same check-in with different
   * contents, and without this the merge could only prefer whichever device was syncing — which
   * let a phone that had been in a drawer overwrite a correction made on the one in use. Optional
   * because records written before this existed have no version; those sort oldest.
   */
  updatedAt?: number;
  triggerType: 'manual' | 'morning' | 'midday' | 'evening' | 'alarm';
  pvt: PVTMetricsRecord | null;
  face: FaceMetricsRecord | null;
  kss: number | null;
  sdi: number;
  confidence: 'high' | 'medium' | 'low';
  signalsUsed: number;
}

export interface SleepLogRecord {
  id: string;
  date: string;
  bedMin: number;
  wakeMin: number;
  durationMin: number;
  quality: 'Restless' | 'Okay' | 'Solid';
  restPct: number;
  /** See `CheckInRecord.updatedAt`. A night can be re-logged, so a date has versions too. */
  updatedAt?: number;
  source: 'manual';
}

/**
 * One firing of one alarm, from ring to dismissal — the spec's AlarmEvent.
 *
 * Kept because the alarm is the feature with the most safety weight in the product: if snoozing
 * ever fails to cap, or the escape hatch stops being reachable, this is the record that shows it.
 */
export interface AlarmEventRecord {
  id: string;
  alarmId: number;
  firedAt: number;
  snoozeCount: number;
  dismissedAt: number | null;
  dismissMethod: 'checkin_passed' | 'checkin_snoozed_out' | 'manual_stop' | null;
  /** The check-in made from the alarm screen, if the user chose to do one. */
  checkInId: string | null;
}

/** A grant or revocation of one permission — the spec's ConsentLog, append-only. */
export interface ConsentRecord {
  id: string;
  permissionType: 'consent' | 'camera' | 'notifications' | 'calendar' | 'health' | 'screen_time';
  grantedAt: number | null;
  revokedAt: number | null;
}

/** A day's computed debt, kept so the trend is history rather than a re-derivation. */
export interface DebtRecord {
  date: string;
  wakeDebtHours: number;
  nremDebtHours: number;
  remDebtHours: number;
  compositeDebtHours: number;
}

export interface BaselineProfile {
  pvtMeanRt: number;
  pvtStdRt: number;
  createdAt: number;
  /** Mean 1/RT of the baseline test, in reciprocal seconds. See engine/pvt.ts. */
  pvtSpeed?: number;
  /** How many sessions the estimate is built from. One means it is still a first guess. */
  pvtSessions?: number;
  /**
   * The circadian phase the baseline was taken at: local hour, and hours since waking.
   *
   * Without these, every later check-in is compared against a baseline whose time of day is
   * unknown, and the comparison silently attributes the body clock's swing to sleep loss. Absent
   * on baselines recorded before this existed, in which case no adjustment is applied at all.
   */
  capturedAtHour?: number;
  capturedHoursAwake?: number;
}

export interface SomnoState {
  screen: ScreenId;
  history: ScreenId[];
  slide: number;
  consent: boolean;
  authMode: 'signup' | 'signin';
  /**
   * The signed-in account's email address.
   *
   * Identity, not input. Written only from a Supabase session — by `finishSignIn` and by the
   * auth-state subscription that keeps it current — so what Settings shows is what actually signs
   * this person in.
   */
  email: string;
  /**
   * The address typed into a sign-in, signup or password-recovery form.
   *
   * Held separately from [email] because binding a form to identity meant typing in one changed the
   * other: the recovery screen, reachable from Settings while signed in, rewrote the account's
   * address as the user typed a different one to send a reset link to. Cleared once a session is
   * established, since at that point the session is the authority.
   */
  authEmail: string;
  pass: string;
  code: string;
  /** What the six-digit screen is confirming: a new account, or a password reset. */
  codeMode: 'signup' | 'recovery';
  /** Name for the greeting, from the account when it has one. Empty means greet without a name. */
  displayName: string;
  bedMin: number;
  wakeMin: number;
  idealWake: number;
  aiMsgs: ChatMsg[];
  aiInput: string;
  lowLight: boolean;
  /** Only the two the app actually asks the system for. */
  perms: { cam: PermState; notif: PermState };
  age: number;
  /**
   * Optional, and "unspecified" is always available. Used only for the recovery engine's
   * documented Wake→NREM / NREM→Wake / NREM→REM bump factors, never for anything else.
   */
  gender: Gender;
  /**
   * A category, deliberately not a drug name — the spec's coarse-not-precise rule. The engine
   * applies different transitions for a sedative than for an antidepressant, which is why this is
   * an enum and not the yes/no toggle it used to be.
   */
  medication: Medication;
  /** Self-reported sustained load. One of the paper's bump factors. */
  highStress: boolean;
  pvtTrial: number;
  pvtTimes: number[];
  pvtLive: boolean;
  pvtFalse: boolean;
  lastMs: number | null;
  baseline: number;
  baselineTrials: number;
  scanPct: number;
  scanDone: boolean;
  /**
   * Why the last scan could not be scored, or null if it was.
   *
   * Held in the store rather than only in the scan screen's local state because the *hand-off*
   * depends on it: a scan that found no face must not walk the user onward as though it had.
   */
  scanFailure: 'no-face' | 'too-dark' | 'unstable' | 'no-frames' | null;
  kss: number | null;
  /**
   * The check-in record currently being built or edited, once one exists.
   *
   * Null while a check-in is in progress with nothing committed yet. Set on the first commit, so a
   * re-rating from the results screen updates that record instead of appending a second — the
   * behaviour that turned one morning's check-in into two history entries and two trend points.
   * Cleared by `resetCheckInSignals`, which is what makes the *next* check-in a new record.
   */
  activeCheckInId: string | null;
  /**
   * Which account the health data on this device belongs to.
   *
   * Null while the app has only ever been used without an account — that data is unclaimed, and the
   * first account to sign in adopts it, which is the intended "keep what I recorded before signing
   * up" path. Once set, a *different* account signing in on the same device must not inherit it.
   *
   * Sign-out deliberately leaves the data and this id in place, so signing back into the same
   * account is instant and lossless. It is the mismatch that triggers a wipe, not the sign-out.
   */
  dataOwnerId: string | null;
  sdi: number;
  /**
   * Today's SDI against the weekly average, or null when there is no average yet.
   *
   * Nullable because the average is. It was previously computed against a hardcoded 64 for an empty
   * history, so a first-ever check-in reported a precise difference from a week that never happened.
   */
  delta: number | null;
  signals: number;
  alarmMin: number;
  days: boolean[];
  smartWake: boolean;
  alarms: Alarm[];
  /**
   * Alarms the user has deleted, kept until the account has been told.
   *
   * A deletion used to be inferred from absence: the reconcile deleted every remote row whose id
   * was not in the local list. That is only sound immediately after a pull, so the background push
   * could not delete at all — and deleting your only alarm while offline left the row in the
   * account, where the next restore handed it back and it rang. A tombstone says "this one, on
   * purpose", which is true whether the local list is complete or empty.
   */
  deletedAlarmIds: number[];
  /**
   * The same deletions, addressed by account row id, for alarms that were restored.
   *
   * A separate list rather than a pair because nothing here needs pairing: both name rows to
   * delete, and deleting a row that is already gone is not an error. It exists because hashing the
   * local id reaches only the rows this app wrote — a row restored from before `local_id` existed
   * is reachable by its own uuid and by nothing else.
   */
  deletedAlarmRowIds: string[];
  editId: number | null;
  alarmSound: string;
  alarmLabel: string;
  vibrate: boolean;
  logBed: number;
  logWake: number;
  logQuality: 'Restless' | 'Okay' | 'Solid';
  logRest: number;
  snoozes: number;
  snoozeLen: number;
  /**
   * Whether the last snooze actually armed another firing.
   *
   * Kept so the alarm screen can tell the truth about it. A snooze the device refused — no native
   * module, an exact-alarm permission revoked mid-session — must not be reported as a snooze that
   * was set, because the whole point is that the user goes back to sleep on the strength of it.
   */
  snoozeArmed: boolean;
  sheet: SheetContent | null;
  range: '7' | '30' | '90';
  lesson: number;
  hasData: boolean;
  maxSnoozes: number;
  scanOptimize: boolean;
  /** True once the user has connected their calendar. Permission itself is the OS's answer. */
  noteM: boolean;
  noteW: boolean;
  noteK: boolean;
  /** The monthly "refresh your baseline" nudge. */
  noteR: boolean;
  faq: number;
  /** Whether tonight's wind-down reminder has been set from the Recovery tab. */
  /**
   * When tonight's bedtime reminder is due, as an epoch instant, or null if none is scheduled.
   *
   * This was a boolean, and it was neither date-aware nor persisted. Set it on Monday and the
   * Recovery button stayed "Reminder set for tonight ✓" and disabled on Tuesday and Wednesday, for
   * a notification that had already fired on Monday night — while a restart flipped it back to
   * false and offered to set a reminder that was already scheduled. The instant answers both: it is
   * set if it is still in the future, and it survives a restart.
   */
  tonightReminderAt: number | null;
  /**
   * An in-progress recalibration and everything it has measured so far, or null.
   *
   * Nothing in here is live. The recalibration screen promises "nothing is replaced if you back
   * out", and the only way to keep that promise across a flow with two independent steps is to
   * measure into this object and apply the whole of it at the end — so a tap test that finished and
   * a scan that was then cancelled leaves the user with exactly the baseline they started with,
   * rather than half of a new one. `finishRecalibration` is the commit; anything else discards it.
   *
   * Transient and deliberately not persisted: a recalibration interrupted by the app being killed
   * is not one to resume, and a stale entry would make a later face scan overwrite the baseline.
   */
  /**
   * Set when the age was recovered from the account's coarse band rather than entered here.
   *
   * The account stores a band, never a birthdate (§6), so a restore can only approximate — and an
   * approximation that looks like an answer is the kind of thing a sleep-need target should not be
   * built on silently. The Profile screen shows a line asking the user to confirm it, and clears
   * this the moment they touch the control.
   */
  ageNeedsConfirming: boolean;
  /**
   * When a personal factor was last changed on this device.
   *
   * The account has one profile row and every device writes it, so "newest wins" is the only
   * tie-break available — there is no per-field history to merge. Zero means never written here,
   * which loses to any account that has been written at all.
   */
  profileUpdatedAt: number;
  recalibration: {
    /** A replacement facial calibration, measured but not yet applied. */
    faceBaseline: FaceBaseline | null;
    /** A replacement reaction-time baseline, measured but not yet applied. */
    baseline: BaselineProfile | null;
    /** The session behind [baseline]; the pool restarts from it, since the person has changed. */
    session: SessionSummary | null;
    /** Trials in the completed run, so the summary screen can state it before anything is applied. */
    trials: number;
  } | null;
  hover: { k: string; i: number } | null;

  // real history + derived engine state
  checkIns: CheckInRecord[];
  sleepLogs: SleepLogRecord[];
  baselineProfile: BaselineProfile | null;
  /**
   * Robust summaries of past reaction-time sessions, newest last.
   *
   * The raw trials are not kept — these are what the baseline is recomputed from, and they are
   * four numbers each rather than a growing record of every tap the user has ever made.
   */
  pvtSessions: SessionSummary[];
  pvtFalseStartCount: number;
  lastFaceMetrics: FaceMetricsRecord | null;
  /** Running mean/variance of this user's own facial measurements. See src/lib/faceBaseline.ts. */
  faceBaseline: FaceBaseline | null;
  alarmEvents: AlarmEventRecord[];
  consentLog: ConsentRecord[];
  debtRecords: DebtRecord[];
  hasHydrated: boolean;
  onboardingComplete: boolean;

  // internal (not persisted-relevant) refs
  pvtTotal: number;
  pvtNext: ScreenId | 'A8' | 'C3' | 'GSCAN' | null;
  scanNext: ScreenId | null;
}
