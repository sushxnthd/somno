/**
 * Captures the raw screens the Play listing is built from.
 *
 * Play wants screenshots of the app as a user would actually see it, and this app is empty until
 * somebody has used it for a few weeks — a fresh install photographs as a set of empty states. So
 * the script seeds three weeks of plausible history first, then walks the screens.
 *
 * The data seeded here is invented, and deliberately unremarkable: a person who mostly sleeps
 * around seven hours, sleeps badly on two nights, and catches up at the weekend. Nothing in a store
 * screenshot should imply an outcome the app cannot produce.
 *
 *   npx expo start --web --port 8098
 *   node scripts/store-assets.cjs
 *
 * Writes 390x844 PNGs at 3x into listing/raw/. scripts/compose-store-assets.py turns them into the
 * 1080x1920 frames Play accepts.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../listing/raw');
const APP = 'http://localhost:8098/';

/** The screens that say what the app is, in the order the listing tells the story. */
const SHOTS = [
  ['B', 'home'],
  ['PVT', 'pvt'],
  ['C5', 'result'],
  ['D', 'recovery'],
  ['E', 'trends'],
  ['W1', 'week'],
  ['F4', 'alarms'],
  ['F7', 'how-it-works'],
];

const DAY = 86400000;

/** Three weeks of a fairly ordinary sleeper, ending yesterday. */
function seedData() {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const dateOf = (daysAgo) => new Date(midnight.getTime() - daysAgo * DAY).toISOString().slice(0, 10);

  const nights = [];
  const checkIns = [];
  // Fixed per-day figures rather than random ones, so re-running the capture produces the same
  // screenshots and a diff of the listing assets means something.
  // Index 0 is last night, and it is a decent one on purpose: the home dial shows the most recent
  // check-in, and a listing should open on the app working rather than on a bad Tuesday.
  const durations = [470, 455, 430, 390, 505, 520, 445, 410, 375, 460, 480, 515, 495, 440, 420, 385, 465, 475, 500, 450, 435];
  const qualities = ['Solid', 'Solid', 'Okay', 'Restless', 'Solid', 'Solid', 'Okay', 'Okay', 'Restless', 'Solid', 'Solid', 'Solid', 'Solid', 'Okay', 'Okay', 'Restless', 'Solid', 'Solid', 'Solid', 'Okay', 'Okay'];

  for (let i = 0; i < durations.length; i++) {
    const daysAgo = i + 1;
    const date = dateOf(daysAgo);
    // A near-constant bedtime with the night's length coming off the wake end. Letting bedtime
    // wander instead is what the app's own insight engine flags as the problem worth fixing, and a
    // listing screenshot should not lead with the user being told off.
    const bedMin = 1380 + ((i % 3) - 1) * 5;
    const durationMin = durations[i];
    const wakeMin = (bedMin + durationMin) % 1440;
    nights.push({
      id: `sl_${date}`,
      date,
      bedMin,
      wakeMin,
      durationMin,
      quality: qualities[i],
      restPct: Math.round(60 + (durationMin - 380) / 4),
      source: 'manual',
    });

    // One morning check-in a day, plus a midday one every third day.
    const base = midnight.getTime() - daysAgo * DAY;
    // SDI reads high-is-alert, so a longer night has to raise it. 8h lands near 80, a 6h night near
    // 50 — the same direction and rough spacing the engine produces from real PVT data.
    const sdiFor = (d) => Math.max(30, Math.min(88, Math.round(28 + (d - 360) / 2.6)));
    checkIns.push({
      id: `ci_${base + 8 * 3600000}`,
      timestamp: base + 8 * 3600000,
      triggerType: 'morning',
      kss: durationMin > 460 ? 3 : 5,
      sdi: sdiFor(durationMin),
      confidence: 'high',
      signalsUsed: 3,
      pvt: {
        trialCount: 12,
        meanRt: Math.round(300 + (500 - durationMin) / 2.2),
        medianRt: Math.round(292 + (500 - durationMin) / 2.4),
        lapses: durationMin < 400 ? 2 : 0,
        falseStarts: 0,
        rtCv: 0.18,
        timeOnTaskSlope: 1.4,
        zScore: Number(((durationMin - 450) / 90).toFixed(2)),
      },
      face: {
        brightness: 0.42,
        redness: 0.11,
        periorbital: 0.26,
        eyeContrast: 0.61,
        motion: 0.02,
        stillnessMs: 2400,
        zScore: Number(((durationMin - 450) / 120).toFixed(2)),
        provisional: false,
        photoUri: null,
      },
    });
    // Not on the most recent day: a midday check-in there would be the one the home dial shows, and
    // an afternoon dip is a poor summary of how somebody slept.
    if (i % 3 === 1) {
      checkIns.push({
        id: `ci_${base + 14 * 3600000}`,
        timestamp: base + 14 * 3600000,
        triggerType: 'midday',
        kss: 5,
        sdi: sdiFor(durationMin) - 8,
        confidence: 'medium',
        signalsUsed: 2,
        pvt: null,
        face: null,
      });
    }
  }

  return {
    checkIns: checkIns.sort((a, b) => a.timestamp - b.timestamp),
    sleepLogs: nights.sort((a, b) => a.date.localeCompare(b.date)),
    baseline: { pvtMeanRt: 302, pvtStdRt: 34, createdAt: midnight.getTime() - 22 * DAY, pvtSpeed: 3.31, capturedAtHour: 9, capturedHoursAwake: 2 },
    faceBaseline: null,
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  /*
   * The home dial is a live prediction from the three-process model, so the capture's wall clock is
   * part of the screenshot: run this at 2am and the app correctly reports that the user should be
   * asleep, which is honest and useless as a listing image.
   *
   * The fix is the page's timezone, not its clock. Freezing Date.now() also freezes the entrance
   * animations — every screen photographs mid-fade at opacity 0 — so instead the browser is placed
   * in whichever zone makes it 08:something right now. Time still moves; it is simply morning
   * there.
   */
  // Wrapped into [-12, +11] before naming a zone: `Etc/GMT-N` only exists up to 14, so the naive
  // "hours until 8am" is an invalid zone id for most of the afternoon — which is a script that
  // works in the morning and throws after lunch.
  const offset = (((8 - new Date().getUTCHours() + 12) % 24) + 24) % 24 - 12;
  const timezoneId = offset === 0 ? 'UTC' : offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, // so the composed frame is downscaled rather than blown up
    timezoneId,
  });
  await page.goto(APP, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  await page.evaluate((data) => {
    const s = window.__somnoStore.getState();
    s.applyRestoredData(data);
    // A listing screenshot should not show somebody's onboarding.
    window.__somnoStore.setState({ onboardingComplete: true, consent: true, displayName: 'Sam' });
  }, seedData());
  await page.waitForTimeout(1200);

  for (const [screen, name] of SHOTS) {
    await page.evaluate((s) => window.__somnoStore.getState().go(s), screen);
    await page.waitForTimeout(1400); // let the entrance animations and count-ups settle
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`  ${screen.padEnd(5)} -> ${path.relative(process.cwd(), file)}`);
  }

  await browser.close();
})();
