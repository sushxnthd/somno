/**
 * End-to-end journeys: the app walked the way a person walks it.
 *
 * This exists because interactions.cjs could not have caught the bug that prompted it. That sweep
 * jumps between screens with `go()` and then exercises the controls it finds — which is a good test
 * of controls and no test at all of the *path* between them. So when the last step of onboarding
 * stopped navigating, 110 assertions passed while a new user sat on the final onboarding screen
 * tapping "Save alarm" and watching nothing happen. The app was unusable and the suite was green.
 *
 * The rules here are different, and deliberately strict:
 *
 *   1. Nothing is allowed to call `go()`. Every transition happens because a real element was
 *      clicked at its real coordinates.
 *   2. Every step asserts the screen actually changed. A tap that leaves you where you were is a
 *      dead end, and it is reported as one.
 *   3. The store is only read, never written.
 *
 * It starts from a genuinely empty install — storage cleared, page reloaded — because that is the
 * state every one of these bugs was found in and the one the sweep never sets up.
 *
 * Run against the web build:
 *   npx expo start --web --port 8098
 *   node e2e/journeys.cjs
 */
const { chromium } = require('playwright');

const results = [];
const ok = (name, pass, detail) => results.push({ name, pass, detail: detail == null ? '' : String(detail).slice(0, 300) });

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)));

  /**
   * Wait until the app is actually running, rather than for a number of seconds.
   *
   * A fixed delay is a guess about how long the bundle takes to evaluate and the store takes to
   * come off disk, and the guess is wrong whenever the machine is busy — at which point the first
   * taps land on a screen that has not mounted and every later step fails for a reason that has
   * nothing to do with the app. The store publishing `hasHydrated` is the real signal.
   */
  const waitForApp = async () => {
    await page.waitForFunction(() => window.__somnoStore && window.__somnoStore.getState().hasHydrated, null, {
      timeout: 60000,
    });
  };

  await page.goto('http://localhost:8098/', { waitUntil: 'networkidle', timeout: 60000 });
  await waitForApp();

  /** A genuinely fresh install: nothing in storage, nothing in memory. */
  const freshInstall = async () => {
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await waitForApp();
  };

  const screen = () => page.evaluate(() => window.__somnoStore.getState().screen);
  const state = (key) => page.evaluate((k) => window.__somnoStore.getState()[k], key);
  const text = () => page.evaluate(() => document.body.innerText);

  /**
   * Click the smallest tappable element containing `label`, exactly as a finger would.
   *
   * Returns false rather than throwing when the label is not on screen, so a missing control is
   * reported as a finding at the step that needed it instead of aborting the whole journey.
   */
  const tap = async (label) => {
    await settle();
    const box = await page.evaluate((txt) => {
      const candidates = [...document.querySelectorAll('[role="button"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"]')]
        .filter((el) => (el.textContent || '').includes(txt))
        .map((el) => ({ rect: el.getBoundingClientRect(), exact: (el.textContent || '').trim() === txt }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0)
        .sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || a.rect.width * a.rect.height - b.rect.width * b.rect.height);
      if (!candidates.length) return null;
      const r = candidates[0].rect;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, label);
    if (!box) return false;
    await page.mouse.click(box.x, box.y);
    return true;
  };

  /**
   * Wait until the screen has stopped moving.
   *
   * `ScreenIn` animates every screen in with a translate and a scale, so for about a third of a
   * second after a navigation, an element's rectangle is not where it is going to be. Measuring
   * during that window and clicking afterwards lands the click somewhere else entirely — which
   * looks exactly like a control that does not work, and cost a real debugging session before it
   * turned out to be the harness rather than the app. Two identical samples in a row means the
   * animation is done.
   *
   * The budget is generous on purpose. Giving up early does not skip the wait, it measures a
   * rectangle that is still moving and then clicks where it used to be — which reads as a control
   * that does not work, and is indistinguishable in the report from a real one.
   */
  const settle = async (timeoutMs = 8000) => {
    const sample = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[role="button"]')]
          .slice(0, 8)
          .map((e) => {
            const r = e.getBoundingClientRect();
            return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}`;
          })
          .join('|')
      );
    const deadline = Date.now() + timeoutMs;
    let previous = await sample();
    while (Date.now() < deadline) {
      await page.waitForTimeout(120);
      const next = await sample();
      if (next === previous && next !== '') return;
      previous = next;
    }
  };

  /** Tap a control identified by its accessibility label — the back chevron has no text in it. */
  const tapAria = async (label) => {
    await settle();
    const box = await page.evaluate((txt) => {
      const el = [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === txt);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    }, label);
    if (!box) return false;
    await page.mouse.click(box.x, box.y);
    return true;
  };

  /**
   * Tap `label` and require that it moves the app somewhere new.
   *
   * `waitMs` covers the screens that take a moment on purpose — the tap test and the face scan both
   * run to a timer, and one of them has a hand-off after it.
   */
  const step = async (label, { from, waitMs = 1200, expect = null } = {}) => {
    const before = from ?? (await screen());
    const found = await tap(label);
    if (!found) {
      ok(`"${label}" exists on ${before}`, false, `no control labelled "${label}" on screen ${before}`);
      return before;
    }
    const deadline = Date.now() + waitMs;
    let after = before;
    while (Date.now() < deadline) {
      await page.waitForTimeout(150);
      after = await screen();
      if (after !== before) break;
    }
    const moved = after !== before;
    ok(`${before} --"${label}"--> somewhere`, moved, moved ? after : `still on ${before} after ${waitMs}ms`);
    if (expect && moved) ok(`  and it is ${expect}`, after === expect, after);
    return after;
  };

  /** Wait for the app to leave `from` on its own — the tap test and the scan both self-advance. */
  const waitToLeave = async (from, ms, what) => {
    const deadline = Date.now() + ms;
    let now = from;
    while (Date.now() < deadline) {
      await page.waitForTimeout(250);
      now = await screen();
      if (now !== from) break;
    }
    ok(`${what}`, now !== from, now === from ? `stuck on ${from} for ${ms}ms` : now);
    return now;
  };

  /**
   * Play the tap test honestly: wait for the stimulus, then tap.
   *
   * Time-bounded rather than iteration-bounded. Each trial waits a random two to five seconds
   * before lighting up — that is the whole point of a psychomotor vigilance task, since a
   * predictable interval measures anticipation rather than vigilance — so nine trials can take
   * the better part of a minute, and a loop that gives up sooner reports a working test as broken.
   */
  const runTapTest = async (what) => {
    const total = (await state('pvtTotal')) || 9;
    // Generous: the longest legitimate run is nine trials at a five-second wait plus the
    // three-second lapse timeout, and the hand-off after the last one.
    const deadline = Date.now() + total * 9000 + 15000;
    while (Date.now() < deadline) {
      if ((await screen()) !== 'PVT') break;
      if (await state('pvtLive')) await page.mouse.click(195, 420);
      await page.waitForTimeout(200);
    }
    const now = await screen();
    ok(what, now !== 'PVT', now === 'PVT' ? `still on the tap test after ${Math.round((total * 9000 + 15000) / 1000)}s` : now);
    return now;
  };

  /**
   * Any text the layout is cutting off.
   *
   * Reported because a user said text was cut off, and no assertion in the suite could have seen
   * it: the interaction sweep reads `innerText`, which returns the *full* string whether or not a
   * pixel of it is visible. Overflow is a property of the box, so the box is what gets measured.
   */
  const clippedText = () =>
    page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('*')) {
        const t = (el.textContent || '').trim();
        if (!t || el.children.length) continue; // leaf text nodes only
        const style = getComputedStyle(el);
        if (style.overflow === 'visible' && style.overflowY === 'visible') continue;
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const clippedDown = el.scrollHeight > el.clientHeight + 2;
        const clippedAcross = el.scrollWidth > el.clientWidth + 2;
        // A -webkit-line-clamp is a deliberate truncation with an ellipsis; a clipped box is not.
        const deliberate = style.webkitLineClamp && style.webkitLineClamp !== 'none';
        if ((clippedDown || clippedAcross) && !deliberate) {
          bad.push(`${t.slice(0, 60)} [${el.clientWidth}x${el.clientHeight} vs ${el.scrollWidth}x${el.scrollHeight}]`);
        }
      }
      return bad;
    });

  const noClipping = async (where) => {
    const clipped = await clippedText();
    ok(`no text is cut off on ${where}`, clipped.length === 0, clipped.join(' | '));
  };

  try {
    // ---------------------------------------------------------------------
    // Journey 1 — a new user, from a blank install to the home screen.
    // ---------------------------------------------------------------------
    await freshInstall();

    let at = await screen();
    ok('a fresh install opens on the splash or sign-in', ['SPLASH', 'AU1'].includes(at), at);
    if (at === 'SPLASH') at = await waitToLeave('SPLASH', 6000, 'the splash screen moves on by itself');

    await noClipping('the sign-in screen');
    at = await step('Continue without an account', { from: at });
    if (at === 'AU1') at = await step('Skip for now', { from: at });

    ok('onboarding has begun', at.startsWith('A'), at);

    // The three intro slides, then the consent and permission steps.
    await noClipping('the first onboarding slide');
    for (let i = 0; i < 3 && (await screen()) === 'A1'; i++) {
      const before = await screen();
      const advanced = (await tap('Show me how')) || (await tap('What about my alarm?')) || (await tap('Get started'));
      ok(`slide ${i + 1} advances`, advanced, 'no call to action found on the slide');
      await page.waitForTimeout(500);
      if ((await screen()) !== before) break;
    }
    at = await screen();
    ok('the slides lead out of A1', at !== 'A1', at);

    await noClipping('the consent screen');
    // Consent has to be given before it will continue, which is correct — so give it.
    if (at === 'A2') {
      await tap('I understand');
      await page.waitForTimeout(300);
      at = await step('Continue', { from: 'A2' });
    }

    await noClipping('the permissions screen');
    if (at === 'A3') at = await step('Continue', { from: 'A3' });

    await noClipping('the profile screen');
    if (at === 'A4') at = await step('Continue', { from: 'A4', expect: 'A5' });

    await noClipping('the calibration intro');
    if (at === 'A5') at = await step('Start calibration', { from: 'A5' });

    // The tap test runs itself. Nine trials with a random 2–5s wait each, plus the hand-off.
    if (at === 'PVT') {
      const total = await state('pvtTotal');
      ok('the baseline test is short enough to finish half asleep', total <= 10, total);
      at = await runTapTest('the baseline tap test completes and moves on');
    }

    // No camera in a headless browser, so the scan is a no-frames outcome — which must still let
    // the user through rather than trapping them.
    if (at === 'SCAN') {
      at = await waitToLeave('SCAN', 20000, 'the face scan completes and moves on');
      if (at === 'SCANERR') at = await step('Continue without it', { from: 'SCANERR' });
    }

    await noClipping('the calibration result');
    if (at === 'A8') at = await step('Set up my alarm', { from: 'A8', expect: 'A9' });

    // The step that was broken: "Save alarm" set two flags and navigated nowhere.
    await noClipping('the first-alarm screen');
    if (at === 'A9') {
      at = await step('Save alarm', { from: 'A9', waitMs: 3000, expect: 'B' });
    }

    ok('a new user reaches the app', at === 'B', at);
    ok('and the alarm they set was created', (await state('alarms')).length === 1, JSON.stringify(await state('alarms')));
    ok('onboarding is recorded as complete', (await state('onboardingComplete')) === true);
    await noClipping('the home screen');

    // ---------------------------------------------------------------------
    // Journey 2 — a check-in, and does it survive being closed.
    // ---------------------------------------------------------------------
    const checkInsBefore = (await state('checkIns')).length;
    at = await step('Check in now', { from: 'B' });

    if (at === 'PVT') at = await runTapTest('the daily tap test completes');
    if (at === 'SCAN') {
      at = await waitToLeave('SCAN', 20000, 'the daily scan completes');
      if (at === 'SCANERR') at = await step('Continue without it', { from: 'SCANERR' });
    }

    await noClipping('the rating screen');
    if (at === 'C4') {
      // The rating is a row of numbers; Submit stays disabled until one is chosen, which is
      // correct — so choose one, the way the screen requires.
      const picked = await tap('5');
      ok('a rating can be chosen', picked && (await state('kss')) != null, await state('kss'));
      await page.waitForTimeout(300);
      at = await step('Submit', { from: 'C4', waitMs: 2000, expect: 'C5' });
    }

    ok('the check-in produced a record', (await state('checkIns')).length === checkInsBefore + 1, `${checkInsBefore} -> ${(await state('checkIns')).length}`);
    await noClipping('the score screen');

    // Back to the app, then log a night.
    at = await screen();
    if (at === 'C5') at = await step('Done', { from: 'C5', expect: 'B' });
    if ((await screen()) !== 'B') {
      await tap('Home');
      await page.waitForTimeout(700);
    }
    ok('the check-in ends back at the app', (await screen()) === 'B', await screen());

    const logsBefore = (await state('sleepLogs')).length;
    at = await step('Log sleep', { from: await screen(), expect: 'CLOG' });
    await noClipping('the sleep log screen');
    if (at === 'CLOG') {
      await tap('Solid');
      await page.waitForTimeout(200);
      await tap('Save sleep entry');
      await page.waitForTimeout(900);
    }
    ok('the night was recorded', (await state('sleepLogs')).length === logsBefore + 1, `${logsBefore} -> ${(await state('sleepLogs')).length}`);

    // The actual complaint: does any of it survive closing the app?
    const memoryBefore = await page.evaluate(() => {
      const s = window.__somnoStore.getState();
      return { checkIns: s.checkIns.length, sleepLogs: s.sleepLogs.length, alarms: s.alarms.length, sdi: s.sdi };
    });
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    const afterReload = await page.evaluate(() => {
      const s = window.__somnoStore.getState();
      return { checkIns: s.checkIns.length, sleepLogs: s.sleepLogs.length, alarms: s.alarms.length, sdi: s.sdi };
    });
    ok('check-ins survive closing the app', afterReload.checkIns === memoryBefore.checkIns, JSON.stringify({ memoryBefore, afterReload }));
    ok('logged nights survive too', afterReload.sleepLogs === memoryBefore.sleepLogs, JSON.stringify(afterReload));
    ok('so does the alarm', afterReload.alarms === memoryBefore.alarms, JSON.stringify(afterReload));
    ok('and the score is the one that was computed', afterReload.sdi === memoryBefore.sdi, JSON.stringify(afterReload));
    ok('a returning user opens on the app, not onboarding', (await screen()) === 'B', await screen());

    // ---------------------------------------------------------------------
    // Journey 3 — the tabs a user actually reads, now that there is data.
    // ---------------------------------------------------------------------
    for (const [label, expected] of [['Recovery', 'D'], ['Trends', 'E'], ['Check-in', 'C1'], ['Home', 'B']]) {
      await tap(label);
      await page.waitForTimeout(700);
      ok(`the ${label} tab opens`, (await screen()) === expected, await screen());
      await noClipping(`the ${label} tab`);
    }

    // Stats have to show the records that were just made, not an empty state.
    await tap('Trends');
    await page.waitForTimeout(800);
    const trends = await text();
    // The user has made exactly one check-in at this point. It has to be visible: a screen that
    // hides a reading until there are three of them is indistinguishable, from the outside, from a
    // screen that lost it.
    ok('one check-in is enough for Trends to show something', !/Check in once and your first reading appears here/.test(trends), trends.slice(0, 250));
    ok('and Trends says how much it is drawn from', /check-ins? so far|so far\./i.test(trends), trends.slice(0, 250));

    await tap('Recovery');
    await page.waitForTimeout(800);
    const recovery = await text();
    // The debt is derived, not measured, and the copy now says so. What this journey cares about
    // is that a night having been logged makes a real figure appear with its basis stated — so it
    // asserts on the basis clause and on the hours, not on the verb.
    ok('Recovery states a debt now a night exists', /Estimated across \d+ nights?/.test(recovery), recovery.slice(0, 300));
    ok('and prints it as hours rather than a dash', /\d+(\.\d+)? h\b/.test(recovery), recovery.slice(0, 300));
    ok('and does not call the modelled stage split a measurement', !/(debt|stages?) (is|are) measured/i.test(recovery), recovery.slice(0, 300));

    // ---------------------------------------------------------------------
    // Journey 4 — every settings screen, in and back out again.
    //
    // A sub-screen you cannot leave is the same defect as an onboarding step you cannot finish,
    // and there are eleven of them. Each is opened by tapping its row and left by the back
    // chevron, both as a finger would.
    // ---------------------------------------------------------------------
    await tap('Home');
    await page.waitForTimeout(600);
    const openedSettings = await tap('Settings');
    if (!openedSettings) await tapAria('Settings');
    await page.waitForTimeout(700);
    ok('the settings screen opens', (await screen()) === 'F0', await screen());

    const SETTINGS_ROWS = [
      ['Account', 'F9'],
      ['Profile & personal factors', 'F1'],
      ['Permissions', 'F2'],
      ['Integrations', 'F3'],
      ['Notifications', 'FN'],
      ['Data & privacy', 'F5'],
      ['Recalibrate baseline', 'F6'],
      ['How Somno works', 'F7'],
      ['Help & feedback', 'F8'],
    ];
    for (const [label, expected] of SETTINGS_ROWS) {
      if ((await screen()) !== 'F0') {
        await tapAria('Back');
        await page.waitForTimeout(500);
      }
      // Scroll the row into view the way a thumb would, rather than assuming where the list sits.
      await page.evaluate((txt) => {
        const el = [...document.querySelectorAll('[role="button"]')].find((e) => (e.textContent || '').includes(txt));
        el?.scrollIntoView({ block: 'center' });
      }, label);
      await page.waitForTimeout(250);
      const at2 = await step(label, { from: 'F0', expect: expected });
      await noClipping(`the ${label} screen`);
      if (at2 !== 'F0') {
        const backed = await tapAria('Back');
        await page.waitForTimeout(600);
        ok(`  and ${expected} can be left again`, backed && (await screen()) === 'F0', await screen());
      }
    }

    // ---------------------------------------------------------------------
    // Journey 5 — creating, editing and deleting an alarm.
    // ---------------------------------------------------------------------
    if ((await screen()) !== 'F0') {
      await tapAria('Back');
      await page.waitForTimeout(500);
    }
    await step('Alarm & Smart Wake', { from: 'F0', expect: 'F4' });
    await noClipping('the alarm list');

    /*
     * Edit and delete first, create second.
     *
     * The obvious order — create, then reopen what was created — leaves two cards on screen that
     * are byte-for-byte the same size and nearly the same text, and a click aimed at "the alarm
     * card" is then genuinely ambiguous. Working down to zero and back up to one keeps every step
     * unambiguous, and covers exactly the same three actions.
     */
    const alarmCards = () => page.locator('[role="button"]').filter({ hasText: /Smart Wake (on|off)/ });
    ok('the alarm from onboarding is listed', (await alarmCards().count()) === 1, await alarmCards().count());

    await alarmCards().first().click();
    await page.waitForTimeout(800);
    ok('an alarm opens for editing', (await screen()) === 'F4E', await screen());
    await noClipping('the alarm editor');

    await tap('Delete alarm');
    await page.waitForTimeout(900);
    ok('deleting returns to the list', (await screen()) === 'F4', await screen());
    ok('and the alarm is gone', (await state('alarms')).length === 0, (await state('alarms')).length);
    await noClipping('the empty alarm list');

    // With none left, the empty state's own button is the way to make one.
    await step('Add an alarm', { from: 'F4', expect: 'F4E' });
    await tap('Save');
    await page.waitForTimeout(900);
    ok('saving returns to the list', (await screen()) === 'F4', await screen());
    ok('and the alarm was created', (await state('alarms')).length === 1, (await state('alarms')).length);
    ok('and it is switched on, because nobody sets an alarm to leave it off', (await state('alarms'))[0]?.on === true, JSON.stringify(await state('alarms')));

    // ---------------------------------------------------------------------
    // Journey 6 — the alarm going off, and every way out of it.
    // ---------------------------------------------------------------------
    await tapAria('Back');
    await page.waitForTimeout(500);
    if ((await screen()) === 'F0') {
      await tapAria('Back');
      await page.waitForTimeout(500);
    }

    // The preview is the only way to reach the alarm screens without waiting for a real alarm.
    await page.evaluate(() => window.__somnoStore.getState().beginAlarmSession());
    await page.waitForTimeout(700);
    ok('the alarm screen opens', (await screen()) === 'G1', await screen());
    await noClipping('the alarm screen');

    // The escape hatch is the app's hardest safety rule: it must always work, immediately.
    const stopped = await step('Just stop the alarm', { from: 'G1', waitMs: 2000, expect: 'B' });
    ok('stopping the alarm always works', stopped === 'B', stopped);

    // And the check-in route off it reaches the wake screen rather than stranding anyone.
    await page.evaluate(() => window.__somnoStore.getState().beginAlarmSession());
    await page.waitForTimeout(600);
    let alarmAt = await step('Check in', { from: 'G1', waitMs: 2500 });
    if (alarmAt === 'PVT') alarmAt = await runTapTest('the alarm tap test completes');
    if (alarmAt === 'SCAN') {
      alarmAt = await waitToLeave('SCAN', 20000, 'the alarm scan completes');
      if (alarmAt === 'SCANERR') alarmAt = await step('Continue without it', { from: 'SCANERR' });
    }
    ok('the alarm check-in reaches the wake screen', alarmAt === 'G3', alarmAt);
    if (alarmAt === 'G3') {
      await noClipping('the wake screen');
      const outs = await page.evaluate(() =>
        [...document.querySelectorAll('[role="button"]')].map((e) => (e.textContent || '').trim()).filter(Boolean)
      );
      ok('the wake screen offers a way out', outs.some((t) => /stop|open somno|snooze|recovery/i.test(t)), outs.join(' | '));
      await tap('Just stop the alarm');
      await page.waitForTimeout(900);
      ok('and it ends back at the app', (await screen()) === 'B', await screen());
    }

    // ---------------------------------------------------------------------
    // Journey 6 — a second check-in must not inherit the first one's signals.
    //
    // The bug this exists for showed nothing on screen: a Quick Rating, which is one KSS rating and
    // nothing else, reported a confident four-signal score built from the previous check-in's face
    // scan and tap test. Every number looked reasonable. Only the count gave it away, and only if
    // you knew what it should have been.
    // ---------------------------------------------------------------------
    await tap('Home');
    await page.waitForTimeout(500);
    await tap('Check-in');
    await page.waitForTimeout(700);

    const before = await page.evaluate(() => {
      const s = window.__somnoStore.getState();
      return { pvt: s.pvtTimes.length, face: !!s.lastFaceMetrics, kss: s.kss, signals: s.signals };
    });

    // Quick Rating: the entry that used to reset nothing at all.
    const openedQuick = await tap('Quick rating');
    if (!openedQuick) await tapAria('Quick rating');
    await page.waitForTimeout(800);

    const afterEntry = await page.evaluate(() => {
      const s = window.__somnoStore.getState();
      return { screen: s.screen, pvt: s.pvtTimes.length, face: !!s.lastFaceMetrics, kss: s.kss, signals: s.signals };
    });
    ok('a quick rating opens the rating screen', afterEntry.screen === 'C4', JSON.stringify(afterEntry));
    ok('and starts with no tap-test times', afterEntry.pvt === 0, JSON.stringify({ before, afterEntry }));
    ok('no face scan carried over', afterEntry.face === false, JSON.stringify({ before, afterEntry }));
    ok('no rating carried over', afterEntry.kss === null, JSON.stringify(afterEntry));
    ok('and no signal count carried over', afterEntry.signals === 0, JSON.stringify(afterEntry));

    // Rate and submit: the resulting score must describe one signal, not four.
    // The rating buttons are radios labelled "<n>, <word>", so tap by aria label rather than text.
    const words = await page.evaluate(() =>
      [...document.querySelectorAll('[role="radio"]')].map((e) => e.getAttribute('aria-label') || '')
    );
    const fifth = words.find((w) => w.startsWith('5,'));
    ok('the rating scale is on screen', Boolean(fifth), words.join(' | '));
    const rated = fifth ? await tapAria(fifth) : false;
    ok('a rating can be given', rated, fifth);
    if (rated) {
      await page.waitForTimeout(500);
      const done = await tap('Submit');
      ok('and submitted', done);
      if (done) {
        await page.waitForTimeout(1500);
        const scored = await page.evaluate(() => {
          const s = window.__somnoStore.getState();
          const last = s.checkIns[s.checkIns.length - 1];
          return { signals: s.signals, recorded: last ? last.signalsUsed : null, confidence: last ? last.confidence : null };
        });
        /**
         * Two, not four. The rating is one signal; sleep debt is the other, and it legitimately
         * belongs — it comes from the nights already logged rather than from anything measured in
         * this session. What must *not* appear is the previous check-in's face scan and tap test,
         * which is what a count of four would mean.
         */
        ok('a rating-only check-in scores on its own signals', scored.signals === 2, JSON.stringify(scored));
        ok('not on the previous check-in\'s four', scored.signals < 4, JSON.stringify(scored));
        ok('and records the count it actually used', scored.recorded === scored.signals, JSON.stringify(scored));
        ok('so its confidence is not high', scored.confidence !== 'high', JSON.stringify(scored));
      }
    }

    // ---------------------------------------------------------------------
    // Journey 7 — re-rating from the results screen edits, it does not duplicate.
    // ---------------------------------------------------------------------
    {
      const beforeEdit = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { count: s.checkIns.length, activeId: s.activeCheckInId, screen: s.screen };
      });

      if (beforeEdit.screen === 'C5' || (await screen()) === 'C5') {
        const opened = await tap('How you rated yourself');
        await page.waitForTimeout(900);
        ok('the results screen can re-open the rating', opened && (await screen()) === 'C4', await screen());

        const labels = await page.evaluate(() =>
          [...document.querySelectorAll('[role="radio"]')].map((e) => e.getAttribute('aria-label') || '')
        );
        const seventh = labels.find((w) => w.startsWith('7,'));
        if (seventh && (await tapAria(seventh))) {
          await page.waitForTimeout(400);
          await tap('Submit');
          await page.waitForTimeout(1500);
          const afterEdit = await page.evaluate(() => {
            const s = window.__somnoStore.getState();
            const last = s.checkIns[s.checkIns.length - 1];
            return { count: s.checkIns.length, activeId: s.activeCheckInId, kss: last ? last.kss : null };
          });
          ok('re-rating adds no second check-in', afterEdit.count === beforeEdit.count, JSON.stringify({ beforeEdit, afterEdit }));
          ok('and the record carries the new rating', afterEdit.kss === 7, JSON.stringify(afterEdit));
          ok('on the same record id', afterEdit.activeId === beforeEdit.activeId, JSON.stringify({ beforeEdit, afterEdit }));
        }
      }
    }

    // ---------------------------------------------------------------------
    // Journey 8 — an alarm with Smart Wake switched off is an alarm clock.
    // ---------------------------------------------------------------------
    {
      /**
       * `alarm.smart` used to change nothing anyone could observe. Every alarm opened the wake
       * screen offering a reaction-time check-in, and the only route to a snooze went through it —
       * so a user who deliberately turned Smart Wake off still got the smart alarm, and the
       * adaptive snooze length was applied to it as well.
       */
      await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        window.__somnoStore.setState({
          alarms: [{ id: 1, min: 420, days: [true, true, true, true, true, true, true], smart: false, on: true, sound: '', label: 'Plain' }],
          alarmEvents: [],
          snoozes: 0,
          // An adaptive length left over from a previous smart alarm. A plain alarm must not
          // inherit it: nothing in a plain alarm's flow ever recomputes it.
          snoozeLen: 11,
        });
        s.beginAlarmSession(1);
      });
      await page.waitForTimeout(900);
      ok('a plain alarm still opens the alarm screen', (await screen()) === 'G1', await screen());

      const plain = await text();
      ok('it offers a snooze without a test first', /Snooze \d+ minutes/.test(plain), plain.slice(0, 200));
      ok('and does not ask for a check-in', !/Check in/.test(plain), plain.slice(0, 200));
      ok('the snooze length is the fixed one', (await state('snoozeLen')) === 9, await state('snoozeLen'));

      const snoozeBtn = page.getByRole('button', { name: /^Snooze \d+ minutes$/ });
      if (await snoozeBtn.count()) {
        await snoozeBtn.first().click({ timeout: 5000 });
        await page.waitForTimeout(800);
        ok('snoozing from a plain alarm works', (await state('snoozes')) === 1, await state('snoozes'));
        ok('and stays on the alarm screen', (await screen()) === 'G1', await screen());
      }

      // The same alarm with the toggle on gets the check-in back.
      await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        window.__somnoStore.setState({ alarms: [{ ...s.alarms[0], smart: true }], alarmEvents: [], snoozes: 0 });
        s.beginAlarmSession(1);
      });
      await page.waitForTimeout(900);
      ok('with Smart Wake on the check-in comes back', /Check in/.test(await text()), (await text()).slice(0, 160));
      await tap('Just stop the alarm');
      await page.waitForTimeout(800);
    }

    // ---------------------------------------------------------------------
    // Journey 9 — Settings → Account → Change email changes the email.
    // ---------------------------------------------------------------------
    {
      // This row navigated to AU2 — the signup screen. Someone moving their account to a new
      // address was handed a form that creates a second one.
      await page.evaluate(() => window.__somnoStore.getState().setEmail(''));
      await page.evaluate(() => window.__somnoStore.getState().go('F9'));
      await page.waitForTimeout(700);
      await tap('Change email');
      await page.waitForTimeout(700);
      ok('with no account it does not enter the auth stack', (await screen()) === 'F9', await screen());
      ok('it explains why instead', /No account yet/.test(JSON.stringify(await state('sheet'))), JSON.stringify(await state('sheet')));

      await page.evaluate(() => window.__somnoStore.getState().setEmail('someone@example.com'));
      await page.evaluate(() => window.__somnoStore.getState().go('F9'));
      await page.waitForTimeout(700);
      await tap('Change email');
      await page.waitForTimeout(800);
      ok('signed in, it opens the change-email screen', (await screen()) === 'F9E', await screen());

      const changeEmail = await text();
      ok('which shows the address being changed', changeEmail.includes('someone@example.com'), changeEmail.slice(0, 200));
      ok('and is not the signup form', !/Create your account|Already have an account/i.test(changeEmail), changeEmail.slice(0, 200));

      const field = page.getByPlaceholder('you@example.com');
      if (await field.count()) {
        await field.first().fill('new@example.com');
        await page.waitForTimeout(300);
        // Typing a new address must not rewrite the account's own email in the store — the change
        // is not real until the confirmation link is followed.
        ok('typing does not overwrite the stored account email', (await state('email')) === 'someone@example.com', await state('email'));
        await tap('Send confirmation');
        await page.waitForTimeout(900);
        ok('submitting keeps the user on the screen when there is no backend', (await screen()) === 'F9E', await screen());
      }
      await noClipping('the change-email screen');
    }

    // ---------------------------------------------------------------------
    // Journey 10 — a reset code sent elsewhere does not rename this account.
    // ---------------------------------------------------------------------
    {
      /**
       * "Change password" opens the recovery screen, which bound its text field straight to the
       * store's `email` — the same field the Account screen calls the signed-in address. So typing
       * any other address there, to send a reset link to it, renamed the signed-in account
       * everywhere in the app, with nothing authenticated and no server call made yet.
       */
      await page.evaluate(() => window.__somnoStore.getState().setEmail('owner@example.com'));
      await page.evaluate(() => window.__somnoStore.getState().go('F9'));
      await page.waitForTimeout(700);
      await tap('Change password');
      await page.waitForTimeout(800);
      ok('Change password opens the recovery screen', (await screen()) === 'AU4', await screen());

      // Asserted on the state, not on innerText: the address sits in a text input, and an input's
      // value is not part of the document's rendered text.
      ok('prefilled with the account address', (await state('authEmail')) === 'owner@example.com', await state('authEmail'));

      const field = page.getByPlaceholder('you@example.com');
      if (await field.count()) {
        await field.first().fill('someone.else@example.com');
        await page.waitForTimeout(400);
        ok(
          'typing a different address does not rename the account',
          (await state('email')) === 'owner@example.com',
          await state('email')
        );
        ok('it goes into the form field instead', (await state('authEmail')) === 'someone.else@example.com', await state('authEmail'));
      }

      // And back from here returns to Settings, not to the signup screen.
      await tapAria('Back');
      await page.waitForTimeout(800);
      ok('back returns to Account, not signup', (await screen()) === 'F9', await screen());
      ok('with the account address intact', (await text()).includes('owner@example.com'), (await text()).slice(0, 200));
    }

    // ---------------------------------------------------------------------
    // Journey 11 — switching accounts on one phone, against the real store.
    // ---------------------------------------------------------------------
    {
      /**
       * Driven through the store rather than the screens because there is no Supabase project
       * behind this harness — but `claimDataFor`, `wipeLocalData` and the identity setters are the
       * real ones, so the sequence below is exactly what `adoptSession` performs, in the order it
       * performs it.
       *
       * Two bugs met here. `claimDataFor` wipes a device that belongs to somebody else, and the
       * wipe resets identity — so writing the new session's email and name *first*, as both callers
       * used to, meant they were erased a moment later and B ended up looking signed out with a
       * valid session. And the wipe did not clear `displayName` at all, so whichever way round it
       * ran, A's first name was still greeting B on Home.
       */
      const setUpUserA = () =>
        page.evaluate(() => {
          const now = Date.now();
          window.__somnoStore.setState({
            dataOwnerId: 'user-A',
            email: 'ana@example.com',
            displayName: 'Ana',
            checkIns: [
              { id: 'ci_a1', timestamp: now - 86400000, sdi: 61, kss: 4, signals: 2, confidence: 'medium', source: 'daily' },
              { id: 'ci_a2', timestamp: now - 3600000, sdi: 55, kss: 5, signals: 2, confidence: 'medium', source: 'daily' },
            ],
            sleepLogs: [{ id: 'sl_a1', date: '2026-08-16', hours: 6.5, quality: 3 }],
            alarms: [{ id: 1, min: 420, days: [true, true, true, true, true, false, false], smart: true, on: true, sound: '', label: "Ana's" }],
          });
        });

      await setUpUserA();
      await page.waitForTimeout(400);
      ok('user A is set up', (await state('dataOwnerId')) === 'user-A' && (await state('checkIns')).length === 2);

      // The switch, in the fixed order: claim first, then apply the new identity.
      await page.evaluate(async () => {
        await window.__somnoStore.getState().claimDataFor('user-B');
        window.__somnoStore.getState().setEmail('ben@example.com');
        window.__somnoStore.getState().setDisplayName('Ben');
      });
      await page.waitForTimeout(600);

      const afterSwitch = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return {
          owner: s.dataOwnerId,
          email: s.email,
          displayName: s.displayName,
          checkIns: s.checkIns.length,
          sleepLogs: s.sleepLogs.length,
          alarms: s.alarms.length,
          baselineProfile: s.baselineProfile,
        };
      });
      ok('B owns the device', afterSwitch.owner === 'user-B', JSON.stringify(afterSwitch));
      ok("B's email survives the wipe", afterSwitch.email === 'ben@example.com', JSON.stringify(afterSwitch));
      ok("and B's name does too", afterSwitch.displayName === 'Ben', JSON.stringify(afterSwitch));
      ok("none of A's check-ins remain", afterSwitch.checkIns === 0, JSON.stringify(afterSwitch));
      ok('nor their sleep entries', afterSwitch.sleepLogs === 0, JSON.stringify(afterSwitch));
      ok("nor A's alarms, which would have rung for B", afterSwitch.alarms === 0, JSON.stringify(afterSwitch));
      ok("nor A's baseline", afterSwitch.baselineProfile === null, JSON.stringify(afterSwitch));

      // The screens have to agree with the store: no trace of A anywhere on them.
      await page.evaluate(() => window.__somnoStore.getState().go('F9'));
      await page.waitForTimeout(700);
      const account = await text();
      ok('the Account screen shows B', account.includes('ben@example.com'), account.slice(0, 200));
      ok('and never A', !/ana@example\.com|Ana/.test(account), account.slice(0, 200));

      await page.evaluate(() => window.__somnoStore.getState().go('B'));
      await page.waitForTimeout(700);
      const home = await text();
      ok('Home greets B', /Ben/.test(home), home.slice(0, 160));
      ok("and does not greet A", !/Ana/.test(home), home.slice(0, 160));

      /**
       * A wipe on its own — the delete-account path — must clear the identity outright, including
       * the name that used to be left behind for whoever picked the phone up next.
       */
      await page.evaluate(() => window.__somnoStore.getState().wipeLocalData());
      await page.waitForTimeout(600);
      const wiped = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { email: s.email, authEmail: s.authEmail, displayName: s.displayName, owner: s.dataOwnerId };
      });
      ok('a wipe clears the address', wiped.email === '', JSON.stringify(wiped));
      ok('the form field', wiped.authEmail === '', JSON.stringify(wiped));
      ok('the name shown on Home', wiped.displayName === '', JSON.stringify(wiped));
      ok('and the owner', wiped.owner === null, JSON.stringify(wiped));

      /**
       * And the case the wipe must not touch: data made before there was ever an account. Someone
       * who used Somno for a fortnight and then signed up expects that fortnight to come with them.
       */
      await page.evaluate(() => {
        const now = Date.now();
        window.__somnoStore.setState({
          dataOwnerId: null,
          checkIns: [{ id: 'ci_local', timestamp: now - 7200000, sdi: 58, kss: 5, signals: 1, confidence: 'low', source: 'daily' }],
          sleepLogs: [{ id: 'sl_local', date: '2026-08-17', hours: 7, quality: 4 }],
        });
      });
      await page.evaluate(async () => {
        await window.__somnoStore.getState().claimDataFor('user-C');
        window.__somnoStore.getState().setEmail('cass@example.com');
      });
      await page.waitForTimeout(600);
      const adopted = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { owner: s.dataOwnerId, email: s.email, checkIns: s.checkIns.length, sleepLogs: s.sleepLogs.length };
      });
      ok('offline history is adopted, not erased', adopted.checkIns === 1 && adopted.sleepLogs === 1, JSON.stringify(adopted));
      ok('by the account that claimed it', adopted.owner === 'user-C', JSON.stringify(adopted));
      ok('whose identity is intact', adopted.email === 'cass@example.com', JSON.stringify(adopted));

      // Re-claiming for the same user is a no-op, which is what every ordinary auth event is.
      await page.evaluate(() => window.__somnoStore.getState().claimDataFor('user-C'));
      await page.waitForTimeout(400);
      const again = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { email: s.email, checkIns: s.checkIns.length };
      });
      ok('a repeat claim keeps the history', again.checkIns === 1, JSON.stringify(again));
      ok('and the identity', again.email === 'cass@example.com', JSON.stringify(again));
    }

    // ---------------------------------------------------------------------
    // Journey 12 — the screens that used to claim more than the code did.
    // ---------------------------------------------------------------------
    {
      /**
       * Data & privacy → Export my data.
       *
       * The row opened an explainer and stopped. There is no share sheet in a browser, so what this
       * asserts is that the row *reaches the export at all*: the real flow reports 'unavailable' on
       * web, and its sheet is a different one from the description the row used to show.
       */
      await page.evaluate(() => window.__somnoStore.getState().go('F5'));
      await page.waitForTimeout(700);
      await tap('Export my data');
      await page.waitForTimeout(900);
      const exportSheet = JSON.stringify(await state('sheet'));
      ok('the export row runs the export', !/It is yours, for your own records/.test(exportSheet), exportSheet.slice(0, 200));
      ok(
        'and reports a real outcome',
        /Sharing unavailable|Nothing to export yet|Could not export/.test(exportSheet),
        exportSheet.slice(0, 200)
      );

      // The delete card promised an emailed copy of the data. Nothing emails anything.
      const privacy = await text();
      ok('no emailed copy is offered', !/email/i.test(privacy), privacy.match(/.{0,80}email.{0,80}/i)?.[0]);
      ok('it points at the export instead', /Export your data first/.test(privacy), privacy.slice(0, 200));

      /**
       * A switch inside a settings row is one control, not two.
       *
       * Every row wrapped its Toggle in a Pressable running the same handler, and react-native-web
       * bubbles — so a tap on the switch itself fired both and the setting flipped straight back.
       * The part of the row users actually aim at was the only part that did nothing.
       */
      await page.evaluate(() => window.__somnoStore.getState().go('FN'));
      await page.waitForTimeout(700);
      const before = await state('noteM');
      const knob = page.getByRole('switch', { name: 'Morning check-in reminder' });
      if (await knob.count()) {
        await knob.first().click({ timeout: 5000 });
        await page.waitForTimeout(500);
        ok('tapping the switch changes the setting once', (await state('noteM')) === !before, `${before} -> ${await state('noteM')}`);
        await knob.first().click({ timeout: 5000 });
        await page.waitForTimeout(500);
        ok('and tapping it again changes it back', (await state('noteM')) === before, await state('noteM'));
      }

      /**
       * The alarm list is the case where the row and the switch do different things. Turning an
       * alarm off used to also push the edit screen over the top of it.
       */
      await page.evaluate(() => {
        window.__somnoStore.setState({
          alarms: [{ id: 7, min: 420, days: [true, true, true, true, true, false, false], smart: true, on: true, sound: '', label: 'Work' }],
        });
        window.__somnoStore.getState().go('F4');
      });
      await page.waitForTimeout(800);
      const alarmSwitch = page.getByRole('switch', { name: /^Alarm / });
      if (await alarmSwitch.count()) {
        await alarmSwitch.first().click({ timeout: 5000 });
        await page.waitForTimeout(700);
        ok('the alarm switches off', (await state('alarms'))[0].on === false, JSON.stringify(await state('alarms')));
        ok('and does not open the editor', (await screen()) === 'F4', await screen());
      }

      // An alarm with no days can never ring, and used to save silently as though it would.
      await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        s.openAlarm(7);
      });
      await page.waitForTimeout(800);
      await page.evaluate(() => window.__somnoStore.setState({ days: [false, false, false, false, false, false, false] }));
      await page.waitForTimeout(300);
      const savedOk = await page.evaluate(() => window.__somnoStore.getState().saveAlarm());
      ok('an alarm with no days is refused', savedOk === false, savedOk);
      ok('and the editor stays open', (await screen()) === 'F4E', await screen());
    }

    // ---------------------------------------------------------------------
    // Journey 13 — empty states say they are empty rather than inventing data.
    // ---------------------------------------------------------------------
    {
      await freshInstall();

      // A brand-new user has no week, so there is no "+7 vs your weekly average" to state. The
      // average behind it used to be a hardcoded 64.
      const avg = await page.evaluate(() => window.__somnoStore.getState().weeklyAverageSdi());
      ok('there is no weekly average yet', avg === null, avg);
      const deltaNow = await state('delta');
      ok('and no delta against one', deltaNow === 0 || deltaNow == null, deltaNow);

      /**
       * Recovery drew a ten-night projection from a substituted three hours of debt whenever the
       * real figure was zero — which is every new user, and everyone actually caught up.
       */
      const curve = await page.evaluate(() => window.__somnoStore.getState().recoveryCurve());
      ok('no debt means no recovery curve', Array.isArray(curve) && curve.length === 0, curve);

      // The sleep log opened on 23:52 / 06:41 — a stranger's night, stated to the minute.
      await page.evaluate(() => window.__somnoStore.getState().startSleepLog());
      await page.waitForTimeout(900);
      const seeded = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { logBed: s.logBed, logWake: s.logWake, bedMin: s.bedMin, wakeMin: s.wakeMin };
      });
      ok('the log is seeded from the usual bedtime', seeded.logBed === seeded.bedMin, JSON.stringify(seeded));
      ok('and the usual wake time', seeded.logWake === seeded.wakeMin, JSON.stringify(seeded));
      ok('not the mockup values', !(seeded.logBed === 1432 && seeded.logWake === 401), JSON.stringify(seeded));
      const logText = await text();
      ok('and it says which night it is recording', /Last night — woke/.test(logText), logText.slice(0, 200));
    }

    // ---------------------------------------------------------------------
    // Journey 14 — recalibrating cannot cost you the calibration you had.
    // ---------------------------------------------------------------------
    {
      /**
       * The old code erased the facial baseline on the first tap of Recalibrate, before any
       * replacement existed. Backing out of the tap test — which is the same screen, so it is one
       * mis-tap away — destroyed a settled reference with nothing to put in its place, and every
       * later scan was then compared against nothing.
       */
      const seedBaseline = () =>
        page.evaluate(() => {
          window.__somnoStore.setState({
            faceBaseline: {
              periorbital: { n: 12, mean: 0.15, m2: 0.002 },
              redness: { n: 12, mean: 0.05, m2: 0.001 },
              eyeContrast: { n: 12, mean: 1.2, m2: 0.01 },
              motion: { n: 12, mean: 0.02, m2: 0.0001 },
              updatedAt: 1_000,
            },
            recalibration: null,
          });
        });

      await seedBaseline();
      await page.evaluate(() => window.__somnoStore.getState().go('F6'));
      await page.waitForTimeout(700);
      ok('there is a calibration to lose', (await state('faceBaseline'))?.periorbital.n === 12);

      await tap('Start recalibration');
      await page.waitForTimeout(900);
      const started = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { screen: s.screen, n: s.faceBaseline?.periorbital.n ?? null, recal: s.recalibration };
      });
      ok('recalibration starts the tap test', started.screen === 'PVT', JSON.stringify(started));
      ok('and erases nothing yet', started.n === 12, JSON.stringify(started));
      ok('while opening an empty staging area', started.recal && started.recal.baseline === null && started.recal.faceBaseline === null, JSON.stringify(started));

      // Backing out. Nothing was committed, so nothing may be lost.
      await page.evaluate(() => window.__somnoStore.getState().abortTest());
      await page.waitForTimeout(800);
      const cancelled = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { screen: s.screen, n: s.faceBaseline?.periorbital.n ?? null, recal: s.recalibration };
      });
      ok('cancelling keeps the calibration intact', cancelled.n === 12, JSON.stringify(cancelled));
      ok('clears the in-progress flag', cancelled.recal === null, JSON.stringify(cancelled));
      ok('and returns to the recalibration screen', cancelled.screen === 'F6', cancelled.screen);

      /**
       * A recalibration where the scan is skipped or fails is the same story: the reaction-time
       * half is replaced, the facial half is left alone, and the summary says so rather than
       * claiming both.
       */
      await page.evaluate(() => {
        window.__somnoStore.setState({
          recalibration: { faceBaseline: null, baseline: null, session: null, trials: 9 },
        });
        window.__somnoStore.getState().go('A8');
      });
      await page.waitForTimeout(800);
      const skipped = await text();
      ok('a skipped scan leaves the facial calibration alone', (await state('faceBaseline'))?.periorbital.n === 12);
      ok('and the summary says so', /facial calibration is left as it was/.test(skipped), skipped.slice(0, 300));
      ok('rather than offering the onboarding alarm', !/Set up my alarm/.test(skipped), skipped.slice(0, 300));

      await tap('Done');
      await page.waitForTimeout(800);
      ok('finishing returns to Settings', (await screen()) === 'F0', await screen());
      ok('and closes the recalibration', (await state('recalibration')) === null, await state('recalibration'));

      /**
       * A successful scan *stages* the replacement rather than applying it: the live calibration is
       * still the old one until the user taps Done. The staged copy starts from empty and folds this
       * scan in, so it holds one sample rather than a new face averaged into twelve old readings.
       */
      await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        window.__somnoStore.setState({ recalibration: { faceBaseline: null, baseline: null, session: null, trials: 9 } });
        s.setFaceMetrics({
          brightness: 0.5,
          redness: 0.06,
          periorbital: 0.17,
          eyeContrast: 1.1,
          motion: 0.03,
          stillnessMs: 6000,
          zScore: 0,
          provisional: true,
        });
      });
      await page.waitForTimeout(500);
      const staged = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { live: s.faceBaseline?.periorbital.n ?? null, staged: s.recalibration?.faceBaseline?.periorbital.n ?? null };
      });
      ok('a successful scan does not touch the live calibration', staged.live === 12, JSON.stringify(staged));
      ok('it stages a fresh one built from that scan', staged.staged === 1, JSON.stringify(staged));

      // And Done is what applies it.
      await page.evaluate(() => window.__somnoStore.getState().finishRecalibration());
      await page.waitForTimeout(500);
      ok('finishing applies the staged calibration', (await state('faceBaseline'))?.periorbital.n === 1, await state('faceBaseline'));
      ok('and closes the recalibration', (await state('recalibration')) === null);

      /**
       * And the tap-test half is staged too, so a completed run that is then abandoned changes
       * nothing. This is the half the source checks cannot see: the staging object exists either
       * way, and only the live baseline tells you whether it was applied early.
       */
      await page.evaluate(() => {
        window.__somnoStore.setState({
          baseline: 300,
          baselineProfile: { pvtMeanRt: 300, pvtStdRt: 40, createdAt: 1000 },
          baselineTrials: 9,
          recalibration: {
            faceBaseline: null,
            baseline: { pvtMeanRt: 250, pvtStdRt: 30, createdAt: 2000, capturedAtHour: 9.5, capturedHoursAwake: 2 },
            session: null,
            trials: 9,
          },
        });
      });
      await page.waitForTimeout(300);
      ok('a completed tap test has not replaced the live baseline', (await state('baseline')) === 300, await state('baseline'));

      // Abandoning it now must leave the original in place.
      await page.evaluate(() => window.__somnoStore.getState().abortTest());
      await page.waitForTimeout(600);
      ok('and cancelling afterwards keeps it', (await state('baseline')) === 300, await state('baseline'));
      ok('with the staging area cleared', (await state('recalibration')) === null);

      // Whereas finishing applies it, with the circadian phase intact.
      await page.evaluate(() => {
        window.__somnoStore.setState({
          recalibration: {
            faceBaseline: null,
            baseline: { pvtMeanRt: 250, pvtStdRt: 30, createdAt: 2000, capturedAtHour: 9.5, capturedHoursAwake: 2 },
            session: null,
            trials: 9,
          },
        });
        window.__somnoStore.getState().finishRecalibration();
      });
      await page.waitForTimeout(600);
      const committed = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { baseline: s.baseline, profile: s.baselineProfile, trials: s.baselineTrials, screen: s.screen };
      });
      ok('finishing replaces the baseline', committed.baseline === 250, JSON.stringify(committed));
      ok('with its trial count', committed.trials === 9, JSON.stringify(committed));
      ok('and the circadian phase it was measured at', committed.profile?.capturedAtHour === 9.5, JSON.stringify(committed));
      ok('landing back in Settings', committed.screen === 'F0', committed.screen);

      // An ordinary scan afterwards accumulates rather than resetting again.
      await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        s.setFaceMetrics({
          brightness: 0.5,
          redness: 0.06,
          periorbital: 0.17,
          eyeContrast: 1.1,
          motion: 0.03,
          stillnessMs: 6000,
          zScore: 0,
          provisional: true,
        });
      });
      await page.waitForTimeout(400);
      ok('later scans build on it instead of resetting', (await state('faceBaseline'))?.periorbital.n === 2, await state('faceBaseline'));
    }

    // ---------------------------------------------------------------------
    // Journey 15 — an edit is an edit, and a restore is a restore.
    // ---------------------------------------------------------------------
    {
      /**
       * Editing a check-in used to stamp `Date.now()` on it and re-derive its trigger type, so
       * re-rating a 7am alarm check-in in the evening moved it to 21:00 and relabelled it
       * "evening" — and since a check-in's identity upstream *is* its instant, the account received
       * it as a second, separate reading rather than a correction of the first.
       */
      const morning = Date.now() - 12 * 60 * 60 * 1000;
      await page.evaluate((ts) => {
        window.__somnoStore.setState({
          checkIns: [
            { id: `ci_${ts}`, timestamp: ts, triggerType: 'alarm', pvt: null, face: null, kss: 3, sdi: 70, confidence: 'low', signalsUsed: 1 },
          ],
          activeCheckInId: `ci_${ts}`,
          kss: 7,
          pvtTimes: [],
          lastFaceMetrics: null,
          hasData: true,
        });
        window.__somnoStore.getState().submitKss();
      }, morning);
      await page.waitForTimeout(800);

      const edited = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { count: s.checkIns.length, rec: s.checkIns[0], screen: s.screen, sdi: s.sdi };
      });
      ok('an edit adds no second check-in', edited.count === 1, JSON.stringify(edited));
      ok('and keeps the original instant', edited.rec.timestamp === morning, `${edited.rec.timestamp} vs ${morning}`);
      ok('and its trigger type', edited.rec.triggerType === 'alarm', edited.rec.triggerType);
      ok('and its id', edited.rec.id === `ci_${morning}`, edited.rec.id);
      ok('while the rating actually changed', edited.rec.kss === 7, edited.rec.kss);
      ok('the score was recomputed with it', edited.rec.sdi === edited.sdi, JSON.stringify(edited));
      ok('and it lands on the results screen', edited.screen === 'C5', edited.screen);

      /**
       * A new phone, restoring an account. Everything the models read has to come back, or the
       * history looks restored while the scoring is a stranger's: a default sleep target, no stress
       * flag, no sleep window, and no alarms at all.
       */
      await freshInstall();
      await page.evaluate(() => {
        window.__somnoStore.getState().applyRestoredData({
          checkIns: [],
          sleepLogs: [],
          baseline: { pvtMeanRt: 265, pvtStdRt: 32, createdAt: 1000, capturedAtHour: 8.25, capturedHoursAwake: 1.5, pvtSpeed: 3.7 },
          faceBaseline: null,
          profile: {
            ageBand: '45-54',
            gender: 'female',
            medication: 'sedative',
            highStress: true,
            bedMin: 1380,
            wakeMin: 400,
            idealWake: 440,
            onboardingComplete: true,
          },
          alarms: [{ id: 55, min: 400, days: [true, true, true, true, true, false, false], smart: true, on: true, sound: '', label: 'Work' }],
        });
      });
      await page.waitForTimeout(600);

      const restored = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return {
          age: s.age,
          ageNeedsConfirming: s.ageNeedsConfirming,
          gender: s.gender,
          medication: s.medication,
          highStress: s.highStress,
          bedMin: s.bedMin,
          wakeMin: s.wakeMin,
          idealWake: s.idealWake,
          alarms: s.alarms.length,
          alarmId: s.alarms[0]?.id ?? null,
          baseline: s.baseline,
          phase: s.baselineProfile?.capturedAtHour ?? null,
          speed: s.baselineProfile?.pvtSpeed ?? null,
        };
      });
      ok('the sleep window comes back', restored.bedMin === 1380 && restored.wakeMin === 400, JSON.stringify(restored));
      ok('and the natural wake time behind the chronotype', restored.idealWake === 440, JSON.stringify(restored));
      ok('the stress flag comes back', restored.highStress === true, JSON.stringify(restored));
      ok('so do gender and medication', restored.gender === 'female' && restored.medication === 'sedative', JSON.stringify(restored));
      ok('the alarm comes back', restored.alarms === 1, JSON.stringify(restored));
      ok('with the id it had, so a re-push cannot duplicate it', restored.alarmId === 55, restored.alarmId);
      ok('the reaction-time baseline comes back', restored.baseline === 265, restored.baseline);
      ok('with the circadian phase it was measured at', restored.phase === 8.25, restored.phase);
      ok('and the response speed the z-score uses', restored.speed === 3.7, restored.speed);

      // The age is a band on the account, so it is approximated — and said to be.
      ok('the age is restored from its band', restored.age === 50, restored.age);
      ok('and flagged for confirmation rather than presented as entered', restored.ageNeedsConfirming === true, restored.ageNeedsConfirming);

      await page.evaluate(() => window.__somnoStore.getState().go('F1'));
      await page.waitForTimeout(700);
      ok('the profile screen asks about it', /approximate range/.test(await text()), (await text()).slice(0, 200));
      await page.evaluate(() => window.__somnoStore.getState().setAge(48));
      await page.waitForTimeout(300);
      ok('and answering it clears the ask', (await state('ageNeedsConfirming')) === false, await state('ageNeedsConfirming'));

      /**
       * And a restore must never overwrite answers this phone already has. A device someone has
       * been using is not a blank one waiting to be filled in.
       */
      await page.evaluate(() => {
        window.__somnoStore.setState({ hasData: true, age: 33, highStress: false, bedMin: 1400 });
        window.__somnoStore.getState().applyRestoredData({
          checkIns: [],
          sleepLogs: [],
          baseline: null,
          faceBaseline: null,
          profile: { ageBand: '55-64', gender: null, medication: null, highStress: true, bedMin: 1300, wakeMin: 380, idealWake: 400, onboardingComplete: true },
          // The merged list. Which alarms belong in it is `mergeAlarms`' decision — a phone with
          // alarms of its own keeps them, and only the ones both sides share are settled by version
          // — and the store's job is to apply the answer rather than reach it again differently.
          alarms: [{ id: 55, min: 420, days: [true], smart: false, on: true, sound: '', label: 'Weekday' }],
        });
      });
      await page.waitForTimeout(500);
      const kept = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { age: s.age, highStress: s.highStress, bedMin: s.bedMin, alarms: s.alarms.length, first: s.alarms[0]?.id ?? null };
      });
      ok("a used phone keeps its own answers", kept.age === 33 && kept.bedMin === 1400, JSON.stringify(kept));
      ok('and its own stress flag', kept.highStress === false, JSON.stringify(kept));
      ok('and its own alarms', kept.alarms === 1 && kept.first === 55, JSON.stringify(kept));
    }

    {
      /**
       * 16. Deleting the last alarm, and the restore that must not undo it.
       *
       * Deletion used to be inferred from absence — the reconcile deleted every remote row whose id
       * was missing locally — which is only sound in the instant after a pull. Deleting your only
       * alarm left nothing to compare against, so the row stayed in the account and the next
       * restore handed it back. An alarm is the one record in this app that acts on its own, so
       * that is not a stale row, it is somebody woken by an alarm they threw away.
       */
      console.log('\n16. deleting the last alarm');
      const weekday = { min: 420, days: [true, true, true, true, true, false, false], smart: false, on: true, sound: '', label: 'Weekday' };
      await page.evaluate((a) => {
        window.__somnoStore.setState({ alarms: [{ ...a, id: 7001 }], deletedAlarmIds: [] });
        window.__somnoStore.getState().go('F4');
      }, weekday);
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__somnoStore.getState().openAlarm(7001));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__somnoStore.getState().deleteAlarm());
      await page.waitForTimeout(600);

      const afterDelete = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { alarms: s.alarms.length, tombstones: s.deletedAlarmIds.slice(), screen: s.screen };
      });
      ok('the last alarm goes', afterDelete.alarms === 0, JSON.stringify(afterDelete));
      ok('the deletion is recorded, not left to be inferred', afterDelete.tombstones.includes(7001), JSON.stringify(afterDelete));
      ok('and the list says so', /No alarms yet/.test(await text()), (await text()).slice(0, 160));

      // The pull can lose the race with the deletion push — offline, or simply slower. The
      // tombstone outlives the round trip, so the row coming back down changes nothing.
      await page.evaluate((a) => {
        window.__somnoStore.getState().applyRestoredData({
          checkIns: [],
          sleepLogs: [],
          baseline: null,
          faceBaseline: null,
          alarms: [{ ...a, id: 7001 }],
        });
      }, weekday);
      await page.waitForTimeout(400);
      ok('a restore cannot bring the deleted alarm back', (await page.evaluate(() => window.__somnoStore.getState().alarms.length)) === 0);

      // And it must only block that one: an account's other alarms still arrive.
      await page.evaluate((a) => {
        window.__somnoStore.getState().applyRestoredData({
          checkIns: [],
          sleepLogs: [],
          baseline: null,
          faceBaseline: null,
          alarms: [{ ...a, id: 7001 }, { ...a, id: 7002, min: 480 }],
          maxSnoozes: 2,
        });
      }, weekday);
      await page.waitForTimeout(400);
      const restored16 = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { ids: s.alarms.map((x) => x.id), maxSnoozes: s.maxSnoozes };
      });
      ok('an alarm nobody deleted still restores', restored16.ids.join() === '7002', JSON.stringify(restored16));
      /**
       * The snooze allowance was uploaded from the start and never read back, so a phone restored
       * from an account that allows one snooze quietly allowed three. It follows the same rule as
       * the rest of the profile: applied to a phone with no history of its own, never over answers
       * somebody has already given this one.
       */
      ok('a new phone takes the account’s snooze allowance', restored16.maxSnoozes === 2, JSON.stringify(restored16));

      const keptAllowance = await page.evaluate(() => {
        // A phone somebody has been using: it has a history and an allowance it chose.
        window.__somnoStore.setState({ maxSnoozes: 5, hasData: true });
        window.__somnoStore.getState().applyRestoredData({
          // A history of its own is what makes this a used phone rather than a blank one.
          checkIns: [],
          sleepLogs: [{ id: 'sl_2026-03-01', date: '2026-03-01', bedMin: 1380, wakeMin: 420, durationMin: 420, quality: 'Okay', restPct: 60, source: 'manual' }],
          baseline: null,
          faceBaseline: null,
          maxSnoozes: 1,
        });
        return window.__somnoStore.getState().maxSnoozes;
      });
      ok('but a used phone keeps its own', keptAllowance === 5, keptAllowance);

      /**
       * The legacy case: an alarm restored from a row written before `local_id` existed. Its local
       * id is derived from the row's uuid, one-way, so the address the delete used to aim at had
       * never held anything — the row survived and the alarm came back. The row's own uuid is kept
       * at restore so a deletion can name it.
       */
      await page.evaluate((a) => {
        window.__somnoStore.setState({ alarms: [], deletedAlarmIds: [], deletedAlarmRowIds: [], hasData: false });
        window.__somnoStore.getState().applyRestoredData({
          checkIns: [],
          sleepLogs: [],
          baseline: null,
          faceBaseline: null,
          alarms: [{ ...a, id: 3141592, remoteId: '0f9e8d7c-6b5a-4321-9876-543210fedcba' }],
        });
      }, weekday);
      await page.waitForTimeout(400);
      ok('the legacy alarm restores', (await page.evaluate(() => window.__somnoStore.getState().alarms.length)) === 1);

      await page.evaluate(() => window.__somnoStore.getState().openAlarm(3141592));
      await page.waitForTimeout(400);
      await page.evaluate(() => window.__somnoStore.getState().deleteAlarm());
      await page.waitForTimeout(500);
      const legacy = await page.evaluate(() => {
        const s = window.__somnoStore.getState();
        return { alarms: s.alarms.length, ids: s.deletedAlarmIds.slice(), rowIds: s.deletedAlarmRowIds.slice() };
      });
      ok('deleting the last one leaves none', legacy.alarms === 0, JSON.stringify(legacy));
      ok('and names the account row it actually came from', legacy.rowIds.includes('0f9e8d7c-6b5a-4321-9876-543210fedcba'), JSON.stringify(legacy));

      await page.evaluate((a) => {
        window.__somnoStore.getState().applyRestoredData({
          checkIns: [],
          sleepLogs: [],
          baseline: null,
          faceBaseline: null,
          alarms: [{ ...a, id: 3141592, remoteId: '0f9e8d7c-6b5a-4321-9876-543210fedcba' }],
        });
      }, weekday);
      await page.waitForTimeout(400);
      ok('so a restore cannot bring it back', (await page.evaluate(() => window.__somnoStore.getState().alarms.length)) === 0);

      /**
       * The other half, and the one a stale phone cannot work out for itself: this device did not
       * delete anything, so nothing local says the alarm is gone. The account has to say so, and
       * the device has to act on it — otherwise it keeps the alarm, pushes it back up, and the
       * handset it was deleted on is woken by it again after the next restore. `mergeAlarms` decides
       * this; what the store has to do is apply the result rather than second-guessing it.
       */
      await page.evaluate((a) => {
        window.__somnoStore.setState({
          alarms: [{ ...a, id: 8100, remoteId: 'aaaabbbb-cccc-dddd-eeee-ffff00001111' }, { ...a, id: 8200, min: 500 }],
          deletedAlarmIds: [],
          deletedAlarmRowIds: [],
        });
      }, weekday);
      await page.waitForTimeout(300);
      await page.evaluate((a) => {
        window.__somnoStore.getState().applyRestoredData({
          checkIns: [],
          sleepLogs: [],
          baseline: null,
          faceBaseline: null,
          // The merged list: 8100 tombstoned on the account and dropped, 8200 untouched.
          alarms: [{ ...a, id: 8200, min: 500 }],
        });
      }, weekday);
      await page.waitForTimeout(400);
      const afterRemote = await page.evaluate(() => window.__somnoStore.getState().alarms.map((a) => a.id));
      ok('an alarm deleted on another device comes off this one', !afterRemote.includes(8100), JSON.stringify(afterRemote));
      ok('and this device keeps the alarms nobody deleted', afterRemote.includes(8200), JSON.stringify(afterRemote));

      /**
       * And an alarm edited on the other phone arrives with its edit, through the real store: the
       * merge hands down the newer version and this device adopts it in place.
       */
      const edited = await page.evaluate((a) => {
        window.__somnoStore.setState({ alarms: [{ ...a, id: 8200, min: 500, updatedAt: 1_700_000_000_000 }] });
        window.__somnoStore.getState().applyRestoredData({
          checkIns: [],
          sleepLogs: [],
          baseline: null,
          faceBaseline: null,
          alarms: [{ ...a, id: 8200, min: 390, on: false, updatedAt: 1_700_600_000_000 }],
        });
        const s = window.__somnoStore.getState();
        return { count: s.alarms.length, min: s.alarms[0]?.min, on: s.alarms[0]?.on };
      }, weekday);
      ok("another device's alarm edit lands here", edited.min === 390, JSON.stringify(edited));
      ok('including its on/off switch', edited.on === false, JSON.stringify(edited));
      ok('and it is still one alarm', edited.count === 1, JSON.stringify(edited));

      /**
       * And the stale phone must not undo the other one's corrections. Same shape as the merge
       * tests, but through the real store: a profile the account changed more recently is applied
       * even though this device has a history of its own.
       */
      const profileRace = await page.evaluate(() => {
        window.__somnoStore.setState({ hasData: true, bedMin: 1200, highStress: false, profileUpdatedAt: 1_700_000_000_000 });
        window.__somnoStore.getState().applyRestoredData({
          checkIns: [],
          sleepLogs: [],
          baseline: null,
          faceBaseline: null,
          profile: {
            ageBand: '35-44',
            gender: null,
            medication: null,
            highStress: true,
            bedMin: 1350,
            wakeMin: 400,
            idealWake: 430,
            onboardingComplete: true,
            updatedAt: 1_700_600_000_000,
          },
        });
        const s = window.__somnoStore.getState();
        return { bedMin: s.bedMin, highStress: s.highStress, stamp: s.profileUpdatedAt };
      });
      ok('a newer profile from another device is applied', profileRace.bedMin === 1350, JSON.stringify(profileRace));
      ok('including its stress flag', profileRace.highStress === true, JSON.stringify(profileRace));
      ok('and this device adopts its version stamp', profileRace.stamp === 1_700_600_000_000, JSON.stringify(profileRace));

      const profileStale = await page.evaluate(() => {
        window.__somnoStore.setState({ hasData: true, bedMin: 1111, profileUpdatedAt: 1_800_000_000_000 });
        window.__somnoStore.getState().applyRestoredData({
          checkIns: [],
          sleepLogs: [],
          baseline: null,
          faceBaseline: null,
          profile: {
            ageBand: '35-44',
            gender: null,
            medication: null,
            highStress: true,
            bedMin: 1350,
            wakeMin: 400,
            idealWake: 430,
            onboardingComplete: true,
            updatedAt: 1_700_600_000_000,
          },
        });
        return window.__somnoStore.getState().bedMin;
      });
      ok('but an older one is refused', profileStale === 1111, profileStale);
    }

    ok('nothing threw during any of it', pageErrors.length === 0, pageErrors.join(' | '));
  } catch (e) {
    ok('the journey ran to completion', false, e && e.message);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, failed: failed.length, failures: failed, pageErrors }, null, 1));
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
})();
