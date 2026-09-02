import { splitAccumulatedDebt, stageLoss } from '../src/engine/stages.ts';
import {
  ALERT_MATRIX,
  DROWSY_MATRIX,
  HEALTHY_REFERENCE_PROPORTIONS,
  lowVigilanceMatrix,
  simulateNight,
  toEmbeddedChain,
} from '../src/engine/recovery.ts';
import { debtToZ, fuseSDI, MAX_ABS_Z, precisionOf } from '../src/engine/sdi.ts';
import { accumulatedDebt } from '../src/engine/debt.ts';

/**
 * Tests for what a short night costs, and for the chain that no longer decides it.
 *
 * The model these replace failed in a way no type check or unit test would have caught, because it
 * produced a number of the right shape every time. Measured across the SDI range it returned REM
 * shares of 0%, 17.9%, 9.7%, 38.9% and 0% — a seeded walk of a twenty-step chain, reported to one
 * decimal place as a finding about the user's sleep. Every check below is a property the old model
 * failed and the new one has to hold.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

const NEED = 8;

{
  console.log('a shortfall is accounted for exactly');
  for (const slept of [7.5, 7, 6, 5, 4, 2, 0]) {
    const l = stageLoss(NEED, slept);
    const total = l.nremHours + l.remHours;
    const shortfall = NEED - slept;
    // Allowing for the wake fraction the night is not asleep for, and one decimal of rounding.
    check(
      `${shortfall}h short accounts for ${shortfall}h of sleep`,
      Math.abs(total - Math.min(shortfall, NEED * 0.95)) < 0.15,
      `${total} vs ${shortfall}`
    );
  }
  check('sleeping to need costs nothing', stageLoss(NEED, NEED).nremHours + stageLoss(NEED, NEED).remHours === 0);
  check('sleeping past need costs nothing', stageLoss(NEED, 10).remHours === 0);
}

{
  console.log('and it is monotonic, which the simulation was not');
  const totals = [7.5, 7, 6, 5, 4, 2].map((h) => {
    const l = stageLoss(NEED, h);
    return l.nremHours + l.remHours;
  });
  check('a worse night never costs less', totals.every((v, i) => i === 0 || v >= totals[i - 1]), totals);

  const remShares = [7.5, 7, 6, 5, 4, 2].map((h) => {
    const l = stageLoss(NEED, h);
    return l.remHours / (l.nremHours + l.remHours);
  });
  check('every REM share is physiologically possible', remShares.every((r) => r > 0.15 && r < 0.5), remShares.map((r) => r.toFixed(2)));
  // The old model gave 0.00 and 0.39 for adjacent inputs.
  check('and no two adjacent nights differ by more than 10 points', remShares.every((r, i) => i === 0 || Math.abs(r - remShares[i - 1]) < 0.1), remShares.map((r) => r.toFixed(2)));
}

{
  console.log('a short night costs REM first, because the end of the night is REM-rich');
  // Carskadon & Dement: REM periods lengthen across the night, SWS is front-loaded. Curtailment
  // takes sleep off the end, so a small shortfall is REM-heavy and a large one regresses toward the
  // whole-night average.
  const small = stageLoss(NEED, 7.5);
  const large = stageLoss(NEED, 2);
  const smallShare = small.remHours / (small.nremHours + small.remHours);
  const largeShare = large.remHours / (large.nremHours + large.remHours);
  check('losing half an hour is mostly REM', smallShare > 0.35, smallShare.toFixed(2));
  check('losing six hours is mostly NREM by volume', largeShare < 0.32, largeShare.toFixed(2));
  check('and the share falls as the loss deepens', smallShare > largeShare, `${smallShare.toFixed(2)} -> ${largeShare.toFixed(2)}`);
}

{
  console.log('the night table agrees with the reference it is checked against');
  // The three thirds, averaged, have to reproduce a normal night's split — otherwise the table is
  // internally inconsistent and every derived figure inherits that.
  const whole = stageLoss(NEED, 0);
  const share = whole.remHours / (whole.nremHours + whole.remHours);
  check('a whole night is 20-25% REM', share >= 0.2 && share <= 0.25, share.toFixed(3));
  check('which is where the healthy reference puts it', Math.abs(share - HEALTHY_REFERENCE_PROPORTIONS.REM) < 0.05, HEALTHY_REFERENCE_PROPORTIONS.REM);
}

{
  console.log('fragmentation is separate from duration');
  const full = stageLoss(NEED, NEED, 0.3);
  check('a full night that felt unrestful still costs something', full.wakeHours > 0, full);
  check('but not in NREM or REM, which were not lost', full.nremHours === 0 && full.remHours === 0, full);
  const restful = stageLoss(NEED, NEED, 1);
  check('a full night that felt fine costs nothing at all', restful.wakeHours === 0, restful);
}

{
  console.log('the stage figures add up to the debt they came from');
  // The old split normalised a simulated shortfall against a reference, so the parts had no
  // arithmetic relationship to the total the rest of the app displayed.
  for (const debt of [0, 1, 4, 9, 24]) {
    const d = splitAccumulatedDebt(debt, NEED, 6);
    const sum = d.nremHours + d.remHours + d.wakeHours;
    check(`${debt}h of debt splits into ${debt}h of stages`, Math.abs(sum - debt) < 0.15, `${sum} vs ${debt}`);
  }
  check('nothing owed splits into nothing', splitAccumulatedDebt(0, NEED, 8).remHours === 0);
}

{
  console.log('the transition matrices are the same kind of object before they are mixed');
  // The bug: ALERT is an embedded jump chain (zero diagonal), DROWSY is a per-epoch chain
  // (diagonal 0.46/0.97/0.94). Convex-mixing them is not a model of anything.
  const stages = ['Wake', 'NREM', 'REM'] as const;
  for (const [name, M] of [['ALERT', toEmbeddedChain(ALERT_MATRIX)], ['DROWSY', toEmbeddedChain(DROWSY_MATRIX)]] as const) {
    check(`${name} has no self-transitions once embedded`, stages.every((s) => M[s][s] === 0), stages.map((s) => M[s][s]));
    check(`${name} rows still sum to one`, stages.every((s) => Math.abs(M[s].Wake + M[s].NREM + M[s].REM - 1) < 1e-6));
  }
  // The conversion has to preserve the relative jump probabilities of the source.
  const d = toEmbeddedChain(DROWSY_MATRIX);
  const sourceRatio = DROWSY_MATRIX.NREM.Wake / DROWSY_MATRIX.NREM.REM;
  const embeddedRatio = d.NREM.Wake / d.NREM.REM;
  check('and preserves how the source split its jumps', Math.abs(sourceRatio - embeddedRatio) < 1e-6, `${sourceRatio} vs ${embeddedRatio}`);

  const mixed = lowVigilanceMatrix(50);
  check('the mixture is an embedded chain too', stages.every((s) => mixed[s][s] === 0));
}

{
  console.log('the simulation is at least physiologically possible now');
  // It is still one realisation of a chain with unfitted sojourn parameters, which is why nothing
  // user-facing reads a number off it any more. But a hypnogram shape has to be plausible.
  const shares = [90, 70, 50, 30, 10].map((sdi) => {
    const s = simulateNight(sdi, 480);
    const t = s.Wake + s.NREM + s.REM;
    return { sdi, wake: s.Wake / t, nrem: s.NREM / t, rem: s.REM / t };
  });
  check('REM is never zero across a whole night', shares.every((s) => s.rem > 0.03), shares.map((s) => s.rem.toFixed(2)));
  check('and never more than a third of it', shares.every((s) => s.rem < 0.34), shares.map((s) => s.rem.toFixed(2)));
  check('NREM stays the majority of the night', shares.every((s) => s.nrem > 0.5), shares.map((s) => s.nrem.toFixed(2)));
}

{
  console.log('no single signal can run away with the score');
  // debtToZ was unbounded: the ledger reaches 24 hours, and -(24/2) is a z of -12 against other
  // signals living inside ±3. Debt could pin the score to zero on its own.
  check('a huge debt is clamped to the range the other signals share', debtToZ(24) === -MAX_ABS_Z, debtToZ(24));
  check('an ordinary debt is untouched', Math.abs(debtToZ(4) - -2) < 1e-9, debtToZ(4));
  check('no debt is no signal', debtToZ(0) === 0);

  // With debt pinned at its worst, a sharp reaction test and face scan must still move the result.
  const pinned = fuseSDI({ zDebt: debtToZ(24), zPvt: null, zFace: null, zKss: null }).sdi;
  const withGoodSignals = fuseSDI({ zDebt: debtToZ(24), zPvt: 2, zFace: 2, zKss: 1.5 }).sdi;
  check('the other three signals can still lift a maximally indebted score', withGoodSignals > pinned + 10, `${pinned} -> ${withGoodSignals}`);
}

{
  console.log('an unmeasured signal is left out rather than invented');
  const withoutDebt = fuseSDI({ zPvt: 0.5, zFace: 0.5, zKss: null, zDebt: null });
  check('two signals are reported as two', withoutDebt.signalsUsed === 2, withoutDebt);
  check('and the weights renormalise over them', withoutDebt.sdi === 55, withoutDebt.sdi);
  const nothing = fuseSDI({});
  check('no signals is not a confident 50', nothing.confidence === 'low' && nothing.signalsUsed === 0, nothing);
}


{
  console.log('the conclusion survives the parameters it was built with');
  /**
   * The honest question about this model: are the per-third proportions literature-backed, or a
   * heuristic with a citation attached? Answer: the *monotonicity* is published and the *specific
   * numbers* are interpolated to fit the published whole-night total. So the test that matters is
   * whether the claim the app actually makes depends on the interpolation.
   *
   * Re-deriving the split under every table the literature permits — REM in the first third
   * anywhere from 3% to 13%, in the last third anywhere from 30% to 50% — the ordering has to hold
   * in all of them. If it did not, the app would be showing an artefact of a number I chose.
   */
  const variants: [string, number, number, number][] = [
    ['as shipped', 0.08, 0.2, 0.4],
    ['flattest permitted', 0.13, 0.22, 0.3],
    ['steepest permitted', 0.03, 0.18, 0.5],
    ['low overall REM', 0.05, 0.15, 0.35],
    ['high overall REM', 0.12, 0.25, 0.45],
  ];

  // Re-implemented here rather than imported, so the property is checked against the *shape* of the
  // model rather than against one hard-coded table inside it.
  const splitUnder = (thirds: [number, number, number], need: number, slept: number) => {
    const sleepNeed = need * 0.95;
    let remaining = Math.min(Math.max(0, need - slept), sleepNeed);
    const per = sleepNeed / 3;
    let nrem = 0;
    let rem = 0;
    for (let i = 2; i >= 0 && remaining > 0; i--) {
      const taken = Math.min(remaining, per);
      rem += taken * thirds[i];
      nrem += taken * (1 - thirds[i]);
      remaining -= taken;
    }
    return rem / (nrem + rem);
  };

  const failures: string[] = [];
  for (const [name, t1, t2, t3] of variants) {
    const small = splitUnder([t1, t2, t3], 8, 7.5);
    const large = splitUnder([t1, t2, t3], 8, 2);
    // The claim: a small shortfall is proportionally more REM than a large one.
    if (!(small > large)) failures.push(`${name}: ${small.toFixed(3)} vs ${large.toFixed(3)}`);
    // And every variant still yields a physiologically possible whole-night share.
    const whole = splitUnder([t1, t2, t3], 8, 0);
    if (whole < 0.15 || whole > 0.3) failures.push(`${name}: whole-night REM ${whole.toFixed(3)}`);
  }
  check('a short night costs proportionally more REM under every permitted table', failures.length === 0, failures.join(' | '));

  // And the shipped table has to agree with the published whole-night aggregate, which is the one
  // number here that is quoted rather than chosen.
  const shipped = splitUnder([0.08, 0.2, 0.4], 8, 0);
  check('the shipped table reproduces the published 20-25% whole-night REM share', shipped >= 0.2 && shipped <= 0.25, shipped.toFixed(3));
}

{
  console.log('the debt model rests on one calibration point, and says so');
  /**
   * Same question for the ledger. NIGHTLY_DECAY is fitted to exactly one published observation —
   * Van Dongen's fourteen nights at four hours, whose lapse rate matched two nights of total
   * deprivation. Everything else is a judgement. So the properties worth pinning are the ones that
   * hold regardless of the constant's precise value.
   */
  const decayed = (rate: number, nights: number, deficit: number) => {
    let d = 0;
    for (let i = 0; i < nights; i++) d = d * (1 - rate) + deficit;
    return d;
  };
  const rates = [0.12, 0.16, 0.2, 0.25, 0.3];
  check(
    'debt saturates rather than growing without bound at every plausible rate',
    rates.every((r) => decayed(r, 60, 4) < decayed(r, 14, 4) * 1.6),
    rates.map((r) => `${r}: ${decayed(r, 14, 4).toFixed(1)} -> ${decayed(r, 60, 4).toFixed(1)}`).join(' | ')
  );
  check(
    'and a worse deficit always owes more, at every rate',
    rates.every((r) => decayed(r, 14, 4) > decayed(r, 14, 2)),
  );
  // The one quoted figure: two weeks at four hours should land near two nights of lost sleep.
  // Asserted against the shipped function rather than the recurrence above — the simplification
  // here omits the decay applied for the night since the last log, and a test that re-implements
  // the thing it is testing checks the re-implementation.
  const dayKey = (back: number) => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const fortnightAtFour = accumulatedDebt(
    Array.from({ length: 14 }, (_, i) => ({
      id: `sl_${dayKey(14 - i)}`,
      date: dayKey(14 - i),
      bedMin: 1380,
      wakeMin: 240,
      durationMin: 240,
      quality: 'Okay' as const,
      restPct: 60,
      source: 'manual' as const,
    })),
    30
  ).hours;
  check('the shipped rate reproduces the study it was fitted to', Math.abs(fortnightAtFour - 16) < 3, fortnightAtFour.toFixed(1));
}


{
  console.log('the fusion weights follow the architecture spec');
  // These are the spec's defaults (0.40 pvt / 0.25 face / 0.15 kss / 0.20 debt), and they are
  // defaults rather than findings: the PVT leads because it is the best-validated field measure of
  // sleep-loss impairment, not because anything here measured that. A previous revision equalised
  // pvt and face by appealing to Dawes (1979) on equal weighting — which applies when weights
  // *cannot* be estimated, not when a specification already supplies them.
  const pvtLed = fuseSDI({ zPvt: 1, zFace: 0, zKss: null, zDebt: null }).sdi;
  const faceLed = fuseSDI({ zPvt: 0, zFace: 1, zKss: null, zDebt: null }).sdi;
  check('the reaction test outweighs the face scan', pvtLed > faceLed, `${pvtLed} vs ${faceLed}`);
  // 0.40 vs 0.25 renormalised over the two present signals is 0.615 vs 0.385, so a unit z on the
  // PVT should move the score about 1.6x as far as the same z on the face scan.
  const ratio = (pvtLed - 50) / (faceLed - 50);
  check('by the ratio the spec sets', Math.abs(ratio - 0.4 / 0.25) < 0.15, ratio.toFixed(2));

  // Self-report is weighted below both, which Van Dongen supports directly.
  const objective = fuseSDI({ zPvt: 1, zKss: 0, zFace: null, zDebt: null }).sdi;
  check('and self-report below them', objective > 50, objective);

  // Precision decides which of the two leads on a given check-in.
  const full = precisionOf({ pvtTrials: 9, faceHasEyelidMeasures: true });
  check('a full tap test is at full precision', full.pvt === 1, full);
  check('and a scan with eyelid measures too', full.face === 1, full);

  const degraded = precisionOf({ pvtTrials: 5, faceHasEyelidMeasures: false });
  check('a five-trial alarm test counts for less', degraded.pvt < 1 && degraded.pvt >= 0.5, degraded.pvt);
  check('and a scan that fell back to stills counts for less', degraded.face < 1 && degraded.face >= 0.5, degraded.face);

  // The consequence that matters: the face leads when it measured eyelids, and does not when it
  // did not — rather than leading unconditionally because a constant said so.
  const eyelidScan = fuseSDI({ zPvt: -1, zFace: 1, precision: precisionOf({ pvtTrials: 9, faceHasEyelidMeasures: true }) }).sdi;
  const stillsOnly = fuseSDI({ zPvt: -1, zFace: 1, precision: precisionOf({ pvtTrials: 9, faceHasEyelidMeasures: false }) }).sdi;
  check('a scan that measured eyelids pulls the score further than one that did not', eyelidScan > stillsOnly, `${eyelidScan} vs ${stillsOnly}`);
  // With both signals present and opposed, the spec's ordering means the PVT wins rather than the
  // two cancelling — which is what an equal-weight model would have done.
  const opposed = fuseSDI({ zPvt: 1, zFace: -1, zKss: null, zDebt: null }).sdi;
  check('with both present and opposed, the reaction test decides', opposed > 50, opposed);
}

console.log(failures === 0 ? '\nAll stage-model checks passed.' : `\n${failures} stage-model check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
