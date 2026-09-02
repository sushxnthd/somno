import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fmt, dur } from '../utils/format';
import { addLocalDays, deviceUses24HourClock, localDateKey, localDayNumber, startOfLocalDay } from '../utils/clock';
import { aiReply } from '../data/content';
import { computePVTMetrics, responseSpeedOf, summarizeSession, baselineFrom } from '../engine/pvt';
import { circadianAdjustment } from '../engine/alertness';
import { fuseSDI, kssToZ, debtToZ, precisionOf } from '../engine/sdi';
import { haptics } from '../theme/haptics';
import {
  recommendedBedtimeMin,
  napWindow,
  recoveryTrajectory,
  simulateHypnogram,
  type HypnogramSegment,
  type PersonalFactors,
} from '../engine/recovery';
import { computeStreak, pickInsight, weeklyReview } from '../engine/insights';
import { regularityWord, sleepRegularityIndex, strongestDriver, type Driver } from '../engine/trends';
import { bestWindow, dailyAlertnessCurve, wakeLevelAfterSleep, worstWindow } from '../engine/alertness';
import { recalibrateFaceBaseline, updateFaceBaseline } from '../lib/faceBaseline';
import { chronotypeDriftMin, MISALIGNED_MIN } from '../utils/chronotype';
import { cancelAllNativeAlarms, cancelNativeSnooze, setNativeVibrate, snoozeNativeAlarm, stopAlarmSound } from '../lib/alarmSound';
import { alarmFromOnboarding, nativeIdFor, snoozeLengthFor } from '../lib/alarmPlan';
import { accumulatedDebt, debtPattern, MIN_AGE, nightsToClear, type DebtLedger } from '../engine/debt';
import { splitAccumulatedDebt } from '../engine/stages';
import { ageFromBand, resetSyncCaches, restoreState, sleepLogLocalId, type RestoredProfile } from '../lib/merge';
import { FACE_SCAN_MS } from '../lib/faceCapture';
import type {
  Alarm,
  SessionSummary,
  AlarmEventRecord,
  ConsentRecord,
  DebtRecord,
  BaselineProfile,
  ChatMsg,
  CheckInRecord,
  FaceBaseline,
  FaceMetricsRecord,
  Gender,
  Medication,
  PermState,
  ScreenId,
  SheetContent,
  SleepLogRecord,
  SomnoState,
} from './types';

interface Actions {
  go: (screen: ScreenId) => void;
  back: () => void;

  // onboarding carousel
  setSlide: (n: number) => void;
  nextSlide: () => void;

  // auth
  /** Sets the signed-in account's address. Called from a Supabase session, not from a text field. */
  setEmail: (v: string) => void;
  /**
   * Sets the address currently typed into a sign-in, signup or recovery form.
   *
   * Separate from [setEmail] because they mean different things, and one screen made that painfully
   * clear: "Change password" from Settings opens the recovery screen, which bound its field
   * straight to `email` — so typing a colleague's address to send *them* a reset link rewrote the
   * signed-in account's identity everywhere in the app, before any authentication had happened.
   */
  setAuthEmail: (v: string) => void;
  setDisplayName: (v: string) => void;
  setPass: (v: string) => void;
  toggleAuthMode: () => void;
  submitAuth: () => void;
  skipAuth: () => void;
  completeSignIn: () => void;
  setCodeMode: (m: 'signup' | 'recovery') => void;
  pressCodeKey: (k: string) => void;
  verifyCode: () => void;
  signOut: () => void;
  /** Forgets the signed-in account without touching this device's history. See the implementation. */
  clearAccountIdentity: () => void;
  wipeLocalData: () => Promise<void>;
  /**
   * Makes this device's data belong to `userId`, wiping it first if it belonged to someone else.
   *
   * Called before the first sync of a sign-in. Without it, signing into account B on a phone that
   * had been used by account A merged A's check-ins and sleep logs into the local store and then
   * *uploaded them into B's account* — one person's health history silently copied into another's,
   * on nothing more than sharing a handset.
   */
  claimDataFor: (userId: string) => Promise<void>;
  applyRestoredData: (data: {
    checkIns: CheckInRecord[];
    sleepLogs: SleepLogRecord[];
    baseline: BaselineProfile | null;
    faceBaseline?: FaceBaseline | null;
    /** The account's personal factors and alarms, when it has them. See the implementation. */
    profile?: RestoredProfile | null;
    alarms?: Alarm[] | null;
    /** How many snoozes the account allows. Stored remotely, so restored rather than defaulted. */
    maxSnoozes?: number | null;
    /** The consent trail. Append-only, so restoring it is a union rather than a replacement. */
    consentLog?: ConsentRecord[] | null;
    /** Nightly debt snapshots and the record of alarms that rang, both already unioned. */
    debtRecords?: DebtRecord[] | null;
    alarmEvents?: AlarmEventRecord[] | null;
  }) => void;

  // consent / permissions
  toggleConsent: () => void;
  consentContinue: () => void;
  setPerm: (k: keyof SomnoState['perms']) => void;
  setPermValue: (k: keyof SomnoState['perms'], v: PermState) => void;

  // profile
  setAge: (n: number) => void;
  setGender: (g: Gender) => void;
  setMedication: (m: Medication) => void;
  toggleHighStress: () => void;
  setBedMin: (n: number) => void;
  setWakeMin: (n: number) => void;
  setIdealWake: (n: number) => void;
  bumpBed: (dir: 1 | -1, step?: number) => void;
  bumpWake: (dir: 1 | -1, step?: number) => void;
  bumpIdeal: (dir: 1 | -1, step?: number) => void;

  // PVT
  startPvt: (total: number, next: SomnoState['pvtNext']) => void;
  pvtTap: () => void;
  abortTest: () => void;

  // face scan
  startScan: (next: ScreenId) => void;
  skipScan: () => void;
  toggleLowLight: () => void;
  retryScan: () => void;
  setFaceMetrics: (m: FaceMetricsRecord | null) => void;
  setScanFailure: (f: SomnoState['scanFailure']) => void;
  /**
   * Clears every signal belonging to one check-in.
   *
   * Every entry point into a check-in must call this. Without it the signals are module-level
   * leftovers: `startPvt` reset the tap test and nothing else, Quick Rating navigated straight to
   * the rating screen resetting nothing at all, and the alarm session reset only the snooze count.
   * So a Quick Rating fused yesterday's face scan, a second check-in inherited the first one's
   * eyelid measurements, and a scan that was skipped this time still scored from the last one.
   */
  resetCheckInSignals: () => void;
  /**
   * Whether the alarm currently ringing has Smart Wake on.
   *
   * Defaults to true when no alarm can be resolved — the in-app preview has no configured alarm
   * behind it, and it exists to demonstrate the full behaviour.
   */
  smartWakeActive: () => boolean;
  /** The scan currently in progress. Async camera work must re-check this before writing. */
  currentScanGeneration: () => number;
  /** Re-run one signal of the check-in already on the results screen, without starting a new one. */
  rerunFaceScan: () => void;
  rerunPvt: () => void;
  editRating: () => void;
  /** Quick Rating: a check-in that is only a KSS rating, and must not inherit anything else. */
  startQuickRating: () => void;
  /**
   * Clears the facial calibration and starts a fresh reaction-time baseline run.
   *
   * The face baseline freezes once calibrated, which is what stops it drifting toward a chronically
   * tired face — but it also meant nothing could ever unfreeze it. The Recalibrate screen ran the
   * tap test only, so a user whose face had genuinely changed (a beard, new medication, a different
   * room they scan in) had no way to say so, and every later scan was compared against a reference
   * that no longer described them. This is that path.
   */
  recalibrateBaseline: () => void;
  /** Ends a recalibration and returns to Settings. Clears the flag so no later scan resets anything. */
  finishRecalibration: () => void;
  setFaceScanWork: (p: Promise<unknown> | null) => void;

  // KSS + scoring
  setKss: (n: number) => void;
  submitKss: () => void;

  // alarm (onboarding + settings dial)
  setAlarmMin: (n: number) => void;
  alarmEarlier: () => void;
  alarmLater: () => void;
  toggleDay: (i: number) => void;
  toggleSmartWake: () => void;
  finishOnboarding: () => void;

  // alarm-fire interstitial
  beginAlarmSession: (alarmId?: number) => void;
  startAlarmDemo: () => void;
  startAlarmPvt: () => void;
  computeAlarm: () => void;
  snooze: () => void;
  stopAlarm: (method?: AlarmEventRecord['dismissMethod']) => void;
  logConsent: (type: ConsentRecord['permissionType'], granted: boolean) => void;

  // check-in flow
  startDailyCheckin: () => void;

  // recovery / lessons
  openLesson: (i: number) => void;
  nextLesson: () => void;
  /** Records the instant tonight's reminder will fire. See `tonightReminderAt`. */
  markTonightReminderSet: (at: number) => void;
  /** Whether a bedtime reminder is scheduled and still ahead of now. */
  tonightReminderPending: () => boolean;
  askAi: (q: string) => void;
  setAiInput: (v: string) => void;

  // trends
  setRange: (r: '7' | '30' | '90') => void;
  setHover: (h: { k: string; i: number } | null) => void;

  // settings: alarms CRUD
  openAlarm: (id: number) => void;
  newAlarm: () => void;
  /**
   * Saves the alarm being edited. Returns false, and saves nothing, when it would never ring.
   *
   * An alarm with no days selected is stored happily by `AlarmManager` logic that then finds no
   * next occurrence — so it appeared in the list, switched on, and silently never fired.
   */
  saveAlarm: () => boolean;
  deleteAlarm: () => void;
  /** Forgets tombstones the account has now acted on. Sync's, not the UI's. */
  clearAlarmTombstones: (ids: number[], rowIds: string[]) => void;
  toggleAlarmOn: (id: number) => void;
  setAlarmSound: (s: string) => void;
  setAlarmLabel: (s: string) => void;
  toggleVibrate: () => void;
  setMaxSnoozes: (n: number) => void;

  // settings: toggles
  toggleScanOptimize: () => void;
  toggleNoteMorning: () => void;
  toggleNoteWind: () => void;
  toggleNoteWeekly: () => void;
  toggleNoteRecal: () => void;
  setFaq: (i: number) => void;

  // sleep log
  setLogBed: (n: number) => void;
  setLogWake: (n: number) => void;
  bumpLogBed: (dir: 1 | -1, step: number) => void;
  bumpLogWake: (dir: 1 | -1, step: number) => void;
  setLogQuality: (q: SomnoState['logQuality']) => void;
  setLogRest: (n: number) => void;
  /**
   * Opens the sleep log with the fields seeded from what this person actually does.
   *
   * The two time wheels started at 23:52 and 06:41 — a pair of oddly precise numbers carried over
   * from the design mockup, belonging to nobody. Every user began by dialling away from a stranger's
   * night, and the precision made them look like a reading rather than a starting point.
   */
  startSleepLog: () => void;
  saveLog: () => void;

  // sheet (bottom-sheet explainer)
  openSheet: (title: string, body: string) => void;
  openConfirm: (sheet: SheetContent) => void;
  closeSheet: () => void;

  // derived getters (non-reactive helpers)
  avgMs: () => number;
  score: () => number;
  hoursAwakeNow: (at?: number) => number;
  is24h: () => boolean;
  fmtMin: (m: number) => string;
  personalFactors: () => PersonalFactors;

  // Real-data selectors. Where history is too thin to say anything, they return nothing and the
  // screen renders the absence — never an illustrative series dressed as a measurement.
  /** Null until there is at least one check-in to average. */
  weeklyAverageSdi: () => number | null;
  todayDebt: () => ReturnType<typeof stageSplitOf>;
  sdiHistory: (range: '7' | '30' | '90') => { v: number; l: string }[];
  pvtHistory: () => { v: number; l: string }[];
  recoveryCurve: () => number[];
  tonightRecommendation: () => { bedtimeMin: number; nap: { startMin: number; endMin: number } | null };
}

export type SomnoStore = SomnoState & Actions;

let pvtTimer: ReturnType<typeof setTimeout> | null = null;
let scanTimer: ReturnType<typeof setInterval> | null = null;
// The "hand off to the next screen" delays that run after a PVT/scan finishes. These MUST be
// cancellable: they navigate, so if the user leaves the test in the ~650-900ms window between
// completion and hand-off, a stray timer would yank them onto an unrelated screen.
let handoffTimer: ReturnType<typeof setTimeout> | null = null;
let stimAt = 0;
/** Ends a trial nobody answered. See TRIAL_TIMEOUT_MS. */
let lapseTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * Which scan is current.
 *
 * Bumped by every `startScan` and by `resetCheckInSignals`. The scan screen captures the value when
 * it begins and checks it again before writing anything, so an abandoned scan cannot land in a
 * newer check-in. Clearing `faceScanWork` alone was not enough: dropping the reference does not
 * cancel the promise, and a six-second capture that the user walked out of still resolved a few
 * seconds later and called `setFaceMetrics` — into whatever check-in happened to be open by then.
 */
let scanGeneration = 0;

/** The in-flight capture-and-measure for the current scan. See startScan's hand-off. */
let faceScanWork: Promise<unknown> | null = null;

function clearTimers() {
  if (pvtTimer) clearTimeout(pvtTimer);
  if (lapseTimer) clearTimeout(lapseTimer);
  if (scanTimer) clearInterval(scanTimer);
  if (handoffTimer) clearTimeout(handoffTimer);
  pvtTimer = null;
  lapseTimer = null;
  scanTimer = null;
  handoffTimer = null;
}

/**
 * Trial counts.
 *
 * The baseline used to be 32 trials against the daily test's 12, on the reasoning that a baseline
 * has to establish a distribution and longer tests are more sensitive. Both halves of that were
 * wrong in practice.
 *
 * A user reported the first half: 32 trials is long enough to lose concentration in, so the run
 * measured the end of their patience rather than their reaction time. The second half is worse and
 * quieter — reaction time degrades with time on task *within* a session, so a 32-trial calibration
 * measures a slower person than a 12-trial check-in ever will. Every later comparison was then made
 * against a number inflated by fatigue the daily test does not reproduce, and flattered by it.
 *
 * A baseline must be the same task as the thing it is a baseline for. So calibration is now the
 * daily protocol, once — about a minute — and the estimate improves from there as real sessions
 * accumulate, which is both shorter and more accurate than one long run could be. See
 * `baselineFrom` in engine/pvt.ts for how the sessions are combined.
 *
 * The lapse threshold follows the length automatically — see lapseThreshold in engine/pvt.ts.
 */
/**
 * The snooze length when the user has turned off "face scan sets snooze length".
 *
 * Nine minutes, which is what a mechanical alarm clock's snooze gear happened to give and what
 * every clock since has copied. There is nothing sacred about it; it is simply the length people
 * expect from a fixed snooze.
 */
export const FIXED_SNOOZE_MIN = 9;

export const BASELINE_PVT_TRIALS = 9;
export const DAILY_PVT_TRIALS = 9;
/** The alarm's check-in is shorter still: it runs on someone who has just opened their eyes. */
export const ALARM_PVT_TRIALS = 5;

/**
 * How many past sessions the baseline is allowed to look at.
 *
 * Enough that the estimate settles, few enough that it can still follow a real change in the
 * person — someone who starts sleeping properly, or who ages a year. A baseline anchored to
 * everything they have ever done would eventually stop describing them.
 */
const BASELINE_SESSION_WINDOW = 30;

/** Turns an already-stored baseline back into the session it came from, for continuity. */
function seedSessionFrom(profile: BaselineProfile | null, trials: number): SessionSummary[] {
  if (!profile || !profile.pvtMeanRt) return [];
  const speed = profile.pvtSpeed && profile.pvtSpeed > 0 ? profile.pvtSpeed : 1000 / profile.pvtMeanRt;
  return [
    {
      speed: Number(speed.toFixed(3)),
      speedSd: 0,
      meanRt: profile.pvtMeanRt,
      sdRt: profile.pvtStdRt || 40,
      n: Math.max(3, trials || 12),
    },
  ];
}

/**
 * Folds a finished check-in's reaction times into the baseline.
 *
 * The calibration run is one session taken on the day someone installed a sleep app, by which
 * point they had never done the task before — practice effects are largest exactly there. Rather
 * than trust it forever, every later test is another sample of the same person, and the estimate
 * of what they can do when rested improves as they accumulate. `baselineFrom` takes the best
 * quarter of them, so tired mornings inform the *spread* without redefining the person's normal.
 *
 * Returns a partial state, or nothing at all when there is no baseline to refine yet or the run
 * was too short to summarise.
 */
function refineBaseline(state: SomnoState, times: number[]): Partial<SomnoState> {
  if (!state.baselineProfile || times.length < 6) return {};
  const session = summarizeSession(times);
  if (session.n < 3) return {};

  // An empty pool with a baseline already in hand means this device calibrated before the pool
  // existed. Seeding it from that baseline keeps the estimate continuous: without it, the first
  // check-in after an update would throw away a real calibration and replace it with whatever a
  // single — possibly exhausted — morning happened to produce.
  const existing = state.pvtSessions?.length
    ? state.pvtSessions
    : seedSessionFrom(state.baselineProfile, state.baselineTrials);

  const sessions = [...existing, session].slice(-BASELINE_SESSION_WINDOW);
  const estimate = baselineFrom(sessions);
  if (!estimate) return { pvtSessions: sessions };

  return {
    pvtSessions: sessions,
    baseline: estimate.meanRt,
    baselineProfile: {
      ...state.baselineProfile,
      pvtMeanRt: estimate.meanRt,
      pvtStdRt: estimate.sdRt,
      pvtSpeed: estimate.speed,
      pvtSessions: estimate.sessions,
    },
  };
}

const mod1440 = (n: number) => ((n % 1440) + 1440) % 1440;

function stddevOf(xs: number[]): number {
  if (xs.length < 2) return 40;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Which part of the day a check-in belongs to.
 *
 * Alertness has a circadian shape, so the hour a check-in happened is part of what it means. The
 * boundaries are the ordinary ones — morning until noon, midday until six — and a check-in taken
 * from the alarm screen overrides all of them.
 */
function triggerTypeFor(ts: number): CheckInRecord['triggerType'] {
  const hour = new Date(ts).getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'midday';
  return 'evening';
}

function appendConsent(log: ConsentRecord[], permissionType: ConsentRecord['permissionType'], granted: boolean): ConsentRecord[] {
  return [
    ...log,
    {
      id: `cl_${Date.now()}_${permissionType}`,
      permissionType,
      grantedAt: granted ? Date.now() : null,
      revokedAt: granted ? null : Date.now(),
    },
  ];
}

/**
 * The debt ledger's total, divided into the kinds of sleep the shortfall actually took.
 *
 * Replaces `splitDebtByStage`, which derived the division from one stochastic walk of a chain built
 * by averaging two mathematically incompatible matrices — see engine/stages.ts for what that
 * produced. The split now follows the published within-night architecture, so it needs the person's
 * sleep need, what they typically sleep, and how rested they say they feel, rather than a score.
 */
function stageSplitOf(
  compositeDebtHours: number,
  needHours: number,
  logs: SleepLogRecord[]
): { wakeDebtHours: number; nremDebtHours: number; remDebtHours: number; compositeDebtHours: number } {
  // A typical recent night, not the single latest one: the split describes a standing debt built
  // over several nights, so one unusual Saturday should not reshape it.
  const recent = [...logs].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const typicalHours = recent.length
    ? recent.map((l) => l.durationMin / 60).sort((a, b) => a - b)[Math.floor(recent.length / 2)]
    : needHours;
  const restedFraction = recent.length
    ? recent.reduce((a, l) => a + l.restPct, 0) / recent.length / 100
    : 1;

  const split = splitAccumulatedDebt(compositeDebtHours, needHours, typicalHours, restedFraction);
  return {
    wakeDebtHours: split.wakeHours,
    nremDebtHours: split.nremHours,
    remDebtHours: split.remHours,
    compositeDebtHours: split.compositeDebtHours,
  };
}

/**
 * The most recent night, by the date it is filed under.
 *
 * Not `logs[logs.length - 1]`. The array is kept sorted, but "most recently appended" and "most
 * recent night" are different questions the moment a night is re-logged or a restore interleaves
 * another device's history, and every screen that asks this one means the latter.
 */
function latestLog(logs: SleepLogRecord[]): SleepLogRecord | undefined {
  let best: SleepLogRecord | undefined;
  for (const l of logs) if (!best || l.date > best.date) best = l;
  return best;
}

/** The id of the alarm currently ringing, or -1 if this is a preview or nothing is in flight. */
function liveAlarmId(events: AlarmEventRecord[]): number {
  if (!events.length) return -1;
  const last = events[events.length - 1];
  return last.dismissedAt ? -1 : last.alarmId;
}

/** Adds a snooze to the alarm event currently in flight, if there is one. */
function bumpSnooze(events: AlarmEventRecord[]): AlarmEventRecord[] {
  if (!events.length) return events;
  const last = events[events.length - 1];
  if (last.dismissedAt) return events;
  return [...events.slice(0, -1), { ...last, snoozeCount: last.snoozeCount + 1 }];
}

/** Closes the open alarm event. A no-op when the last one is already closed. */
function closeAlarmEvent(events: AlarmEventRecord[], method: AlarmEventRecord['dismissMethod']): AlarmEventRecord[] {
  if (!events.length) return events;
  const last = events[events.length - 1];
  if (last.dismissedAt) return events;
  return [...events.slice(0, -1), { ...last, dismissedAt: Date.now(), dismissMethod: method }];
}

/** True while a check-in launched from the alarm interstitial is in flight. */
let alarmCheckIn = false;

/**
 * Confidence is about how much the score can be trusted, which is two questions, not one: how many
 * signals were collected, and how well established the baseline they are compared against is.
 *
 * Four signals measured against a baseline set an hour ago is not high confidence — every z-score
 * in it is a comparison with a single sample. The spec says as much: confidence is a function of
 * signals present *and* days of baseline history.
 */
function confidenceFor(signals: number, baseline: BaselineProfile | null, checkInCount: number): 'high' | 'medium' | 'low' {
  const baselineDays = baseline ? (Date.now() - baseline.createdAt) / 86_400_000 : 0;
  const settled = baselineDays >= 3 && checkInCount >= 3;
  if (signals >= 4 && settled) return 'high';
  if (signals >= 2) return 'medium';
  return 'low';
}

/**
 * The mean SDI of the last seven check-ins, or null when there are none.
 *
 * It used to return 64 for an empty history. That number is not a default, it is a reading — the
 * home screen renders `sdi - weeklyAverage` as "+7 vs your weekly average", so a brand-new user's
 * very first check-in was compared against a week they had never had, and the app stated the
 * difference to the point. The comparison is unavailable until there is something to compare with,
 * and every caller now has to say so rather than being handed a number.
 */
function weeklyAverageOf(checkIns: CheckInRecord[]): number | null {
  const recent = checkIns.slice(-7);
  if (!recent.length) return null;
  return Math.round(recent.reduce((a, c) => a + c.sdi, 0) / recent.length);
}

/** `sdi` against the weekly average, or null when there is no average to measure it against. */
function deltaAgainstWeek(sdi: number, checkIns: CheckInRecord[]): number | null {
  const average = weeklyAverageOf(checkIns);
  return average == null ? null : sdi - average;
}

/*
 * There is deliberately no demo data here any more.
 *
 * The app used to carry three invented series — an SDI history, a run of reaction times, and a
 * 4.2-hour sleep debt — and render them on Trends, Recovery and Home whenever the real history was
 * too thin. They were labelled "Example" in some places and not in others, and a user who had been
 * using the app for a week reasonably concluded the screens were not showing their data. They were
 * not.
 *
 * An empty chart that says why it is empty is worth more than a full one that is about nobody. It
 * is also the only version that tells the user their check-ins are going somewhere.
 */

export const useSomnoStore = create<SomnoStore>()(
  persist(
    (set, get) => ({
      screen: 'SPLASH',
      history: [],
      slide: 0,
      consent: false,
      authMode: 'signup',
      email: '',
      authEmail: '',
      pass: '',
      code: '',
      codeMode: 'signup',
      displayName: '',
      bedMin: 1410,
      wakeMin: 420,
      idealWake: 480,
      aiMsgs: [],
      aiInput: '',
      lowLight: false,
      perms: { cam: 'ask', notif: 'ask' },
      age: 27,
      gender: 'unspecified',
      medication: 'none',
      highStress: false,
      pvtTrial: 0,
      pvtTimes: [],
      pvtLive: false,
      pvtFalse: false,
      lastMs: null,
      baseline: 312,
      /**
       * Nothing has been measured yet, and the app now says so.
       *
       * These five fields shipped with the design mockup's numbers baked in: a Sleep Deprivation Index of
       * 72, "+8 vs your weekly average", four contributing signals, and a completed twelve-trial
       * baseline. A brand-new install therefore opened on a large, confident score that no
       * measurement had produced, and claimed to have been calibrated against a reaction-time
       * baseline that had never been taken — which then became the number every later check-in was
       * scored against. The home screen renders a dash until there is a check-in behind it.
       */
      baselineTrials: 0,
      scanPct: 0,
      scanDone: false,
      scanFailure: null,
      kss: null,
      activeCheckInId: null,
      dataOwnerId: null,
      sdi: 0,
      delta: 0,
      signals: 0,
      alarmMin: 420,
      days: [true, true, true, true, true, false, false],
      smartWake: true,
      /**
       * No alarms. The app used to ship with two, copied from the design's mockup: a 07:00 weekday
       * alarm that was switched **on**, and an 08:30 weekend one, both with invented tone names.
       *
       * A user who set their own alarm for the evening was still woken at seven the next morning by
       * an alarm they had never created, which is the single worst thing an alarm clock can do — and
       * it reads exactly like the app having the wrong time. An alarm exists because somebody asked
       * for it. Onboarding's dial is where the first one comes from.
       */
      alarms: [],
      deletedAlarmIds: [],
      deletedAlarmRowIds: [],
      editId: null,
      alarmSound: '',
      alarmLabel: 'Weekday',
      vibrate: true,
      logBed: 1432,
      logWake: 401,
      logQuality: 'Okay',
      logRest: 62,
      snoozes: 0,
      snoozeLen: 7,
      snoozeArmed: false,
      sheet: null,
      range: '30',
      lesson: 0,
      // No data on a device that was installed a minute ago.
      hasData: false,
      maxSnoozes: 3,
      scanOptimize: true,
      noteM: true,
      noteW: true,
      noteK: true,
      noteR: true,
      faq: 0, // prototype opens the first FAQ item by default
      tonightReminderAt: null,
      ageNeedsConfirming: false,
      profileUpdatedAt: 0,
      recalibration: null,
      hover: null,
      checkIns: [],
      sleepLogs: [],
      baselineProfile: null,
      pvtSessions: [],
      pvtFalseStartCount: 0,
      lastFaceMetrics: null,
      faceBaseline: null,
      alarmEvents: [],
      consentLog: [],
      debtRecords: [],
      hasHydrated: false,
      onboardingComplete: false,
      pvtTotal: BASELINE_PVT_TRIALS,
      pvtNext: null,
      scanNext: null,

      go: (screen) => {
        clearTimers();
        set((s) => ({
          screen,
          history: s.screen === screen ? s.history : [...s.history, s.screen],
          onboardingComplete: screen === 'B' ? true : s.onboardingComplete,
          // Navigating dismisses any open explainer sheet. Without this, a programmatic
          // navigation while a sheet is up — the alarm firing, a notification tap, the end of a
          // test — leaves its full-screen backdrop mounted with nothing visible on it, and the
          // app silently stops responding to every touch.
          sheet: null,
        }));
      },
      back: () => {
        const h = get().history.slice();
        const prev = h.pop();
        clearTimers();
        if (prev) set({ screen: prev, history: h });
      },

      setSlide: (n) => set({ slide: n }),
      nextSlide: () => {
        const s = get();
        if (s.slide < 2) set({ slide: s.slide + 1 });
        else get().go('A2');
      },

      setEmail: (v) => set({ email: v }),
      setAuthEmail: (v) => set({ authEmail: v }),
      setDisplayName: (v) => set({ displayName: v }),
      setPass: (v) => set({ pass: v }),
      toggleAuthMode: () => set((s) => ({ authMode: s.authMode === 'signup' ? 'signin' : 'signup' })),
      submitAuth: () => get().go('AU3'),
      skipAuth: () => get().go('A1'),
      // Where a successful sign-in lands. An account that already carries a baseline has been
      // through onboarding on some device, so re-running consent and calibration would be asking
      // the user to redo work the account already holds; a fresh account starts at A1.
      completeSignIn: () => {
        const s = get();
        set({ pass: '', code: '' });
        get().go(s.baselineProfile || s.onboardingComplete ? 'B' : 'A1');
      },
      setCodeMode: (m) => set({ codeMode: m, code: '' }),
      pressCodeKey: (k) =>
        set((s) => {
          if (!k) return {};
          if (k === '⌫') return { code: s.code.slice(0, -1) };
          return { code: (s.code + k).slice(0, 6) };
        }),
      verifyCode: () => get().go('A1'),
      signOut: () => {
        /**
         * `displayName` goes with the rest of the identity.
         *
         * It is persisted, and nothing but a Supabase session ever writes it — so leaving it behind
         * meant the phone went on greeting the person who signed out. "Good morning, Maya" on Home
         * and Maya's name on an Account screen reading "Not signed in", to whoever picked the phone
         * up next. The health data staying is deliberate and is claimed or wiped at the next
         * sign-in; a name on the home screen is just somebody else's, immediately.
         */
        set({ email: '', authEmail: '', displayName: '', pass: '', code: '' });
        get().go('AU1');
      },

      /**
       * Forgets who is signed in, and nothing else.
       *
       * For a sign-out this device did not initiate: an admin revoked the session, the password was
       * changed on another phone, the refresh token was reused, the account was deleted elsewhere.
       * Supabase reports all of those as `SIGNED_OUT`, and the app has to stop claiming to be signed
       * in as somebody it no longer is.
       *
       * Three deliberate differences from [signOut]. The history stays: it is the user's own data,
       * it lives on this device, and the app is fully usable without an account — erasing months of
       * check-ins because a token expired would be a far worse bug than a stale email. `dataOwnerId`
       * stays too, so signing back in as the same person is recognised and adopts it, while signing
       * in as somebody else still wipes. And there is no navigation: this can arrive at any moment,
       * including mid-check-in, and throwing the user to a sign-in screen out of nowhere is not an
       * improvement on letting them finish.
       */
      clearAccountIdentity: () => {
        // Signing out ends what this device has been told. Signing back in has to pull again before
        // any write may replace what the account holds — someone else's phone may have moved on.
        restoreState.restoredFor = null;
        set({ email: '', authEmail: '', displayName: '', pass: '', code: '' });
      },

      /**
       * Erases everything this device holds and returns the app to a first-run state.
       *
       * Deleting an account has to leave nothing behind locally either, and this has to work for
       * someone who never made an account at all — on this app most people's entire history only
       * ever existed on the phone. The persisted blob is removed before the in-memory reset, so a
       * crash in between cannot resurrect the old state on next launch.
       */
      claimDataFor: async (userId) => {
        const owner = get().dataOwnerId;
        if (owner === userId) return;
        // Unclaimed data is adopted rather than destroyed: someone who used the app for a fortnight
        // before making an account expects that fortnight to come with them.
        if (owner != null) await get().wipeLocalData();
        set({ dataOwnerId: userId });
      },

      wipeLocalData: async () => {
        clearTimers();
        // What this process believes it has already uploaded belonged to the data being erased.
        resetSyncCaches();
        // Alarms are the one piece of local state that keeps acting after the app is closed, so
        // they have to be taken down *before* the data behind them goes. Leaving them meant the
        // next person to sign in on this device was woken by the last person's alarm — and, since
        // the recurrence lives in native SharedPreferences, it would have kept happening whether
        // or not the app was ever opened again.
        cancelAllNativeAlarms(get().alarms);
        await AsyncStorage.removeItem('somno-storage').catch(() => {});
        set({
          checkIns: [],
          sleepLogs: [],
          debtRecords: [],
          alarmEvents: [],
          consentLog: [],
          alarms: [],
          // Dropped, not carried over. A tombstone names a local alarm id and is applied against
          // whichever account is signed in, so keeping the previous user's would aim a delete at a
          // row belonging to the new one. A wipe is not a deletion the user asked the account for.
          deletedAlarmIds: [],
          deletedAlarmRowIds: [],
          editId: null,
          baselineProfile: null,
          pvtSessions: [],
          faceBaseline: null,
          lastFaceMetrics: null,
          dataOwnerId: null,
          activeCheckInId: null,
          baseline: 312,
          baselineTrials: 0,
          pvtTimes: [],
          pvtFalseStartCount: 0,
          // Every identity field, not most of them. `displayName` was missing, and it is persisted
          // and only ever written from a session — so a wipe left the previous user's first name
          // greeting whoever came next on Home, on a device that had just erased everything else
          // about them. It leaked through both routes into here: deleting an account, and signing
          // in as somebody new on a phone that belonged to someone else.
          email: '',
          authEmail: '',
          displayName: '',
          pass: '',
          code: '',
          kss: null,
          // Zero, not the mockup's 72/8/4. A wipe that restored an invented score would put the
          // app straight back into the state this whole pass exists to remove.
          sdi: 0,
          delta: 0,
          signals: 0,
          snoozes: 0,
          tonightReminderAt: null,
          ageNeedsConfirming: false,
          profileUpdatedAt: 0,
          recalibration: null,
          hasData: false,
          onboardingComplete: false,
          consent: false,
          aiMsgs: [],
          sheet: null,
          history: [],
        });
        get().go('AU1');
      },

      /**
       * Replaces local history with the merged union of this device and the account.
       *
       * Everything the screens read is derived from `checkIns` and `sleepLogs`, so a restore that
       * only set those two would leave the header showing whatever score this device last computed
       * — a new phone would greet the user with a stale demo number over a restored history. The
       * headline figures are therefore re-derived here from the newest restored check-in, exactly
       * as `submitKss` derives them when a check-in is made.
       */
      applyRestoredData: ({ checkIns, sleepLogs, baseline, faceBaseline, profile, alarms, maxSnoozes, consentLog, debtRecords, alarmEvents }) => {
        const latest = checkIns[checkIns.length - 1];
        const s = get();
        /**
         * The personal factors, restored rather than left at their defaults.
         *
         * A returning user used to land on Home with a year of check-ins and a debt model running on
         * a 30-year-old's sleep target, no stress flag and a sleep window nothing had set — the
         * history looked restored and the scoring was a stranger's. Each field is applied only when
         * the account actually has one, so an older account or a local-only merge changes nothing.
         *
         * `hasData` guards the whole of it: this device's own answers win. A restore is not allowed
         * to overwrite what somebody has already told this phone.
         */
        /**
         * A phone with answers of its own keeps them — unless the account was written later.
         *
         * `hasData` alone was the right rule for one device: a restore must not overwrite what
         * somebody has told this phone. With two, it silently became the wrong one, because the
         * account's row may hold a change made this morning on the other handset and this device
         * would refuse it forever. `profileUpdatedAt` settles it the same way the records are
         * settled: whoever wrote last is holding the answers the user most recently gave.
         */
        const restoredAge = profile ? ageFromBand(profile.ageBand) : null;
        const remoteStamp = profile?.updatedAt ?? 0;
        // `hasData` used to stand in for "this device has answers of its own", which it only
        // approximates: it means a check-in or a night exists, not that anybody answered anything.
        // The stamp says it directly — zero is a device that has never had a factor changed.
        const profileWins = Boolean(profile) && (s.profileUpdatedAt === 0 || remoteStamp > s.profileUpdatedAt);
        const fromProfile = profile && profileWins
          ? {
              profileUpdatedAt: remoteStamp,
              ...(restoredAge != null ? { age: restoredAge, ageNeedsConfirming: true } : null),
              ...(profile.gender ? { gender: profile.gender } : null),
              ...(profile.medication ? { medication: profile.medication } : null),
              ...(profile.highStress != null ? { highStress: profile.highStress } : null),
              ...(profile.bedMin != null ? { bedMin: profile.bedMin } : null),
              ...(profile.wakeMin != null ? { wakeMin: profile.wakeMin } : null),
              ...(profile.idealWake != null ? { idealWake: profile.idealWake } : null),
              ...(profile.onboardingComplete ? { onboardingComplete: true } : null),
            }
          : null;

        /**
         * The alarms, as `mergeAlarms` settled them.
         *
         * The decision is no longer taken here. It used to be a choice between two whole lists —
         * the account's, but only onto a phone that had none of its own — which meant the alarms
         * the two sides *share* were never reconciled at all, and a phone in a drawer kept 7:00
         * over the 6:30 someone had set that morning. The merge now settles them one at a time by
         * version, with deletions from either side taking precedence, and this applies the result.
         */
        // The local tombstones again, belt and braces. `mergeAlarms` has already applied both sides'
        // deletions; this only matters for a caller that hands alarms in directly.
        const settledAlarms = alarms
          ? alarms.filter((a) => !s.deletedAlarmIds.includes(a.id) && !(a.remoteId && s.deletedAlarmRowIds.includes(a.remoteId)))
          : null;
        /**
         * Only when something actually changed.
         *
         * The alarm scheduler re-arms whenever the array identity changes, so writing an equal list
         * back on every sync would cancel and re-schedule every alarm at each launch — including,
         * once, one the user was asleep on a snooze from.
         */
        const fromAlarms =
          settledAlarms && JSON.stringify(settledAlarms) !== JSON.stringify(s.alarms) ? { alarms: settledAlarms } : null;

        /**
         * The snooze allowance, which is stored per account and was uploaded but never read back.
         * A phone restored from an account that allows one snooze would quietly allow three.
         * Applied under the same `hasData` rule as the rest of the profile.
         */
        const fromAlarmSettings =
          maxSnoozes != null && !s.hasData ? { maxSnoozes: Math.max(1, Math.min(6, maxSnoozes)) } : null;

        /**
         * The consent trail is append-only, so a restore adds to it rather than replacing it: the
         * merge has already unioned both sides by content. Restoring it is what lets an export on a
         * new phone answer "when did I agree to this", which is most of what an export is for.
         */
        const fromConsent = consentLog && consentLog.length ? { consentLog } : null;

        /**
         * The nightly debt snapshots and the firing history, both already unioned by the merge.
         *
         * The snapshots are the ones that matter: each was taken with the model as it stood on the
         * night it covers, so a restore that dropped them and let the app recompute would rewrite
         * the user's past to agree with today. They also both appear in the export, which on a new
         * phone previously produced two empty sections.
         */
        const fromDebt = debtRecords && debtRecords.length ? { debtRecords } : null;
        const fromEvents = alarmEvents && alarmEvents.length ? { alarmEvents } : null;

        set({
          ...fromProfile,
          ...fromAlarms,
          ...fromAlarmSettings,
          ...fromConsent,
          ...fromDebt,
          ...fromEvents,
          checkIns,
          sleepLogs,
          baselineProfile: baseline,
          // `baseline` (the mean RT the PVT scores against) has to follow the profile, or restored
          // check-ins would be scored against this device's calibration instead of the account's.
          ...(baseline ? { baseline: baseline.pvtMeanRt } : null),
          ...(latest ? { sdi: latest.sdi, delta: deltaAgainstWeek(latest.sdi, checkIns.slice(0, -1)) } : null),
          hasData: checkIns.length > 0 || sleepLogs.length > 0,
          // Without this a restored phone would have to see the face three more times before the
          // scan could score anything, despite the account already knowing that face.
          ...(faceBaseline ? { faceBaseline } : null),
        });
      },

      toggleConsent: () =>
        set((s) => {
          const next = !s.consent;
          return { consent: next, consentLog: appendConsent(s.consentLog, 'consent', next) };
        }),
      /** Append-only audit trail. Compliance asks when consent was given, not what it is now. */
      logConsent: (type, granted) => set((s) => ({ consentLog: appendConsent(s.consentLog, type, granted) })),
      consentContinue: () => {
        if (get().consent) get().go('A3');
      },
      setPerm: (k) => {
        haptics.select();
        set((s) => ({ perms: { ...s.perms, [k]: (s.perms[k] === 'granted' ? 'denied' : 'granted') as PermState } }));
      },
      setPermValue: (k, v) => set((s) => ({ perms: { ...s.perms, [k]: v } })),

      /**
       * Every write to a personal factor stamps `profileUpdatedAt`.
       *
       * The account holds one profile row shared by every device, and the push overwrote it
       * unconditionally — so a phone that had been in a drawer for a month replaced the sleep window
       * and stress flag someone had corrected that morning on the phone they actually use. There is
       * no per-field history to merge, so the honest tie-break is which device wrote last, and that
       * needs recording at the moment of the write rather than inferred later.
       */
      // Clamped rather than trusted: the slider enforces the floor, but a restored profile from
      // an older build could carry an age below it.
      setAge: (n) =>
        set({ age: Math.max(MIN_AGE, Math.min(120, Math.round(n))), ageNeedsConfirming: false, profileUpdatedAt: Date.now() }),
      setGender: (g) => {
        haptics.select();
        set({ gender: g, profileUpdatedAt: Date.now() });
      },
      setMedication: (m) => {
        haptics.select();
        set({ medication: m, profileUpdatedAt: Date.now() });
      },
      toggleHighStress: () => {
        haptics.select();
        set((s) => ({ highStress: !s.highStress, profileUpdatedAt: Date.now() }));
      },
      setBedMin: (n) => set({ bedMin: mod1440(n), profileUpdatedAt: Date.now() }),
      setWakeMin: (n) => set({ wakeMin: mod1440(n), profileUpdatedAt: Date.now() }),
      setIdealWake: (n) => set({ idealWake: mod1440(n), profileUpdatedAt: Date.now() }),
      bumpBed: (dir, step = 15) => {
        haptics.tick();
        set((s) => ({ bedMin: mod1440(s.bedMin + dir * step), profileUpdatedAt: Date.now() }));
      },
      bumpWake: (dir, step = 15) => {
        haptics.tick();
        set((s) => ({ wakeMin: mod1440(s.wakeMin + dir * step), profileUpdatedAt: Date.now() }));
      },
      bumpIdeal: (dir, step = 15) => {
        haptics.tick();
        set((s) => ({ idealWake: mod1440(s.idealWake + dir * step), profileUpdatedAt: Date.now() }));
      },

      // ---- PVT ----
      startPvt: (total, next) => {
        clearTimers();
        set({ screen: 'PVT', pvtTrial: 0, pvtTimes: [], pvtLive: false, pvtFalse: false, lastMs: null, pvtTotal: total, pvtNext: next, pvtFalseStartCount: 0 });
        scheduleStim(get, set);
      },
      pvtTap: () => {
        const s = get();
        if (s.pvtFalse) return;
        if (!s.pvtLive) {
          if (pvtTimer) clearTimeout(pvtTimer);
          haptics.warn(); // tapped before the stimulus — the app should say so through the case
          set({ pvtFalse: true, pvtFalseStartCount: s.pvtFalseStartCount + 1 });
          pvtTimer = setTimeout(() => {
            set({ pvtFalse: false });
            scheduleStim(get, set);
          }, 900);
          return;
        }
        // The one moment this app actually measures. A firm knock confirms the tap registered
        // without the user having to look away from the stimulus.
        haptics.stimulus();
        recordTrial(get, set, Math.round(performance.now() - stimAt));
      },
      abortTest: () => {
        /**
         * Backing out of the tap test abandons a recalibration with it.
         *
         * Nothing has been committed at this point — the reaction-time baseline is written only when
         * the run completes, and the facial one only when a replacement scan succeeds — so clearing
         * the flag is the whole of the cleanup. Leaving it set would be worse than pointless: the
         * next ordinary face scan, days later, would see it and reset the calibration.
         *
         * A recalibration is cancelled back to Settings, which is where it started.
         */
        const s = get();
        const wasRecalibrating = s.recalibration != null;
        // A re-run started from the results screen goes back to the results screen. Dropping the
        // user at Home instead lost the check-in they were in the middle of correcting.
        const wasRerun = s.pvtNext === 'C5' || s.scanNext === 'C5';
        set({ recalibration: null });
        get().go(wasRecalibrating ? 'F6' : wasRerun ? 'C5' : s.hasData ? 'B' : 'A5');
      },

      // ---- Face scan ----
      startScan: (next) => {
        clearTimers();
        faceScanWork = null;
        // A new scan invalidates any older one still in flight.
        scanGeneration += 1;
        set({ screen: 'SCAN', scanPct: 0, scanDone: false, scanFailure: null, lowLight: next === 'G3', scanNext: next });
        // Paced to the capture, not to a number that looked right: FACE_SCAN_MS is how long the
        // camera will be sampling, and the ring is the user's only indication of it.
        scanTimer = setInterval(() => {
          const p = get().scanPct + 1;
          if (p >= 100) {
            if (scanTimer) clearInterval(scanTimer);
            haptics.success();
            set({ scanPct: 100, scanDone: true });
            // The ring's pace and the camera's are independent, and the hand-off has to be the
            // slower of the two: leaving before the frames are measured would score the check-in
            // without the face, then apply it a beat later to the screen that follows. Capped, so
            // a camera that never returns costs a second and a half rather than the whole flow.
            handoffTimer = setTimeout(async () => {
              const work = faceScanWork;
              // The decode of the last frames outlives the ring by a moment; the cap is generous
              // enough to cover that and still bounded, so a camera that never returns costs a few
              // seconds rather than the whole flow.
              if (work) await Promise.race([work, new Promise((r) => setTimeout(r, 4000))]);
              /**
               * Only if the user is still here.
               *
               * `clearTimers` can cancel the timer but not a callback already running, and this one
               * spends up to four seconds inside an await. Backing out of the scan in that window
               * left the navigation to fire anyway, so somebody who pressed back was pulled onto the
               * results screen seconds later from wherever they had gone. Pressing "skip" instead
               * produced two hand-offs racing each other. The screen is the honest test of both:
               * nothing else moves off SCAN while a scan is running.
               */
              if (get().screen !== 'SCAN') return;
              afterScan(get, set);
            }, 900);
          } else {
            set({ scanPct: p });
          }
        }, FACE_SCAN_MS / 100);
      },
      /** The scan screen hands its capture-and-measure promise here so the hand-off can wait. */
      setFaceScanWork: (p) => {
        faceScanWork = p;
      },
      skipScan: () => {
        clearTimers();
        /**
         * Clearing the failure is what makes "Continue without it" continue.
         *
         * `afterScan` sends a failed scan to the error screen, and the error screen's own escape
         * hatch calls this — with the failure still set, so `afterScan` read it and sent the user
         * straight back to the screen they were trying to leave. "Continue without it" was a button
         * that redrew its own screen, on the one screen whose entire purpose is to offer a way out
         * of a scan that will not work.
         *
         * Skipping *is* the resolution of the failure, so it goes with it.
         */
        set({ signals: 3, scanFailure: null });
        afterScan(get, set);
      },
      toggleLowLight: () => set((s) => ({ lowLight: !s.lowLight })),
      retryScan: () => get().startScan((get().scanNext as ScreenId) || 'C4'),
      /**
       * A scan's result, and the only place the facial baseline grows.
       *
       * Order matters: the scan was already scored against the baseline as it stood, and only then
       * does it join it. Folding a measurement into the average it is being compared against would
       * drag every score toward zero and make an unusual night look ordinary.
       *
       * A provisional score counts as three signals, not four — there is a face measurement, but
       * nothing yet to compare it to, so it must not be presented as a fourth input to the score.
       */
      setScanFailure: (f) => set({ scanFailure: f }),

      currentScanGeneration: () => scanGeneration,

      smartWakeActive: () => {
        const s = get();
        const id = liveAlarmId(s.alarmEvents);
        if (id < 0) return true;
        return s.alarms.find((a) => a.id === id)?.smart ?? true;
      },

      /**
       * Re-running one signal from the results screen.
       *
       * Each clears only its own signal and routes back to the results screen. Previously these were
       * bare `go('SCAN')` and `go('C4')` calls, which had three separate consequences: the scan
       * screen was entered without `startScan`, so the progress ring kept the previous scan's
       * completed state and `scanNext` still pointed wherever the *last* scan had been heading — so
       * re-running the face scan from the results dropped the user on the rating screen. Re-rating
       * appended a second check-in record rather than updating the one on screen. And each commit
       * refined the reaction-time baseline again from the same trials.
       */
      rerunFaceScan: () => {
        set({ lastFaceMetrics: null, scanFailure: null });
        get().startScan('C5' as ScreenId);
      },
      rerunPvt: () => {
        // The face metrics are deliberately kept: this re-runs one signal, not the check-in. The
        // `startPvt` below clears the tap-test state, and `finishPvt` recommits through `submitKss`
        // so the stored record and the score actually move.
        get().startPvt(DAILY_PVT_TRIALS, 'C5' as ScreenId);
      },
      editRating: () => {
        set({ kss: null });
        get().go('C4');
      },

      resetCheckInSignals: () => {
        // The in-flight capture too: a scan promise from an abandoned check-in would otherwise
        // resolve into the new one and set its metrics.
        faceScanWork = null;
        scanGeneration += 1;
        set({
          /**
           * A recalibration that never finished ends here.
           *
           * The flag is only cleared by finishing or cancelling on the recalibration's own screens,
           * and there are other ways off them — a tapped notification routes straight to a tab, and
           * an alarm firing takes over completely. A flag left set would sit there until the next
           * face scan, days later, and that scan would reset the facial baseline it was supposed to
           * be scored against. Starting a check-in is unambiguous evidence the recalibration is over,
           * and every check-in entry point calls this.
           */
          recalibration: null,
          pvtTrial: 0,
          pvtTimes: [],
          pvtLive: false,
          pvtFalse: false,
          pvtFalseStartCount: 0,
          lastMs: null,
          lastFaceMetrics: null,
          scanPct: 0,
          scanDone: false,
          scanFailure: null,
          kss: null,
          signals: 0,
          // A fresh check-in is a new record. Editing one keeps its id; starting one drops it.
          activeCheckInId: null,
        });
      },

      startQuickRating: () => {
        get().resetCheckInSignals();
        get().go('C4');
      },

      recalibrateBaseline: () => {
        /**
         * Nothing is thrown away here.
         *
         * This used to open with `set({ faceBaseline: recalibrateFaceBaseline() })` — the old
         * calibration erased on the first tap, before a single replacement measurement existed. Back
         * out of the tap test, deny the camera, fail the scan in a dark room, or simply put the
         * phone down, and a perfectly good reference was gone for good, with every later scan then
         * compared against nothing. The one screen in the app whose purpose is "make my scores more
         * accurate" was the one that could silently make them worse.
         *
         * The replacement is staged instead: the reaction-time baseline is committed when the tap
         * test *completes* (an abort commits nothing), and the facial baseline is reset and rebuilt
         * in the same breath, at the moment a scan actually succeeds — see `setFaceMetrics`. Until
         * then the old one keeps working.
         */
        set({ recalibration: { faceBaseline: null, baseline: null, session: null, trials: 0 } });
        get().startPvt(BASELINE_PVT_TRIALS, 'A8' as ScreenId);
      },
      finishRecalibration: () => {
        /**
         * The commit, and the only one.
         *
         * Both halves are applied together here or neither is applied at all. Committing the
         * reaction-time baseline when the tap test finished — which is what used to happen — meant a
         * user who completed the taps and then backed out of the scan had already had their baseline
         * replaced, on a screen that had promised "nothing is replaced if you back out". Half a
         * recalibration is worse than none: the two references are supposed to describe the same
         * person on the same day.
         */
        const staged = get().recalibration;
        set({
          ...(staged?.baseline
            ? {
                baseline: staged.baseline.pvtMeanRt,
                baselineProfile: staged.baseline,
                baselineTrials: staged.trials,
                // The pool restarts from this session. Recalibration exists because something about
                // the person changed, so carrying the old sessions forward would average the two
                // people together and describe neither.
                pvtSessions: staged.session ? [staged.session] : [],
              }
            : null),
          ...(staged?.faceBaseline ? { faceBaseline: staged.faceBaseline } : null),
          recalibration: null,
        });
        // Back to the settings screen it started from, not onward into onboarding.
        get().go('F0');
      },
      setFaceMetrics: (m) =>
        set((s) => {
          /**
           * A recalibration replaces the facial baseline here, and only here.
           *
           * This is the first moment a valid replacement exists, so it is the first moment it is
           * safe to discard the old one — reset and fold this scan in, in a single update. A
           * recalibration that was abandoned, skipped or failed never reaches this line, and the
           * previous calibration survives untouched.
           */
          if (m && s.recalibration && !s.recalibration.faceBaseline) {
            return {
              lastFaceMetrics: m,
              // Measured, not applied. The live baseline keeps working until the user taps Done.
              recalibration: { ...s.recalibration, faceBaseline: updateFaceBaseline(recalibrateFaceBaseline(), m) },
            };
          }
          return {
            lastFaceMetrics: m,
            // `signals` used to be assigned here as a flat 4 or 3, which assumed the tap test, the
            // rating and the debt were all present. They are not: a Quick Rating has one signal and a
            // scan-only check-in has one or two. It is computed from what actually exists, in score().
            faceBaseline: m ? updateFaceBaseline(s.faceBaseline, m) : s.faceBaseline,
          };
        }),

      // ---- scoring ----
      avgMs: () => {
        const s = get();
        return s.pvtTimes.length ? Math.round(s.pvtTimes.reduce((a, b) => a + b, 0) / s.pvtTimes.length) : s.baseline + 26;
      },
      personalFactors: () => {
        const s = get();
        // This used to read `female: chrono === 'a'` — chronotype standing in for gender, which
        // meant an evening type got a woman's transition multipliers. Each factor now comes from
        // the thing it actually is.
        //
        // Circadian misalignment is derived rather than asked: the profile screen already asks
        // when you would wake if the schedule were yours, and an hour or more of daylight between
        // that and your alarm is precisely what the paper means by misalignment.
        const drift = Math.abs(chronotypeDriftMin(s.wakeMin, s.idealWake));
        return {
          ageOver60: s.age >= 60,
          female: s.gender === 'female',
          sedative: s.medication === 'sedative',
          antidepressant: s.medication === 'antidepressant',
          highStress: s.highStress,
          circadianMisaligned: drift >= MISALIGNED_MIN,
        };
      },
      /**
       * Hours since this person last woke.
       *
       * Taken from the night they logged when that night ended today, otherwise from the wake time
       * in their profile applied to today. Both are estimates, but a wrong-by-an-hour estimate of
       * time awake changes the model's expectation far less than ignoring the clock entirely does.
       */
      hoursAwakeNow: (at = Date.now()) => {
        const s = get();
        const now = new Date(at);
        const today = startOfLocalDay(now);
        const lastLog = latestLog(s.sleepLogs);
        const logDate = lastLog ? Date.parse(`${lastLog.date}T00:00:00`) : NaN;
        // A logged night is dated by the day it ended, so its wake time belongs to that date.
        const wokeAt =
          lastLog && Number.isFinite(logDate) && logDate >= addLocalDays(today, -1)
            ? logDate + lastLog.wakeMin * 60_000
            : today + s.wakeMin * 60_000;
        const hours = (at - wokeAt) / 3_600_000;
        // Before the usual wake time, the relevant night is the one before.
        return hours < 0 ? hours + 24 : hours;
      },

      score: () => {
        const s = get();
        const std = s.baselineProfile?.pvtStdRt ?? 40;
        const pvtMetrics = s.pvtTimes.length
          ? computePVTMetrics(s.pvtTimes, s.pvtFalseStartCount, s.baseline, std, s.baselineProfile?.pvtSpeed)
          : null;
        // The circadian correction: how much of any difference from baseline the time of day and
        // sleep inertia already explain. Applied only when the baseline recorded its own phase —
        // an unknown phase means no honest correction is possible, so none is made.
        const base = s.baselineProfile;
        const now = new Date();
        const adjustment =
          base?.capturedAtHour != null && base.capturedHoursAwake != null
            ? circadianAdjustment(
                { hoursAwake: get().hoursAwakeNow(), clockHour: now.getHours() + now.getMinutes() / 60 },
                { hoursAwake: base.capturedHoursAwake, clockHour: base.capturedAtHour },
                s.idealWake / 60
              )
            : 0;
        const zPvt = pvtMetrics ? -pvtMetrics.zScore - adjustment : null;
        // A provisional scan measured a face but has no baseline to compare it to, so it carries
        // no information about tonight; passing 0 would be asserting "exactly average", which is a
        // claim the scan did not make. Excluded, and fuseSDI reweights what remains.
        const face = s.lastFaceMetrics;
        // Gated on the scan itself, not on a counter that `setFaceMetrics` happened to have set.
        // The old `s.signals >= 4` test was circular — the same assignment that admitted the face
        // also decided the count — and it survived a check-in, so a stale 4 let a previous scan in.
        const zFace = face && !face.provisional ? face.zScore : null;
        const zKss = s.kss != null ? kssToZ(s.kss) : null;
        /**
         * The debt term, from the ledger the rest of the app uses.
         *
         * This read `debtToZ(Math.max(0, 8 - lastNightHours))`, with a default of seven hours when
         * nothing had been logged. Three things wrong with that, all of which reached the headline
         * score. It held everyone to a flat eight hours, so a sixteen-year-old who needs nine and a
         * seventy-year-old who needs seven and a half were scored against the same target as each
         * other. It used one night, which is a shortfall rather than a debt, so a week of six-hour
         * nights scored the same as one. And the seven-hour default meant a brand-new user with no
         * logged nights was assessed as owing an hour of sleep — a fabricated input to the one
         * number the app exists to produce.
         *
         * Null when there is no night to measure, so `fuseSDI` reweights the signals that exist
         * rather than being handed an invented one.
         */
        const zDebt = s.sleepLogs.length ? debtToZ(accumulatedDebt(s.sleepLogs, s.age).hours) : null;
        /**
         * How well each objective signal was actually measured this time.
         *
         * The two carry equal base weight, so this is what decides which of them leads a given
         * check-in — a nine-trial tap test against a five-trial one at the alarm, and a scan whose
         * frame rate supported the eyelid measures against one that fell back to still photometry.
         * Better than asserting a fixed ranking, because the ranking is now earned per check-in.
         */
        const precision = precisionOf({
          pvtTrials: s.pvtTimes.length || null,
          faceHasEyelidMeasures: face?.closureFraction != null,
        });
        const fused = fuseSDI({ zPvt, zFace, zKss, zDebt, precision });
        // Record what the score was actually built from, so the results screen and the stored
        // record describe this check-in rather than the last one. `confidenceFor` reads this count,
        // so fixing the count fixes the badge too — it was previously a flat 4 or 3 assigned by
        // setFaceMetrics, which asserted a tap test, a rating and a debt figure that a Quick Rating
        // does not have. Safe to set from here: score() is called only from the two commit actions,
        // never during render.
        set({ signals: fused.signalsUsed });
        return fused.sdi;
      },
      setKss: (n) => {
        haptics.select();
        set({ kss: n });
      },
      submitKss: () => {
        const s = get();
        const sdi = get().score();
        const std = s.baselineProfile?.pvtStdRt ?? 40;
        const pvtMetrics = s.pvtTimes.length ? computePVTMetrics(s.pvtTimes, s.pvtFalseStartCount, s.baseline, std) : null;
        // Re-read after score(), which is what computes the count. `s` was captured before it ran,
        // so reading s.signals here recorded the *previous* check-in's confidence on this one.
        const confidence = confidenceFor(get().signals, s.baselineProfile, s.checkIns.length);
        /**
         * The record being edited, if this is an edit.
         *
         * Read before the record is built, because an edit inherits three things from it that are
         * not properties of the edit: when the check-in happened, what triggered it, and its id.
         * Stamping `Date.now()` on an edit moved a 7am alarm check-in to whenever the user happened
         * to re-rate it, relabelled it "evening", and — because sync keys a check-in on its instant
         * — uploaded it as a *second*, separate morning rather than a correction of the first.
         */
        const editing = s.activeCheckInId ? s.checkIns.find((c) => c.id === s.activeCheckInId) : undefined;
        const at = editing?.timestamp ?? Date.now();

        const record: CheckInRecord = {
          id: editing?.id ?? `ci_${Date.now()}`,
          timestamp: at,
          // The version, as distinct from the instant. An edit keeps the instant — that is what
          // makes it a correction rather than a second check-in — so this is the only thing that
          // tells another device that what it holds is the older of the two.
          updatedAt: Date.now(),
          // The spec's trigger types are not decoration: a 7am check-in and a 10pm one are not
          // comparable, and the export and the drift insight both need to know which was which.
          triggerType: editing?.triggerType ?? (alarmCheckIn ? 'alarm' : triggerTypeFor(at)),
          pvt: pvtMetrics,
          face: s.lastFaceMetrics,
          kss: s.kss,
          sdi,
          confidence,
          // From get(), not the pre-score() closure. `s` was captured before score() computed the
          // count, so the record stored the previous check-in's number — and on the first check-in
          // after a reset, zero. Same defect as the confidence line above, one field along.
          signalsUsed: get().signals,
        };
        /**
         * Update the record already on screen when this is an edit, rather than appending a second.
         *
         * `activeCheckInId` is what tells "the user re-rated this check-in" apart from "the user
         * started another one". The two used to be indistinguishable and both appended, so
         * re-rating from the results screen turned one morning into two history entries and two
         * points on the trend.
         */
        const isEdit = Boolean(editing);

        set((st) => ({
          sdi,
          // Against the other check-ins, never against itself. On an edit `st.checkIns` still holds
          // the version being replaced, so the week the new score was compared to contained the old
          // score of the same check-in — the reading the user had just corrected, still voting on
          // how far from normal its own replacement looked. Everywhere else this figure is derived,
          // the record itself is excluded.
          delta: deltaAgainstWeek(sdi, isEdit ? st.checkIns.filter((c) => c.id !== record.id) : st.checkIns),
          checkIns: isEdit ? st.checkIns.map((c) => (c.id === record.id ? record : c)) : [...st.checkIns, record],
          activeCheckInId: record.id,
          hasData: true,
          // Only on the first commit. Re-rating does not re-measure the reaction time, so folding
          // the same trials in again would count one measurement twice — and the reaction-time
          // baseline is what every later check-in is scored against.
          ...(isEdit ? {} : refineBaseline(st, s.pvtTimes)),
        }));
        alarmCheckIn = false;
        get().go('C5');
      },

      // ---- alarm dial ----
      setAlarmMin: (n) => set({ alarmMin: mod1440(n) }),
      alarmEarlier: () => {
        haptics.tick();
        set((s) => ({ alarmMin: mod1440(s.alarmMin - 5) }));
      },
      alarmLater: () => {
        haptics.tick();
        set((s) => ({ alarmMin: mod1440(s.alarmMin + 5) }));
      },
      toggleDay: (i) => {
        haptics.select();
        set((s) => {
          const d = s.days.slice();
          d[i] = !d[i];
          return { days: d };
        });
      },
      toggleSmartWake: () => {
        haptics.select();
        set((s) => ({ smartWake: !s.smartWake }));
      },
      /**
       * The last step of onboarding: create the alarm, and go to the app.
       *
       * Both halves have been missing at different times, and each produced a report that read like
       * a different bug. First "Save alarm" created no alarm, so the time on the dial was thrown
       * away. Then, fixing that, the navigation at the end of this function was dropped — so the
       * button set two flags and left the user sitting on the last onboarding screen with nothing
       * happening. Force-quitting the app appeared to fix it, because rehydration reads
       * `onboardingComplete` and opens on Home. That is precisely the reported symptom: the app
       * stops at onboarding unless you reopen it.
       *
       * The navigation is last and unconditional. Whatever happens to the alarm, onboarding ends.
       */
      finishOnboarding: () => {
        set((s) => {
          const made = alarmFromOnboarding(
            s.alarms,
            { min: s.alarmMin, days: s.days, smart: s.smartWake, sound: s.alarmSound, label: s.alarmLabel },
            Date.now()
          );
          return {
            hasData: true,
            onboardingComplete: true,
            // Finishing onboarding is the profile's first write.
            profileUpdatedAt: Date.now(),
            alarms: made ? [...s.alarms, made] : s.alarms,
          };
        });
        get().go('B');
      },

      /**
       * The alarm has fired. Opens the interstitial and starts the event record that the whole
       * ring-to-dismissal sequence appends to.
       */
      /**
       * An alarm has started. Opens the interstitial and begins the event record that the whole
       * ring-to-dismissal sequence appends to.
       *
       * `alarmId` is passed when a real alarm fired and the native side told us which one; the
       * in-app preview leaves it out and the alarm is inferred from the dial, or recorded as -1.
       *
       * Resetting `snoozes` is the part that matters beyond bookkeeping. It is persisted, and a
       * real firing used to skip this function entirely — App.tsx simply navigated to G1 — so the
       * count carried over from whatever happened last time. Three snoozes on Monday and Tuesday's
       * alarm opened already at its cap, refusing to snooze at all and recording every outcome
       * against Monday's event.
       */
      beginAlarmSession: (alarmId?: number) => {
        // A wake check-in is a check-in: it must start from nothing, exactly like a daily one.
        get().resetCheckInSignals();
        const s = get();
        const resolvedId = alarmId ?? s.alarms.find((a) => a.min === s.alarmMin && a.on)?.id ?? -1;

        /**
         * Smart Wake off means a plain alarm, including a plain snooze.
         *
         * `snoozeLen` is persisted and is only recomputed by `computeAlarm`, which runs at the end
         * of a wake check-in. A non-smart alarm never reaches that, so without this line it would
         * inherit whatever length the last *smart* alarm's scan happened to choose — 11 minutes, or
         * 0, on an alarm whose whole point is that it does not adapt.
         */
        const smart = resolvedId < 0 ? true : s.alarms.find((a) => a.id === resolvedId)?.smart ?? true;
        const plainSnoozeLen = smart ? s.snoozeLen : FIXED_SNOOZE_MIN;

        /**
         * A snooze re-firing continues the session it belongs to; a new morning starts a new one.
         *
         * This always created a fresh event with `snoozeCount: 0` and reset `snoozes` to zero. So
         * every time a snooze rang, the cap started over — and since the app is usually killed or
         * backgrounded between the snooze being set and it going off, that was the normal path, not
         * an edge case. The hard maximum the UI promises ("that was your last snooze") could be
         * bypassed indefinitely by snoozing, letting it re-fire, and snoozing again.
         *
         * An open event — same alarm, never dismissed, and recent enough to be the same morning —
         * *is* this session. Continuing it keeps the count. The window matters: without it, an alarm
         * that was left ringing and abandoned yesterday would still be "open" tomorrow and would
         * silently start today at yesterday's count.
         */
        const SESSION_WINDOW_MS = 6 * 60 * 60 * 1000;
        const now = Date.now();
        const openIndex = s.alarmEvents.findIndex(
          (e) => e.alarmId === resolvedId && e.dismissedAt == null && now - e.firedAt < SESSION_WINDOW_MS
        );

        if (openIndex >= 0) {
          const continued = s.alarmEvents[openIndex];
          /**
           * The snooze that brought us here has been spent.
           *
           * This branch is reached in exactly one way: a snooze fired. Natively that firing
           * consumed the snooze — `AlarmReceiver` calls `rearmAfterFiring`, which clears the record
           * and arms the next recurrence — but `snoozeArmed` was left at `true` from when it was
           * set, so JS carried on believing a ring was still pending on an alarm that had already
           * rung. G1 then told the user "ringing again in 9 minutes" at the very moment it was
           * ringing for that reason, and `stopAlarm` issued a cancel-snooze against a pending
           * intent that now held tomorrow's occurrence.
           *
           * `snoozes` is deliberately *not* reset with it: the count is what the cap is measured
           * against and continuing it is the whole point of this branch.
           */
          set({ snoozes: continued.snoozeCount, snoozeArmed: false, alarmEvents: s.alarmEvents, snoozeLen: plainSnoozeLen });
        } else {
          const event: AlarmEventRecord = {
            id: `ae_${now}`,
            alarmId: resolvedId,
            firedAt: now,
            snoozeCount: 0,
            dismissedAt: null,
            dismissMethod: null,
            checkInId: null,
          };
          set({ snoozes: 0, snoozeArmed: false, alarmEvents: [...s.alarmEvents, event], snoozeLen: plainSnoozeLen });
        }
        get().go('G1');
      },
      startAlarmDemo: () => get().beginAlarmSession(),
      startAlarmPvt: () => {
        // Silence first: the tap test is a reaction-time measurement and the face scan needs a
        // still, quiet subject. Neither survives an alarm still going off.
        stopAlarmSound();
        // Marks the check-in that follows as alarm-triggered, which is a different kind of
        // measurement from one taken at a chosen moment in the day.
        alarmCheckIn = true;
        get().startPvt(ALARM_PVT_TRIALS, 'GSCAN');
      },
      /**
       * Scores the alarm check-in and decides how long a snooze should be.
       *
       * `scanOptimize` is now read here, which is the whole of what the setting means. Settings
       * offered "Check-in sets snooze length — your check-in score picks 0, 7 or 11 minutes for
       * you instead of a fixed snooze", with a working toggle that persisted and synced and that
       * nothing consulted: the adaptive length was applied either way, so turning it off changed
       * nothing at all.
       */
      computeAlarm: () => {
        const sdi = get().score();
        set((s) => ({
          sdi,
          delta: deltaAgainstWeek(sdi, s.checkIns),
          snoozeLen: snoozeLengthFor(sdi, s.scanOptimize, FIXED_SNOOZE_MIN, get().smartWakeActive()),
        }));
      },
      /**
       * Snooze: silence it now, and ring it again.
       *
       * The second half did not exist. `snooze` stopped the tone, incremented a counter and
       * navigated — nothing anywhere scheduled another firing, so "Snooze 7 minutes" ended the
       * alarm and the app went quiet for the rest of the morning. A user who trusts a snooze is
       * more exposed than one whose alarm never rang, because they have gone back to sleep on
       * purpose.
       *
       * A snooze of zero minutes is not a snooze; that is the "you're up" branch, and G3 offers it
       * as one. The floor here is a backstop for any path that reaches this with a computed 0.
       */
      snooze: () => {
        stopAlarmSound();
        haptics.press();
        const s = get();
        const minutes = Math.max(1, s.snoozeLen);
        const alarmId = liveAlarmId(s.alarmEvents);
        // -1 is the in-app preview, which has no armed alarm behind it to re-arm.
        // Folded for the bridge: the native module addresses alarms by a 32-bit request code, and
        // snoozing under an unfolded id would arm a PendingIntent nothing else can find.
        const armed = alarmId >= 0 ? snoozeNativeAlarm(nativeIdFor(s.alarms, alarmId), minutes) : false;
        set((st) => ({ snoozes: st.snoozes + 1, alarmEvents: bumpSnooze(st.alarmEvents), snoozeArmed: armed }));
        get().go('G1');
        /**
         * A snooze the device would not arm has to be said out loud, here.
         *
         * It used to be a line on the alarm screen, keyed off `snoozeArmed` being false — which
         * stopped working the moment that flag started being cleared correctly on a re-fire, since
         * "nothing is armed" then covers both "the arm failed" and the ordinary "the snooze already
         * rang". This is the only moment the two are distinguishable, so it is said now.
         *
         * After `go`, because navigating dismisses any open sheet. `alarmId < 0` is the in-app
         * preview, which has no alarm behind it to arm and nothing to warn about.
         */
        if (!armed && alarmId >= 0) {
          get().openSheet(
            'This snooze will not ring',
            'Somno could not schedule another alarm on this device, so nothing will wake you again. Check that alarms and notifications are allowed for Somno in system settings — and get up now rather than relying on this one.'
          );
        }
      },
      /**
       * Closes out the alarm.
       *
       * `method` records *how* it ended, which is the part worth keeping: an alarm the user
       * silenced by hand and one that stopped because the snooze cap ran out are the same screen
       * and very different outcomes.
       */
      stopAlarm: (method = 'manual_stop') => {
        // First line of the function on purpose. The spec's hardest safety rule is that stopping
        // the alarm always works, immediately, with nothing in front of it.
        stopAlarmSound();
        const s = get();
        /**
         * Stopping has to take the snooze down with it, and put tomorrow back.
         *
         * `snooze` re-arms the alarm's own pending intent, so an armed snooze has *replaced* the
         * next recurring occurrence. Stopping used to do neither thing: the snooze still fired
         * minutes later on an alarm the user had explicitly stopped, and tomorrow's alarm was gone
         * because the snooze had overwritten it. `cancelSnoozeAndRestore` cancels and re-arms from
         * the alarm's stored days and minute in one native call.
         *
         * Only when a snooze was actually armed, and only for the alarm that really fired — which
         * is now the id carried through from the intent rather than one guessed from the clock.
         */
        const alarmId = liveAlarmId(s.alarmEvents);
        const snoozeCleared = s.snoozeArmed && alarmId >= 0 ? cancelNativeSnooze(nativeIdFor(s.alarms, alarmId)) : true;
        set((st) => ({
          alarmEvents: closeAlarmEvent(st.alarmEvents, method),
          // Cleared only if it really was. A stale `true` would let the next alarm session believe
          // a snooze from this one is still pending.
          snoozeArmed: snoozeCleared ? false : st.snoozeArmed,
        }));
        get().go('B');
      },

      startDailyCheckin: () => {
        get().resetCheckInSignals();
        get().startPvt(DAILY_PVT_TRIALS, 'C3');
      },

      openLesson: (i) => {
        set({ lesson: i, aiMsgs: [], aiInput: '' });
        get().go('DD');
      },
      nextLesson: () => set((s) => ({ lesson: (s.lesson + 1) % 4, aiMsgs: [], aiInput: '' })),
      markTonightReminderSet: (at) => set({ tonightReminderAt: at }),
      tonightReminderPending: () => {
        const at = get().tonightReminderAt;
        return at != null && at > Date.now();
      },
      /**
       * Answers one of the lesson's prepared questions.
       *
       * Not a language model and never was: `aiReply` looks the question up in a fixed list. The
       * screen now only offers those questions, so what comes back is always the answer that was
       * written for what was asked.
       */
      askAi: (q) => {
        if (!q || !q.trim()) return;
        const lesson = get().lesson;
        set((s) => ({
          aiMsgs: [...s.aiMsgs, { r: 'u', t: q }, { r: 'a', t: aiReply(lesson, q) }],
          aiInput: '',
        }));
      },
      setAiInput: (v) => set({ aiInput: v }),

      setRange: (r) => set({ range: r }),
      setHover: (h) => set({ hover: h }),

      openAlarm: (id) => {
        const a = get().alarms.find((x) => x.id === id);
        if (!a) return;
        set({
          editId: id,
          alarmMin: a.min,
          days: a.days.slice(),
          smartWake: a.smart,
          alarmSound: a.sound || '',
          alarmLabel: a.label || '',
        });
        get().go('F4E');
      },
      newAlarm: () => {
        set({ editId: null, alarmMin: 420, days: [true, true, true, true, true, false, false], smartWake: true, alarmSound: '', alarmLabel: '' });
        get().go('F4E');
      },
      saveAlarm: () => {
        /**
         * An alarm with no days is not an alarm.
         *
         * `nextFireTimestamp` returns null for an empty day mask, and `planAlarms` skips anything
         * with no next occurrence — so an alarm saved with every day deselected went into the list
         * looking exactly like a working one, switched on, showing its time, and never rang. The
         * failure was invisible on the one screen where being wrong costs the user their morning.
         */
        if (!get().days.some(Boolean)) return false;

        set((s) => {
          /**
           * Saving stamps the version, on both routes.
           *
           * The account holds one row per alarm and every device writes it, so a change to the
           * time, the days, the tone or either switch has to be datable — otherwise the phone in a
           * drawer pushes 7:00 back over the 6:30 somebody set this morning, and the two versions
           * are indistinguishable to everything downstream.
           */
          const a: Omit<Alarm, 'id' | 'on'> = {
            min: s.alarmMin,
            days: s.days.slice(),
            smart: s.smartWake,
            sound: s.alarmSound,
            label: s.alarmLabel,
            updatedAt: Date.now(),
          };
          if (s.editId == null) {
            return { alarms: [...s.alarms, { ...a, id: Date.now(), on: true }] };
          }
          return { alarms: s.alarms.map((x) => (x.id === s.editId ? { ...x, ...a, on: true } : x)) };
        });
        get().go('F4');
        return true;
      },
      /**
       * Deletes the alarm being edited, and remembers that it was deleted.
       *
       * The tombstone is what makes the deletion survive: sync deletes the row it names and only
       * then forgets it, so a deletion made offline, or the moment before the app was killed, is
       * still carried out the next time the account is reachable. Without it a deletion was only
       * ever a gap in a list, and a gap cannot be told apart from a list that has not loaded yet.
       */
      deleteAlarm: () => {
        set((s) => {
          const id = s.editId;
          if (id == null) return { alarms: s.alarms };
          // A restored alarm is also named by the row it came from: hashing the local id reaches
          // only the rows this app wrote, and a row from before `local_id` existed is not one.
          const rowId = s.alarms.find((x) => x.id === id)?.remoteId;
          return {
            alarms: s.alarms.filter((x) => x.id !== id),
            deletedAlarmIds: s.deletedAlarmIds.includes(id) ? s.deletedAlarmIds : [...s.deletedAlarmIds, id],
            deletedAlarmRowIds:
              rowId && !s.deletedAlarmRowIds.includes(rowId) ? [...s.deletedAlarmRowIds, rowId] : s.deletedAlarmRowIds,
          };
        });
        get().go('F4');
      },
      /** Called by sync once the account has been told; nothing else clears a tombstone. */
      clearAlarmTombstones: (ids, rowIds) =>
        set((s) => ({
          deletedAlarmIds: s.deletedAlarmIds.filter((id) => !ids.includes(id)),
          deletedAlarmRowIds: s.deletedAlarmRowIds.filter((rid) => !rowIds.includes(rid)),
        })),
      // The switch is an edit like any other, and the one most likely to be flipped on the phone in
      // your hand and then undone by the one in a drawer.
      toggleAlarmOn: (id) =>
        set((s) => ({ alarms: s.alarms.map((x) => (x.id === id ? { ...x, on: !x.on, updatedAt: Date.now() } : x)) })),
      setAlarmSound: (v) => set({ alarmSound: v }),
      setAlarmLabel: (v) => set({ alarmLabel: v }),
      toggleVibrate: () =>
        set((s) => {
          const vibrate = !s.vibrate;
          setNativeVibrate(vibrate);
          return { vibrate };
        }),
      setMaxSnoozes: (n) => set({ maxSnoozes: Math.max(1, Math.min(6, n)) }),

      toggleScanOptimize: () => set((s) => ({ scanOptimize: !s.scanOptimize })),
      /** Records that the user has connected their calendar; permission itself lives in the OS. */
      toggleNoteMorning: () => set((s) => ({ noteM: !s.noteM })),
      toggleNoteWind: () => set((s) => ({ noteW: !s.noteW })),
      toggleNoteWeekly: () => set((s) => ({ noteK: !s.noteK })),
      toggleNoteRecal: () => set((s) => ({ noteR: !s.noteR })),
      setFaq: (i) => set((s) => ({ faq: s.faq === i ? -1 : i })),

      setLogBed: (n) => set({ logBed: mod1440(n) }),
      setLogWake: (n) => set({ logWake: mod1440(n) }),
      bumpLogBed: (dir, step) => {
        haptics.tick();
        set((s) => ({ logBed: mod1440(s.logBed + dir * step) }));
      },
      bumpLogWake: (dir, step) => {
        haptics.tick();
        set((s) => ({ logWake: mod1440(s.logWake + dir * step) }));
      },
      setLogQuality: (q) => set({ logQuality: q }),
      setLogRest: (n) => set({ logRest: n }),
      startSleepLog: () => {
        const s = get();
        // Their most recent night if there is one — people are consistent, and last night is the
        // best guess at tonight — otherwise the sleep window they set during onboarding.
        const last = s.sleepLogs[s.sleepLogs.length - 1];
        set({
          logBed: last ? last.bedMin : s.bedMin,
          logWake: last ? last.wakeMin : s.wakeMin,
        });
        get().go('CLOG');
      },
      saveLog: () => {
        haptics.success();
        const s = get();
        const durationMin = mod1440(s.logWake - s.logBed);
        const date = localDateKey();
        const record: SleepLogRecord = {
          // A night's identity is its date, and `sleepLogLocalId` is the one place that says so.
          // This used to be `sl_${Date.now()}`, which matched nothing: the merge keys on date, so a
          // night re-logged on this device produced a second row locally and only one of the two
          // survived a sync — arbitrarily, since neither record says when it was written.
          id: sleepLogLocalId(date),
          date,
          bedMin: s.logBed,
          wakeMin: s.logWake,
          durationMin,
          quality: s.logQuality,
          restPct: s.logRest,
          // Re-logging a night supersedes the earlier entry, and nothing else records which of two
          // versions of one date was written later.
          updatedAt: Date.now(),
          source: 'manual',
        };
        set((st) => {
          // Re-logging a night replaces it rather than adding a second one. Two rows for one date
          // double-counted that night in every average on the Trends screen while the merge kept
          // only one of them, so the phone and the account disagreed about the same week.
          const logs = [...st.sleepLogs.filter((l) => l.date !== record.date), record].sort((a, b) =>
            a.date.localeCompare(b.date)
          );
          // A debt snapshot per night, taken with the score that was current when the night was
          // logged. Recomputing the whole history from today's score would let one bad Tuesday
          // silently rewrite last month's chart.
          const factors = get().personalFactors();
          const nights = [...st.sleepLogs.filter((l) => l.date !== record.date), record];
          const nightLedger = accumulatedDebt(nights, st.age);
          const debt = stageSplitOf(nightLedger.hours, nightLedger.needHours, nights);
          const snapshot: DebtRecord = {
            date: record.date,
            wakeDebtHours: debt.wakeDebtHours,
            nremDebtHours: debt.nremDebtHours,
            remDebtHours: debt.remDebtHours,
            compositeDebtHours: debt.compositeDebtHours,
          };
          return {
            sleepLogs: logs,
            hasData: true,
            debtRecords: [...st.debtRecords.filter((d) => d.date !== record.date), snapshot],
          };
        });
        // Navigate first: `go` clears the sheet, so opening the confirmation before it would
        // dismiss the confirmation itself.
        get().go('B');
        get().openSheet(
          'Sleep logged',
          `${dur(s.logBed, s.logWake)} from ${fmt(s.logBed, get().is24h())} to ${fmt(s.logWake, get().is24h())}, rated ${s.logQuality.toLowerCase()}. Manual entries are weighted a little lower than sleep imported from your Health app.`
        );
      },

      openSheet: (title, body) => set({ sheet: { title, body } as SheetContent }),
      /** The same surface with a destructive button. Used where an action cannot be taken back. */
      openConfirm: (sheet) => {
        haptics.warn();
        set({ sheet });
      },
      closeSheet: () => set({ sheet: null }),

      // The device's own setting, not a guess. See src/utils/clock.ts for why this was the second
      // half of "the app's time doesn't sync with my device's actual time".
      is24h: () => deviceUses24HourClock(),
      fmtMin: (m) => fmt(m, get().is24h()),

      // ---- real-data selectors ----
      weeklyAverageSdi: () => weeklyAverageOf(get().checkIns),
      todayDebt: () => {
        const s = get();
        // No logged night means no measured debt — not a debt of zero, and certainly not an
        // invented 4.2 hours. The screens render the absence rather than a number.
        if (!s.sleepLogs.length) return { wakeDebtHours: 0, nremDebtHours: 0, remDebtHours: 0, compositeDebtHours: 0 };
        // The running ledger across every logged night, not last night's shortfall. See
        // engine/debt.ts for why the difference is the whole meaning of the word.
        const ledger = accumulatedDebt(s.sleepLogs, s.age);
        return stageSplitOf(ledger.hours, ledger.needHours, s.sleepLogs);
      },
      sdiHistory: (range) => {
        const s = get();
        const n = range === '7' ? 7 : range === '30' ? 30 : 90;
        const recent = s.checkIns.slice(-n);
        if (recent.length >= 3) {
          return recent.map((c, i) => ({ v: c.sdi, l: new Date(c.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }));
        }
        return [];
      },
      pvtHistory: () => {
        const s = get();
        const recent = s.checkIns.filter((c) => c.pvt).slice(-10);
        if (recent.length >= 3) {
          return recent.map((c, i) => ({ v: c.pvt!.meanRt, l: `Check-in ${i + 1}` }));
        }
        return [];
      },
      recoveryCurve: () => {
        // Empty when there is nothing to recover from. See `useRecoveryCurve` for why the `|| 3`
        // that used to be here was a fabricated deficit rather than a default.
        const debt = get().todayDebt();
        return debt.compositeDebtHours > 0 ? recoveryTrajectory(debt.compositeDebtHours, 10) : [];
      },
      tonightRecommendation: () => {
        const s = get();
        const debt = get().todayDebt();
        return {
          bedtimeMin: recommendedBedtimeMin(s.bedMin, debt.compositeDebtHours),
          nap: napWindow(debt.compositeDebtHours),
        };
      },
    }),
    {
      name: 'somno-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // v2 replaced the `meds` yes/no and the unused `chrono` field with a medication category, an
      // optional gender and a stress flag. Anyone already carrying v1 state keeps what it meant:
      // "I take something that affects my sleep" was applied as sedative maths, so that is what it
      // migrates to, and gender stays unspecified because v1 never actually asked.
      // v3 clears the stored face baseline. The face scan changed method underneath it: detection
      // moved to ML Kit, so the eye and cheek regions are anchored on real landmarks instead of a
      // skin blob, and eyelid closure became an absolute open-probability instead of a ratio
      // normalised against each scan's own maximum. Every channel in the baseline is therefore on a
      // different scale than the one it was accumulated on, and Welford never forgets — a stale
      // baseline would not drift back, it would keep scoring good scans as deviations forever.
      // Dropping it costs the three scans it takes to rebuild and is the only correct answer.
      version: 3,
      migrate: (persisted, version) => {
        let state = persisted as Record<string, unknown>;
        if (!state) return state;
        if (version < 2) {
          state = {
            ...state,
            gender: 'unspecified',
            medication: state.meds ? 'sedative' : 'none',
            highStress: false,
          };
        }
        if (version < 3) state = { ...state, faceBaseline: null };
        return state;
      },
      partialize: (state) => ({
        consent: state.consent,
        displayName: state.displayName,
        perms: state.perms,
        bedMin: state.bedMin,
        wakeMin: state.wakeMin,
        idealWake: state.idealWake,
        age: state.age,
        gender: state.gender,
        medication: state.medication,
        highStress: state.highStress,
        baseline: state.baseline,
        baselineTrials: state.baselineTrials,
        baselineProfile: state.baselineProfile,
        pvtSessions: state.pvtSessions,
        faceBaseline: state.faceBaseline,
        dataOwnerId: state.dataOwnerId,
        alarmEvents: state.alarmEvents,
        // The snooze count and whether one is armed. Not persisted before, so a process death
        // during a snooze — which is exactly when Android is most likely to reclaim the app —
        // reset the count to zero and handed the user an unlimited supply of snoozes past a cap
        // the UI still claimed to be enforcing.
        snoozes: state.snoozes,
        snoozeArmed: state.snoozeArmed,
        // And the length that snooze was armed for. The two above were persisted for exactly this
        // case and this was missed, so a process death during a snooze — the likeliest moment for
        // one, since the phone is idle — brought the app back saying "ringing again in 7 minutes"
        // of an alarm armed for eleven, and armed the next one for seven. `computeAlarm` is the
        // only thing that recomputes it, and it does not run again before the alarm re-fires.
        snoozeLen: state.snoozeLen,
        // Persisted so a restart does not offer to set a reminder that is already scheduled.
        tonightReminderAt: state.tonightReminderAt,
        // Persisted, or a restore-then-restart would quietly settle for the approximation.
        ageNeedsConfirming: state.ageNeedsConfirming,
        profileUpdatedAt: state.profileUpdatedAt,
        consentLog: state.consentLog,
        debtRecords: state.debtRecords,
        alarmMin: state.alarmMin,
        days: state.days,
        smartWake: state.smartWake,
        alarms: state.alarms,
        // Persisted, or a deletion made offline dies with the process and the alarm comes back.
        deletedAlarmIds: state.deletedAlarmIds,
        deletedAlarmRowIds: state.deletedAlarmRowIds,
        alarmSound: state.alarmSound,
        alarmLabel: state.alarmLabel,
        vibrate: state.vibrate,
        maxSnoozes: state.maxSnoozes,
        scanOptimize: state.scanOptimize,
        noteM: state.noteM,
        noteW: state.noteW,
        noteK: state.noteK,
        noteR: state.noteR,
        hasData: state.hasData,
        checkIns: state.checkIns,
        sleepLogs: state.sleepLogs,
        sdi: state.sdi,
        delta: state.delta,
        signals: state.signals,
        range: state.range,
        onboardingComplete: state.onboardingComplete,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.onboardingComplete) {
          state.screen = 'B';
        }
        state.hasHydrated = true;
      },
    }
  )
);


/**
 * How long a stimulus waits for a tap before the trial is scored without one.
 *
 * The test had no timeout at all: the stimulus stayed lit until it was tapped. A user pointed out
 * what that means at six in the morning — start the test, drift off, and the app sits there
 * forever, having measured nothing about the state it exists to measure. Three seconds is roughly
 * ten times a rested reaction and about three times a badly impaired one, so a trial that reaches
 * it is not a slow response, it is an absent one. Scoring it as a maximal lapse turns falling
 * asleep mid-test from a hang into the finding it obviously is.
 */
const TRIAL_TIMEOUT_MS = 3000;

/** One completed trial, whether it ended in a tap or in silence. */
function recordTrial(get: () => SomnoStore, set: (partial: Partial<SomnoState>) => void, ms: number) {
  const s = get();
  if (lapseTimer) {
    clearTimeout(lapseTimer);
    lapseTimer = null;
  }
  const times = [...s.pvtTimes, ms];
  const trial = s.pvtTrial + 1;
  set({ pvtTimes: times, pvtTrial: trial, pvtLive: false, lastMs: ms });
  if (trial >= s.pvtTotal) {
    haptics.success();
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    if (s.pvtNext === 'A8') {
      // The baseline records the phase it was taken at, not just the numbers. Every later
      // comparison needs to know what time of day, and how far into the waking day, this
      // person's "normal best" was measured — otherwise the body clock's swing gets
      // attributed to sleep loss.
      const now = new Date();
      // Robust, not the plain mean and standard deviation this used to take: one lapse in a
      // twelve-trial run moves a mean by 40ms, and moves a standard deviation — the divisor
      // of every later z-score — far more than that. See summarizeSession in engine/pvt.ts.
      const session = summarizeSession(times);
      const estimate = baselineFrom([session]);
      const baselineProfile: BaselineProfile = {
        pvtMeanRt: estimate?.meanRt ?? avg,
        pvtStdRt: estimate?.sdRt ?? 40,
        createdAt: Date.now(),
        pvtSpeed: estimate?.speed ?? Number(responseSpeedOf(times).toFixed(3)),
        pvtSessions: 1,
        capturedAtHour: now.getHours() + now.getMinutes() / 60,
        capturedHoursAwake: get().hoursAwakeNow(),
      };
      /**
       * Committed now during onboarding; staged during a recalibration.
       *
       * A recalibration has two steps and a screen that promises "nothing is replaced if you back
       * out". Writing the baseline here kept only half of that promise: finishing the taps and then
       * cancelling the scan had already replaced the reaction-time reference, silently, against
       * what the user had just been told. `finishRecalibration` applies both halves together.
       */
      const recalibrating = s.recalibration;
      if (recalibrating) {
        set({ recalibration: { ...recalibrating, baseline: baselineProfile, session, trials: times.length } });
      } else {
        // The pool starts again from this session. Recalibration exists because something about
        // the person has changed — a new job, a new baby, new medication — so carrying their
        // old sessions forward would average the two people together and describe neither.
        set({ baseline: baselineProfile.pvtMeanRt, baselineTrials: times.length, baselineProfile, pvtSessions: [session] });
      }
    }
    handoffTimer = setTimeout(() => finishPvt(get, set), 650);
  } else {
    pvtTimer = setTimeout(() => scheduleStim(get, set), 500);
  }
}

function scheduleStim(get: () => SomnoStore, set: (partial: Partial<SomnoState>) => void) {
  const delay = 1200 + Math.random() * 2800;
  pvtTimer = setTimeout(() => {
    stimAt = performance.now();
    set({ pvtLive: true });
    // A trial that is never answered still has to end. Without this the whole test waits on a user
    // who has fallen asleep, which is the one state the app most needs to be able to describe.
    lapseTimer = setTimeout(() => recordTrial(get, set, TRIAL_TIMEOUT_MS), TRIAL_TIMEOUT_MS);
  }, delay);
}

function finishPvt(get: () => SomnoStore, set: (partial: Partial<SomnoState>) => void) {
  const n = get().pvtNext;
  if (n === 'A8') get().startScan('A8' as ScreenId);
  else if (n === 'C3') get().startScan('C4' as ScreenId);
  else if (n === 'GSCAN') get().startScan('G3' as ScreenId);
  // A re-run from the results screen. `submitKss` is the only thing that turns signals into a
  // stored check-in, so going straight back to C5 — which is what this used to do — left the record
  // and the score exactly as they were and showed the user a screen that had not changed.
  else if (n === 'C5') get().submitKss();
  else get().go((n as ScreenId) || 'B');
}

function afterScan(get: () => SomnoStore, set: (partial: Partial<SomnoState>) => void) {
  /**
   * A scan that failed does not walk the user onward as though it had worked.
   *
   * The ring is a timer. It reaches 100% and the screen said "Got it — signals captured" whether or
   * not anything had been captured, then handed off to the next step. Somebody pointed a phone at
   * no face at all and was told the scan completed, which is exactly what that code does.
   *
   * `no-frames` is the one failure that does not come here: it means there is no camera or no
   * permission, and neither a retry nor a tip can change that, so sending the user to a screen
   * offering both would be a nag rather than help. The other three are all things the user can
   * actually fix — move into the light, hold still, put your face in the ring.
   */
  const failure = get().scanFailure;
  if (failure && failure !== 'no-frames') {
    get().go('SCANERR');
    return;
  }
  const n = get().scanNext;
  if (n === 'C4') get().go('C4');
  else if (n === 'G3') {
    get().computeAlarm();
    get().go('G3');
  } else if (n === 'A8') get().go('A8');
  // Same as the tap-test re-run above: the new scan has to be folded into the check-in it belongs
  // to. Without this the results screen redrew with the old face metrics and the old SDI, and the
  // stored record kept a reading the user had explicitly replaced.
  else if (n === 'C5') get().submitKss();
  else get().go((n as ScreenId) || 'B');
}

// ---- Memoized derived-data hooks ----
// IMPORTANT: the store's own `todayDebt()` / `sdiHistory()` / etc. methods (used above inside
// actions via `get()`) return a brand-new object/array on every call. That's fine for one-off
// reads inside an action, but calling them reactively as `useSomnoStore(s => s.todayDebt())`
// breaks React's useSyncExternalStore snapshot caching (new reference every render -> infinite
// re-render loop, seen as "Maximum update depth exceeded"). These hooks select only the raw
// primitive state the computation actually depends on and useMemo the derived result, so
// components get a stable reference across renders. Always use these (not the store methods
// directly) when you need derived data reactively inside a component.

export function useTodayDebt() {
  const sdi = useSomnoStore((s) => s.sdi);
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);
  const bedMin = useSomnoStore((s) => s.bedMin);
  const wakeMin = useSomnoStore((s) => s.wakeMin);
  const age = useSomnoStore((s) => s.age);
  const gender = useSomnoStore((s) => s.gender);
  const medication = useSomnoStore((s) => s.medication);
  const highStress = useSomnoStore((s) => s.highStress);
  const idealWake = useSomnoStore((s) => s.idealWake);
  // Delegate to the store selector rather than restating the computation: the two copies drifted
  // once already, and because components read the hook and tests read the selector, the app can
  // show one number while the store reports another.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => useSomnoStore.getState().todayDebt(), [sdi, sleepLogs, bedMin, wakeMin, age, gender, medication, highStress, idealWake]);
}

export function useTonightRecommendation() {
  const debt = useTodayDebt();
  const bedMin = useSomnoStore((s) => s.bedMin);
  return useMemo(
    () => ({ bedtimeMin: recommendedBedtimeMin(bedMin, debt.compositeDebtHours), nap: napWindow(debt.compositeDebtHours) }),
    [bedMin, debt.compositeDebtHours]
  );
}

/**
 * The projected recovery curve, or nothing when there is no debt to recover from.
 *
 * `debt.compositeDebtHours || 3` substituted three hours of sleep debt whenever the real figure was
 * zero — which is every user who has logged nothing yet, and every user who is actually caught up.
 * The screen then drew a ten-night recovery projection from a deficit that did not exist and
 * captioned it "Debt over the last 10 nights", so a well-rested person was shown a plausible chart
 * of their imaginary sleep debt receding.
 *
 * Returning an empty array makes the absence representable, and the screen says why it is empty.
 */
export function useRecoveryCurve(): number[] {
  const debt = useTodayDebt();
  return useMemo(
    () => (debt.compositeDebtHours > 0 ? recoveryTrajectory(debt.compositeDebtHours, 10) : []),
    [debt.compositeDebtHours]
  );
}

/**
 * Whether the charts are showing the illustrative series rather than the user's own history.
 *
 * The thresholds are the same ones the selectors below use, read from one place so the label can
 * never drift out of step with the data it is labelling. Presenting invented numbers as somebody's
 * own sleep record is the one thing this app must not do, so where they are unavoidable — a phone
 * on its first day has nothing to plot — they are marked.
 */
/**
 * The three Home tiles, from records rather than fixed numbers.
 *
 * Duration and quality come straight off the logged night. "Habits" is check-in consistency —
 * the share of the last seven days that carry one — which is the only habit this app can honestly
 * claim to observe. Each returns null when the record it needs does not exist, so the tile can
 * show a dash and a way to fix it instead of a confident number about nothing.
 */
export function useHomeStats(): {
  duration: { pct: number; trend: 'up' | 'down' | 'flat' } | null;
  quality: { pct: number; trend: 'up' | 'down' | 'flat' } | null;
  habits: { pct: number; trend: 'up' | 'down' | 'flat' };
} {
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);
  const checkIns = useSomnoStore((s) => s.checkIns);
  return useMemo(() => {
    const trendOf = (now: number, before: number | null): 'up' | 'down' | 'flat' =>
      before == null || Math.abs(now - before) < 2 ? 'flat' : now > before ? 'up' : 'down';

    // Sorted by date wherever logs are written, so the last two entries are the two most recent
    // nights — and `latestLog` pins the newer of them regardless.
    const byDate = [...sleepLogs].sort((a, b) => a.date.localeCompare(b.date));
    const last = byDate[byDate.length - 1] ?? null;
    const prev = byDate[byDate.length - 2] ?? null;
    // Against the 8h the recovery engine treats as a full night, capped so a 10-hour night reads
    // as 100 rather than as an implausible 125.
    const durationPct = (l: SleepLogRecord) => Math.max(0, Math.min(100, Math.round((l.durationMin / 480) * 100)));

    // Calendar day numbers — see localDayNumber. Counting days by dividing local midnights by
    // 86,400,000 merges the pair either side of a DST change, so the Habits tile lost a day.
    const today = localDayNumber();
    const daysWithCheckIn = (from: number, to: number) =>
      new Set(checkIns.map((c) => localDayNumber(c.timestamp)).filter((d) => d >= from && d <= to)).size;
    const thisWeek = Math.round((daysWithCheckIn(today - 6, today) / 7) * 100);
    const lastWeek = checkIns.length ? Math.round((daysWithCheckIn(today - 13, today - 7) / 7) * 100) : null;

    return {
      duration: last ? { pct: durationPct(last), trend: trendOf(durationPct(last), prev ? durationPct(prev) : null) } : null,
      quality: last ? { pct: Math.round(last.restPct), trend: trendOf(last.restPct, prev ? prev.restPct : null) } : null,
      habits: { pct: thisWeek, trend: trendOf(thisWeek, lastWeek) },
    };
  }, [sleepLogs, checkIns]);
}

/**
 * Composite sleep debt per logged night — the Trends tab's third series.
 *
 * Each night is scored with that day's own measured SDI where one exists, falling back to the
 * running weekly average rather than today's number: using today's score to compute a debt from
 * three weeks ago would draw a curve that silently rewrites its own history every check-in.
 */
export function useDebtHistory(range: '7' | '30' | '90'): { v: number; l: string; at: number }[] {
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);
  const checkIns = useSomnoStore((s) => s.checkIns);
  const age = useSomnoStore((s) => s.age);
  const gender = useSomnoStore((s) => s.gender);
  const medication = useSomnoStore((s) => s.medication);
  const highStress = useSomnoStore((s) => s.highStress);
  return useMemo(() => {
    const days = range === '7' ? 7 : range === '30' ? 30 : 90;
    const cutoff = Date.now() - days * 86_400_000;
    const factors = useSomnoStore.getState().personalFactors();
    const fallback = weeklyAverageOf(checkIns);
    // The debt *as it stood on each night*, from the running ledger. Recomputing each point from
    // that one night alone drew a chart of nightly shortfalls labelled "debt" — which is why a
    // week of six-hour nights used to plot flat instead of climbing.
    const wholeLedger = accumulatedDebt(sleepLogs, age);
    const ledgerByDate = new Map(wholeLedger.series.map((e) => [e.date, e.hours]));
    const ledgerNeed = wholeLedger.needHours;

    return sleepLogs
      .filter((l) => Date.parse(`${l.date}T00:00:00`) >= cutoff)
      .map((l) => {
        const dayStart = Date.parse(`${l.date}T00:00:00`);
        // The next local midnight, not "24 hours later" — on a DST day those differ by an hour,
        // which either drops an hour of check-ins from the night's mean or borrows one from the
        // day after.
        const dayEnd = addLocalDays(dayStart, 1);
        const sameDay = checkIns.filter((c) => c.timestamp >= dayStart && c.timestamp < dayEnd);
        const sdiThatDay = sameDay.length ? Math.round(sameDay.reduce((a, c) => a + c.sdi, 0) / sameDay.length) : fallback;
        const debt = stageSplitOf(ledgerByDate.get(l.date) ?? 0, ledgerNeed, sleepLogs);
        return {
          v: debt.compositeDebtHours,
          l: new Date(dayStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
          at: dayStart,
        };
      });
  }, [sleepLogs, checkIns, range, age, gender, medication, highStress]);
}

/**
 * Today's predicted alertness curve, and the windows worth knowing about.
 *
 * This is the first thing in the app that answers a question about the *future* rather than the
 * past, and it is answerable because the three-process model is a curve through the day rather
 * than a single number. The level it starts from is set by the night that was actually logged, so
 * a short night lowers the whole day rather than just the morning.
 *
 * Presented as timing advice, never as a claim about health.
 */
export function useDayAhead(): {
  curve: { min: number; level: number }[];
  best: ReturnType<typeof bestWindow>;
  worst: ReturnType<typeof worstWindow>;
  /** True when a logged night set the starting level; false when it fell back to a full night. */
  fromLoggedNight: boolean;
} {
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);
  const wakeMin = useSomnoStore((s) => s.wakeMin);
  const idealWake = useSomnoStore((s) => s.idealWake);
  return useMemo(() => {
    const last = latestLog(sleepLogs);
    const wakeHour = (last ? last.wakeMin : wakeMin) / 60;
    // A night's sleep dissipates pressure from wherever the previous day left it. Starting the
    // integration from a moderately depleted evening is the honest default for someone whose
    // history the app has not seen yet.
    const wakeLevel = last ? wakeLevelAfterSleep(last.durationMin / 60, 4.5) : undefined;
    const curve = dailyAlertnessCurve({ wakeHour, wakeLevel, naturalWakeHour: idealWake / 60 });
    return {
      curve,
      best: bestWindow(curve),
      worst: worstWindow(curve),
      fromLoggedNight: Boolean(last),
    };
  }, [sleepLogs, wakeMin, idealWake]);
}

/** The last seven days as actually measured. See src/engine/insights.ts. */
export function useWeeklyReview() {
  const checkIns = useSomnoStore((s) => s.checkIns);
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);
  return useMemo(() => weeklyReview(checkIns, sleepLogs), [checkIns, sleepLogs]);
}

/** Consecutive days with a check-in. See src/engine/insights.ts for why it tolerates today. */
export function useStreak(): number {
  const checkIns = useSomnoStore((s) => s.checkIns);
  return useMemo(() => computeStreak(checkIns), [checkIns]);
}

/** The Home insight card's content, earned from the user's own records where possible. */
export function useInsight() {
  const checkIns = useSomnoStore((s) => s.checkIns);
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);
  return useMemo(() => pickInsight(checkIns, sleepLogs), [checkIns, sleepLogs]);
}

/**
 * Last night's stage sequence, modelled from the night that was actually logged.
 *
 * Null when there is no logged night: an estimate needs a duration to estimate from, and drawing
 * a stock hypnogram for someone who has logged nothing would be the exact fabrication this app is
 * trying not to commit.
 */
export function useLastNightHypnogram(): { segments: HypnogramSegment[]; startMin: number; endMin: number } | null {
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);
  const sdi = useSomnoStore((s) => s.sdi);
  const age = useSomnoStore((s) => s.age);
  const gender = useSomnoStore((s) => s.gender);
  const medication = useSomnoStore((s) => s.medication);
  const highStress = useSomnoStore((s) => s.highStress);
  return useMemo(() => {
    const last = latestLog(sleepLogs);
    if (!last) return null;
    const factors = useSomnoStore.getState().personalFactors();
    return {
      segments: simulateHypnogram(sdi, last.durationMin, factors),
      startMin: last.bedMin,
      endMin: last.wakeMin,
    };
  }, [sleepLogs, sdi, age, gender, medication, highStress]);
}

/**
 * Which panels have nothing real to show yet.
 *
 * Was "is this sample data", back when the app filled thin history with invented series. It now
 * means what its callers actually need: whether to render a chart or an explanation of why there
 * is no chart.
 */
/**
 * Whether to render times on a 24-hour clock, from the device's own setting.
 *
 * A hook rather than a bare call so every screen reads the same answer through the same seam. Ten
 * screens used to pass the literal `false` to `fmt`, which is how a phone set to 24-hour time saw
 * the whole app writing times in a notation it does not use.
 */
/**
 * The sleep-debt ledger, with everything the Recovery screen needs to explain it.
 *
 * Exposed as a whole rather than as a bare number because the number on its own has been the
 * problem: "4.2 h" says nothing about what it was measured against, how it was built, or whether
 * it can be trusted. This carries the sleep need it used, whether that need was measured or taken
 * from an age band, how many nights are behind it, whether the shortfall is one bad night or a
 * standing pattern, and how long it would take to clear.
 */
export function useDebtLedger(): DebtLedger & { pattern: ReturnType<typeof debtPattern>; nightsToClear: number | null } {
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);
  const age = useSomnoStore((s) => s.age);
  return useMemo(() => {
    const ledger = accumulatedDebt(sleepLogs, age);
    return {
      ...ledger,
      pattern: debtPattern(sleepLogs, ledger.needHours),
      nightsToClear: nightsToClear(ledger.hours),
    };
  }, [sleepLogs, age]);
}

export function useIs24h(): boolean {
  return deviceUses24HourClock();
}

export function useIsSampleData(): { sdi: boolean; pvt: boolean; debt: boolean } {
  const checkIns = useSomnoStore((s) => s.checkIns);
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);
  return useMemo(
    () => ({
      sdi: checkIns.length < 3,
      pvt: checkIns.filter((c) => c.pvt).length < 3,
      debt: sleepLogs.length === 0,
    }),
    [checkIns, sleepLogs]
  );
}

/**
 * Every check-in there is, from the first one.
 *
 * These used to return an empty array below three records, and the screens drew an empty state
 * saying a chart would appear "once you have checked in three times". That is a defensible thing
 * to say about a *trend* and a terrible thing to do with somebody's data: a user who had just
 * finished a check-in opened Trends, found nothing, and reasonably concluded the app had not
 * stored it. It had. It was simply refusing to show it.
 *
 * Withholding a measurement is not caution, it is the appearance of data loss. What needs three
 * points is the *line between them*, and the screen now says that instead — it plots what exists
 * and labels how much that is.
 */
export function useSdiHistory(range: '7' | '30' | '90') {
  const checkIns = useSomnoStore((s) => s.checkIns);
  return useMemo(() => {
    const n = range === '7' ? 7 : range === '30' ? 30 : 90;
    return checkIns
      .slice(-n)
      .map((c) => ({ v: c.sdi, l: new Date(c.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }));
  }, [checkIns, range]);
}

export function usePvtHistory() {
  const checkIns = useSomnoStore((s) => s.checkIns);
  return useMemo(
    () => checkIns.filter((c) => c.pvt).slice(-10).map((c, i) => ({ v: c.pvt!.meanRt, l: `Check-in ${i + 1}` })),
    [checkIns]
  );
}

// Dev-only escape hatch so automated smoke tests can drive navigation/state directly instead of
// racing the randomized PVT stimulus timing. Never read in production code paths.
if (typeof __DEV__ !== 'undefined' && __DEV__ && typeof globalThis !== 'undefined') {
  (globalThis as any).__somnoStore = useSomnoStore;
}

/**
 * How regularly this person sleeps — the Sleep Regularity Index over their logged nights.
 *
 * Null until there are enough nights to compare, which is the honest state for most of the first
 * week and is rendered as the card simply not being there.
 */
export function useRegularity(): { sri: number; nights: number; word: string } | null {
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);
  return useMemo(() => {
    const r = sleepRegularityIndex(sleepLogs);
    return r ? { ...r, word: regularityWord(r.sri) } : null;
  }, [sleepLogs]);
}

/** Which property of this person's nights their own mornings actually track. Null when none does. */
export function useDriver(): Driver | null {
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);
  const checkIns = useSomnoStore((s) => s.checkIns);
  return useMemo(() => strongestDriver(sleepLogs, checkIns), [sleepLogs, checkIns]);
}
