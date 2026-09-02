import type { SleepLogRecord } from '../store/types';
import { dayNumberFromDateKey, localDayNumber } from '../utils/clock';

/**
 * Sleep debt as a ledger over many nights, rather than as one night's shortfall.
 *
 * What this replaces mattered. `computeDebt` took a single night's duration, subtracted it from a
 * flat eight hours, and added up to three more hours scaled from the current Sleep Deprivation Index. So:
 *
 *  - "Sleep debt" was last night's shortfall. Debt is by definition what has accumulated, and a
 *    week of six-hour nights showed the same figure as one six-hour night after six good ones.
 *  - Everyone needed exactly eight hours. A sixteen-year-old and a seventy-year-old were held to
 *    the same target, when the published recommendations differ by an hour and a half.
 *  - The SDI term made it circular. The index is fused partly *from* debt (`debtToZ` in sdi.ts),
 *    so debt raised the index's impairment term, which raised debt. Nothing in the literature
 *    supports converting an alertness score back into hours of sleep owed, and a loop that feeds
 *    its own output back in is not a measurement.
 *  - Nothing bounded it. Thirty nights at five hours produced ninety hours of debt, a number with
 *    no physiological meaning: the behavioural cost of chronic restriction saturates.
 *
 * The model here is a leaky accumulator, which is the standard shape for this and the one that
 * produces saturation without an arbitrary clamp.
 *
 * References
 *  - Hirshkowitz M, et al. (2015). National Sleep Foundation's sleep time duration recommendations.
 *    *Sleep Health* 1(1):40–43. — the age bands used for individual need.
 *  - Van Dongen HPA, Maislin G, Mullington JM, Dinges DF (2003). The cumulative cost of additional
 *    wakefulness. *Sleep* 26(2):117–126. — deficits from chronic restriction accumulate in a
 *    near-linear, dose-dependent way, and subjective sleepiness does not track them; after two
 *    weeks at four hours a night, lapses were comparable to two nights of total deprivation. This
 *    is the source of both the accumulation and the ceiling.
 *  - Belenky G, et al. (2003). Patterns of performance degradation and restoration during sleep
 *    restriction and subsequent recovery. *J Sleep Res* 12(1):1–12. — performance after restriction
 *    recovers only partially over three recovery nights, which is why repayment here is fractional
 *    rather than hour-for-hour.
 *  - Carskadon MA, Dement WC. Recovery sleep is denser rather than longer — the same reason.
 */

/**
 * Recommended sleep for an adult of this age, in hours.
 *
 * The NSF consensus gives a range and a recommended band; the midpoint of the recommended band is
 * used. This is a population figure and the app says so wherever it shows one — it is a starting
 * estimate for someone with no history, not a claim about this person.
 */
export function recommendedSleepHours(age: number): number {
  return sleepNeedBand(age).mid;
}

/**
 * The youngest age Somno accepts, and the one number every statement about age has to agree with.
 *
 * It did not used to be one number. Onboarding said "for ages 12 and up" over a slider whose floor
 * was 12; the privacy policy and terms both said 16; and the Play listing declared a target audience
 * of adults, 18 and over. Four positions, and the gap matters beyond tidiness — Play's target
 * audience declaration decides whether the Families policy applies, and an app that admits
 * thirteen-year-olds while declaring 18+ is making a false declaration.
 *
 * Sixteen is the resolution because it is the strictest common floor: it is the GDPR's default
 * digital-consent age (Article 8), it is what the two legal documents already promised, and it keeps
 * the 16-17 adolescent sleep-need band below meaningful rather than dead.
 */
export const MIN_AGE = 16;

/** The NSF band for an age: the recommended range, and its midpoint. */
export function sleepNeedBand(age: number): { mid: number; min: number; max: number } {
  // The two youngest bands are kept because this is a reference table and a partial one invites the
  // wrong answer if the floor ever moves. Below MIN_AGE they are unreachable through the app.
  if (age < 14) return { mid: 10, min: 9, max: 11 };
  if (age < 18) return { mid: 9, min: 8, max: 10 };
  if (age < 26) return { mid: 8, min: 7, max: 9 };
  if (age < 65) return { mid: 8, min: 7, max: 9 };
  return { mid: 7.5, min: 7, max: 8 };
}

/** Nights of history before the app will prefer a measured need over the population figure. */
export const MIN_NIGHTS_FOR_PERSONAL_NEED = 14;

/**
 * This person's own sleep need, in hours.
 *
 * Only ever revised **upward** from the age-band midpoint, and never past the top of the band.
 *
 * That asymmetry is the important part, and the first version of this function got it wrong. It
 * blended toward the upper quartile of logged nights in both directions, so somebody sleeping five
 * hours every night had their "need" revised down to seven — and their debt fell by a third at the
 * exact moment it should have been highest. Sleep need is not observable from restricted sleep.
 * Van Dongen's restricted groups adapted *subjectively* while their lapse rates went on climbing
 * for two weeks; a model that reads a habitually short sleeper as a naturally short sleeper
 * reproduces that illusion and hands it back as a reassuring number. Between the two possible
 * errors — telling a well-rested person they owe an hour, and telling a chronically restricted one
 * they owe nothing — only the second one matters, so the model is only allowed to make the first.
 *
 * Upward revision is on firmer ground: someone who takes nine hours whenever they can is showing
 * you an ad-libitum night, and the published range for their age already extends that far.
 *
 * The estimate moves a third of the way at a time, and only once there are two weeks of nights, so
 * a single long weekend cannot swing it.
 */
export function personalSleepNeedHours(age: number, logs: SleepLogRecord[]): { hours: number; personal: boolean } {
  const band = sleepNeedBand(age);
  if (logs.length < MIN_NIGHTS_FOR_PERSONAL_NEED) return { hours: band.mid, personal: false };

  const hours = logs.map((l) => l.durationMin / 60).sort((a, b) => a - b);
  const q3 = hours[Math.floor(hours.length * 0.75)];
  if (!Number.isFinite(q3) || q3 <= band.mid) return { hours: band.mid, personal: false };

  const blended = band.mid + (q3 - band.mid) / 3;
  return { hours: clamp(round1(blended), band.mid, band.max), personal: true };
}

/**
 * How much of a night's surplus repays debt.
 *
 * Not one for one. Belenky and Carskadon both find recovery is partial — an hour of extra sleep
 * after restriction buys back less than an hour of the deficit, because recovery sleep is denser
 * rather than simply longer, and because the tissue of the deficit is not purely time. Half is a
 * round number in the middle of what the recovery-night data supports, and it is the difference
 * between "one long weekend clears the week" (false, and the belief this app should not reinforce)
 * and "several ordinary nights do" (true).
 */
export const RECOVERY_EFFICIENCY = 0.5;

/**
 * Fraction of outstanding debt that fades per night regardless of what is slept.
 *
 * This is what makes the accumulator leaky, and it is what produces saturation rather than an
 * arbitrary clamp. Physiologically it stands for the partial adaptation seen under sustained
 * restriction: the cost keeps rising, but not without bound.
 *
 * The rate is calibrated against Van Dongen's protocol, which is the best-characterised point
 * available. Fourteen nights at four hours put the restricted group's lapse rate at roughly two
 * nights of total sleep deprivation — about sixteen hours. At this rate that history produces
 * 15.3 hours, which is as close as a one-parameter model gets to a real study.
 *
 * It also sets how long a debt takes to clear on ordinary nights, and the answer it gives is
 * deliberately unflattering: about a fortnight to clear six hours by sleeping to need. That is the
 * direction to err in. Belenky found three recovery nights left performance still short of
 * baseline, and the belief this app must not reinforce is that a long weekend settles the account.
 */
export const NIGHTLY_DECAY = 0.2;

/**
 * The most debt the model will carry.
 *
 * Not a physiological limit on harm — sleep loss goes on costing you past this point — but a limit
 * on what this number can honestly mean. Beyond roughly two nights' worth of missed sleep, the
 * behavioural deficit stops tracking the arithmetic, and printing "47.5 h" would imply a precision
 * the science does not have. The Recovery screen says as much when the ledger is at the ceiling.
 */
export const MAX_DEBT_HOURS = 24;

/** A gap longer than this and the ledger restarts: too much is unknown to carry a number across. */
export const MAX_GAP_NIGHTS = 21;

export interface DebtLedger {
  /** Standing debt in hours, after the most recent night. */
  hours: number;
  /** Nights that actually contributed — logged nights inside the window. */
  nights: number;
  /** The sleep need the ledger was computed against. */
  needHours: number;
  /** Whether that need was measured from this person or taken from their age band. */
  needIsPersonal: boolean;
  /** True when the ledger has reached the ceiling and the figure is a floor, not a total. */
  atCeiling: boolean;
  /** Nights since the most recent logged night. Debt decays across these but does not accrue. */
  nightsSinceLog: number;
  /** The running value after each logged night, oldest first — the Trends debt series. */
  series: { date: string; hours: number }[];
}

const round1 = (n: number) => Number(n.toFixed(1));
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Walks the logged nights in order and returns the standing debt.
 *
 * Unlogged nights neither accrue nor repay. That is the honest treatment: the app has no idea what
 * happened on a night nobody recorded, and assuming a shortfall would manufacture debt out of a
 * user forgetting to open the app — which is exactly the failure mode a wellness app must not have.
 * Decay still applies across them, so an abandoned ledger fades rather than freezing.
 */
export function accumulatedDebt(logs: SleepLogRecord[], age: number, now: number = Date.now()): DebtLedger {
  const { hours: needHours, personal } = personalSleepNeedHours(age, logs);
  const empty: DebtLedger = {
    hours: 0,
    nights: 0,
    needHours,
    needIsPersonal: personal,
    atCeiling: false,
    nightsSinceLog: 0,
    series: [],
  };
  if (!logs.length) return empty;

  const ordered = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const series: { date: string; hours: number }[] = [];
  let debt = 0;
  let previousDay: number | null = null;
  let nights = 0;
  // Whether the clamp was ever applied while walking the nights. That is what makes the final
  // figure a floor rather than a total, and it stays true even though the last few nights of decay
  // bring the reported number back under the ceiling.
  let hitCeiling = false;

  for (const log of ordered) {
    const day = dayNumberFromDateKey(log.date);
    if (!Number.isFinite(day)) continue;

    if (previousDay != null) {
      const gap = day - previousDay;
      if (gap <= 0) continue; // a duplicate date; the ledger counts each night once
      if (gap > MAX_GAP_NIGHTS) {
        // Three weeks unrecorded is longer than any deficit meaningfully survives, and carrying a
        // number across it would present a stale figure as a current one.
        debt = 0;
      } else {
        debt = decayFor(debt, gap - 1);
      }
    }

    debt = decayFor(debt, 1);
    const deficit = needHours - log.durationMin / 60;
    // A surplus repays at less than face value; a shortfall is added in full.
    debt += deficit >= 0 ? deficit : deficit * RECOVERY_EFFICIENCY;
    if (debt > MAX_DEBT_HOURS) hitCeiling = true;
    debt = clamp(debt, 0, MAX_DEBT_HOURS);

    nights += 1;
    previousDay = day;
    series.push({ date: log.date, hours: round1(debt) });
  }

  if (previousDay == null) return empty;

  // Nights between the last logged one and tonight: decay only.
  const nightsSinceLog = Math.max(0, localDayNumber(now) - previousDay);
  if (nightsSinceLog > MAX_GAP_NIGHTS) debt = 0;
  else debt = decayFor(debt, nightsSinceLog);

  return {
    hours: round1(clamp(debt, 0, MAX_DEBT_HOURS)),
    nights,
    needHours,
    needIsPersonal: personal,
    atCeiling: hitCeiling,
    nightsSinceLog,
    series,
  };
}

function decayFor(debt: number, nights: number): number {
  if (nights <= 0) return debt;
  return debt * Math.pow(1 - NIGHTLY_DECAY, nights);
}

/**
 * How this debt was built: one bad night, or a run of short ones.
 *
 * Worth separating because the advice differs and the literature is emphatic about it. An acute
 * loss recovers substantially in a night or two; chronic restriction does not, and the person
 * carrying it is usually the one least able to tell — Van Dongen's restricted groups rated their
 * sleepiness as near-stable while their lapse rates climbed for two weeks. A screen that tells
 * someone in the second case "you'll be fine after an early night" is wrong in the direction that
 * matters.
 */
export type DebtPattern = 'none' | 'acute' | 'chronic' | 'mixed';

/** Nights inside the recent window that must be short before a debt counts as chronic. */
export const CHRONIC_SHORT_NIGHTS = 4;
/** How short, in hours below need, a night has to be to count toward that. */
export const SHORT_NIGHT_MARGIN = 0.75;

export function debtPattern(logs: SleepLogRecord[], needHours: number, window = 7): DebtPattern {
  const recent = [...logs].sort((a, b) => a.date.localeCompare(b.date)).slice(-window);
  if (!recent.length) return 'none';
  const short = recent.filter((l) => needHours - l.durationMin / 60 >= SHORT_NIGHT_MARGIN);
  if (!short.length) return 'none';
  const chronic = short.length >= CHRONIC_SHORT_NIGHTS;
  // "Acute" means the shortfall sits in one or two nights, and the newest of them is recent.
  const acute = short.length <= 2;
  if (chronic) return short.length === recent.length ? 'chronic' : 'mixed';
  return acute ? 'acute' : 'mixed';
}

/**
 * How many ordinary nights at need it takes to clear this debt, or null if it is already clear.
 *
 * "Ordinary" is the point: this counts nights sleeping to need, not nights of catch-up sleep, so it
 * answers "how long until I am level if I simply stop losing sleep" — which is the question, and
 * which under fractional repayment plus decay is longer than the arithmetic suggests. Capped at
 * three weeks because beyond that the model is extrapolating rather than predicting.
 */
export function nightsToClear(debtHours: number, surplusPerNight = 0): number | null {
  if (debtHours < 0.5) return null;
  let debt = debtHours;
  for (let n = 1; n <= 21; n++) {
    debt = decayFor(debt, 1) - surplusPerNight * RECOVERY_EFFICIENCY;
    if (debt < 0.5) return n;
  }
  return null;
}
