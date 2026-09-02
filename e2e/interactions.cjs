/**
 * End-to-end interaction sweep.
 *
 * Drives every control in the app the way a finger does — it finds the smallest tappable element
 * containing a label and clicks its centre — then asserts the store actually changed. This is the
 * check that caught the sheet-backdrop bug: navigating while an explainer sheet was open left a
 * full-screen modal mounted with nothing visible on it, and every subsequent tap went nowhere.
 *
 * Run against the web build:
 *   npx expo start --web --port 8098
 *   node e2e/interactions.cjs
 *
 * Requires playwright and a Chromium at PLAYWRIGHT_BROWSERS_PATH.
 */
const { chromium } = require('playwright');

const results = [];
const ok = (name, pass, detail) => results.push({ name, pass, detail: detail ?? '' });

const step = async (name, fn) => {
  try { await fn(); } catch (e) { ok(name, false, String(e.message).slice(0, 80)); }
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await p.goto('http://localhost:8098/', { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(3000);

  const S = (fn) => p.evaluate(fn);
  const get = (k) => p.evaluate((key) => window.__somnoStore.getState()[key], k);
  const go = async (s) => { await p.evaluate((x) => window.__somnoStore.getState().go(x), s); await p.waitForTimeout(550); };
  const tapText = async (t, exact = true) => {
    // Tap the way a finger does: the smallest tappable element that contains the label.
    const box = await p.evaluate(({ txt, ex }) => {
      const cands = [...document.querySelectorAll('[role="button"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"]')]
        .filter((e) => (e.textContent || '').includes(txt))
        .map((e) => ({ e, r: e.getBoundingClientRect(), exact: (e.textContent || '').trim() === txt }))
        .filter(({ r }) => r.width > 0 && r.height > 0)
        // Prefer an exact-text control; otherwise the smallest one containing the label, which is
        // the innermost tappable thing a finger would hit.
        .sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || a.r.width * a.r.height - b.r.width * b.r.height);
      if (!cands.length) return null;
      const r = cands[0].r;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, { txt: t, ex: exact });
    if (!box) throw new Error('NOT_FOUND:' + t);
    await p.mouse.click(box.x, box.y);
    await p.waitForTimeout(450);
  };

  try {
  // ---------- navigation: every tab and every settings row ----------
  await go('B');
  for (const [label, expect] of [['Check-in', 'C1'], ['Recovery', 'D'], ['Trends', 'E'], ['Home', 'B']]) {
    await tapText(label);
    ok(`tab -> ${label}`, (await get('screen')) === expect, await get('screen'));
  }

  // ---------- home quick actions ----------
  await go('B');
  await tapText('Log sleep');
  ok('home -> Log sleep', (await get('screen')) === 'CLOG', await get('screen'));
  await go('B');
  await tapText('Recovery', true).catch(() => {});
  await go('B');
  await tapText('Check in now');
  ok('home -> Check in now starts a run', ['PVT', 'C1', 'SCAN'].includes(await get('screen')), await get('screen'));

  // ---------- home stat tiles ----------
  // The tiles are derived now, so where they lead depends on whether the record behind them
  // exists: with no logged night, Duration has nothing to show and sends you to log one.
  await p.evaluate(() =>
    window.__somnoStore.getState().applyRestoredData({ checkIns: [], sleepLogs: [], baseline: null, faceBaseline: null })
  );
  await go('B');
  await tapText('Duration ›');
  ok('empty Duration tile leads to logging a night', (await get('screen')) === 'CLOG', await get('screen'));

  await p.evaluate(() => {
    const s = window.__somnoStore.getState();
    s.applyRestoredData({
      checkIns: [],
      sleepLogs: [{ id: 'sl_2026-03-01', date: '2026-03-01', bedMin: 1380, wakeMin: 420, durationMin: 450, quality: 'Okay', restPct: 71, source: 'manual' }],
      baseline: null,
      faceBaseline: null,
    });
  });
  await go('B');
  ok(
    'a logged night fills the tiles with its own numbers',
    await p.evaluate(() => document.body.innerText.includes('94') || document.body.innerText.includes('71')),
    (await p.evaluate(() => document.body.innerText)).slice(0, 200)
  );
  await tapText('Duration ›');
  ok('a filled Duration tile leads to Trends', (await get('screen')) === 'E', await get('screen'));

  // ---------- trends range switch ----------
  await go('E');
  await tapText('30 days');
  ok('trends range 30', (await get('range')) === '30', String(await get('range')));
  await tapText('90 days');
  ok('trends range 90', (await get('range')) === '90', String(await get('range')));

  // ---------- check-in entry ----------
  await go('C1');
  await tapText('Full check-in');
  ok('C1 -> full check-in', (await get('screen')) === 'PVT', await get('screen'));

  // ---------- KSS rating ----------
  await go('C4');
  await tapText('7');
  ok('C4 KSS select', (await get('kss')) === 7, String(await get('kss')));

  // ---------- log sleep: bumps + quality + save ----------
  await go('CLOG');
  const bed0 = await get('logBed');
  await tapText('+15');
  ok('CLOG bump +15', (await get('logBed')) === (bed0 + 15) % 1440, `${bed0} -> ${await get('logBed')}`);
  await tapText('Solid');
  ok('CLOG quality select', (await get('logQuality')) === 'Solid', String(await get('logQuality')));
  const logs0 = (await get('sleepLogs')).length;
  await tapText('Save sleep entry');
  ok('CLOG save', (await get('sleepLogs')).length === logs0 + 1, `${logs0} -> ${(await get('sleepLogs')).length}`);

  // ---------- lessons ----------
  await go('DL');
  await tapText('Why blue light matters');
  ok('lesson open', (await get('screen')) === 'DD', await get('screen'));
  const l0 = await get('lesson');
  await tapText('Next lesson');
  ok('next lesson', (await get('lesson')) !== l0, `${l0} -> ${await get('lesson')}`);
  const msgs0 = (await get('aiMsgs')).length;
  const chip = await p.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((e) => /^(How|What|Does|Can|Is|Why)\b.*\?$/.test((e.textContent || '').trim()) && e.children.length === 0);
    return el ? el.textContent.trim() : null;
  });
  if (chip) { await tapText(chip); ok('assistant chip asks', (await get('aiMsgs')).length > msgs0, `${msgs0} -> ${(await get('aiMsgs')).length}`); }
  else ok('assistant chip asks', false, 'no chip found');

  // ---------- settings rows ----------
  await go('F0');
  for (const [label, expect] of [['Account', 'F9'], ['Profile & personal factors', 'F1'], ['Permissions', 'F2'],
                                 ['Integrations', 'F3'], ['Notifications', 'FN'], ['Data & privacy', 'F5'],
                                 ['Recalibrate baseline', 'F6'], ['How Somno works', 'F7'], ['Help & feedback', 'F8']]) {
    await go('F0');
    // Scroll the row into view rather than assuming where the list sits.
    await p.evaluate((txt) => {
      const el = [...document.querySelectorAll('[role="button"]')].find((e) => (e.textContent || '').includes(txt));
      el?.scrollIntoView({ block: 'center' });
    }, label);
    await p.waitForTimeout(250);
    try { await tapText(label); ok(`settings -> ${label}`, (await get('screen')) === expect, await get('screen')); }
    catch (e) { ok(`settings -> ${label}`, false, 'not tappable'); }
  }

  // ---------- toggles ----------
  await go('FN');
  const n0 = await get('noteM');
  await p.evaluate(() => window.__somnoStore.getState().toggleNoteMorning());
  ok('FN morning toggle', (await get('noteM')) !== n0, `${n0} -> ${await get('noteM')}`);

  // ---------- FAQ accordion ----------
  await go('F8');
  await tapText('Does the face scan work with glasses?');
  ok('FAQ expands', (await get('faq')) === 1, String(await get('faq')));

  // ---------- feedback ----------
  // Send is a real mail composer now, so the empty case is the one that can be asserted without
  // handing the browser a mailto: it must refuse rather than silently doing nothing.
  await tapText('Send');
  ok(
    'empty feedback is refused, not swallowed',
    await p.evaluate(() => document.body.innerText.includes('Write something first')),
    (await p.evaluate(() => document.body.innerText.slice(0, 0))) || ''
  );

  // ---------- permissions ----------
  await go('F2');
  const cam0 = (await get('perms')).cam;
  await p.evaluate(() => window.__somnoStore.getState().setPerm('cam'));
  ok('permission toggle', (await get('perms')).cam !== cam0, `${cam0} -> ${(await get('perms')).cam}`);

  // ---------- alarm list + edit ----------
  // The app ships with no alarms — it used to seed two from the design's mockup, one of them
  // switched on, which is how a user who set an evening alarm got woken at seven the next morning.
  // So the list starts empty and this makes one the way a user does.
  await go('F4');
  ok(
    'a fresh install has no alarms it invented',
    (await get('alarms')).length === 0 || (await p.evaluate(() => document.body.innerText.includes('No alarms yet'))),
    await get('alarms')
  );
  await tapText('Add an alarm');
  ok('add opens the editor', (await get('screen')) === 'F4E', await get('screen'));
  await p.evaluate(() => window.__somnoStore.getState().saveAlarm());
  await p.waitForTimeout(400);
  ok('saving creates one', (await get('alarms')).length === 1, await get('alarms'));

  await go('F4');
  const madeMin = (await get('alarms'))[0].min;
  const madeLabel = `${((Math.floor(madeMin / 60) % 12) || 12)}:${String(madeMin % 60).padStart(2, '0')}`;
  await tapText(madeLabel);
  ok('alarm open editor', (await get('screen')) === 'F4E', await get('screen'));
  await go('F4E');
  await tapText('Sound');
  ok('alarm -> sound picker', (await get('screen')) === 'F4S', await get('screen'));
  await go('F4S');
  // Tones come from the device's own ringtones now, and the web harness has none — so the check is
  // that the screen says so rather than offering a name it cannot play.
  ok(
    'sound picker is honest with no device tones',
    await p.evaluate(() => document.body.innerText.includes("Your device's alarm sound")),
    (await p.evaluate(() => document.body.innerText)).slice(0, 120)
  );


  // ---------- onboarding carousel ----------
  await go('A1');
  const sl0 = await get('slide');
  await tapText('Show me how');
  ok('carousel advances', (await get('slide')) === sl0 + 1, `${sl0} -> ${await get('slide')}`);

  // ---------- consent gate ----------
  await go('A2');
  const cont = await p.evaluate(() => window.__somnoStore.getState().consent);
  await p.evaluate(() => window.__somnoStore.getState().toggleConsent());
  ok('consent toggles', (await get('consent')) !== cont, `${cont} -> ${await get('consent')}`);

  // ---------- explainer sheet ----------
  await go('B');
  await p.evaluate(() => window.__somnoStore.getState().openSheet('T', 'B'));
  await p.waitForTimeout(300);
  ok('sheet opens', !!(await get('sheet')), JSON.stringify(await get('sheet')));
  await p.evaluate(() => window.__somnoStore.getState().closeSheet());
  await p.waitForTimeout(300);
  ok('sheet closes', !(await get('sheet')));

  // ---------- alarm interstitial ----------
  await go('G1');
  await tapText('Just stop the alarm');
  ok('alarm stop', (await get('screen')) === 'B', await get('screen'));


  // ---------- direct manipulation: slider, both dials, time wheels ----------
  await go('F1');
  {
    const a0 = await get('age');
    const sy = await p.evaluate(() => {
      const el = [...document.querySelectorAll('[role="slider"]')].find((e) => (e.getAttribute('aria-label') || '') === 'Age');
      if (!el) return null; const r = el.getBoundingClientRect(); return r.top + r.height / 2;
    });
    if (sy) { await p.mouse.move(110, sy); await p.mouse.down(); await p.mouse.move(300, sy, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(300); }
    ok('age slider drags', (await get('age')) !== a0, `${a0} -> ${await get('age')}`);
  }
  {
    const b0 = await get('bedMin');
    const box = await p.evaluate(() => {
      const el = [...document.querySelectorAll('[role="slider"]')].find((e) => (e.getAttribute('aria-label') || '') === 'Sleep window');
      if (!el) return null; const r = el.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: r.width / 2 };
    });
    if (box) { await p.mouse.move(box.cx, box.cy - box.r * 0.8); await p.mouse.down(); await p.mouse.move(box.cx - box.r * 0.7, box.cy - box.r * 0.4, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(300); }
    ok('sleep dial drags', (await get('bedMin')) !== b0, `${b0} -> ${await get('bedMin')}`);
  }
  await go('A9');
  {
    const a0 = await get('alarmMin');
    const box = await p.evaluate(() => {
      const el = [...document.querySelectorAll('[role="slider"]')].find((e) => (e.getAttribute('aria-label') || '') === 'Alarm time');
      if (!el) return null; const r = el.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: r.width / 2 };
    });
    if (box) { await p.mouse.move(box.cx + box.r * 0.8, box.cy); await p.mouse.down(); await p.mouse.move(box.cx, box.cy + box.r * 0.8, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(300); }
    ok('alarm dial drags', (await get('alarmMin')) !== a0, `${a0} -> ${await get('alarmMin')}`);
    const a1 = await get('alarmMin');
    await tapText('5 MIN', false).catch(() => {});
    await p.evaluate(() => window.__somnoStore.getState().alarmLater());
    ok('alarm +5 step', (await get('alarmMin')) === (a1 + 5) % 1440, `${a1} -> ${await get('alarmMin')}`);
  }
  await go('A4');
  {
    const b0 = await get('bedMin');
    await p.evaluate(() => window.__somnoStore.getState().bumpBed(1, 15));
    ok('A4 time wheel bump', (await get('bedMin')) === (b0 + 15) % 1440, `${b0} -> ${await get('bedMin')}`);
  }

  // ---------- full tap test, start to hand-off ----------
  await p.evaluate(() => window.__somnoStore.getState().startPvt(3, 'A8'));
  let taps = 0;
  for (let i = 0; i < 400; i++) {
    await p.waitForTimeout(70);
    const st = await p.evaluate(() => { const s = window.__somnoStore.getState(); return { screen: s.screen, live: s.pvtLive }; });
    if (st.screen !== 'PVT') break;
    if (st.live) { await p.evaluate(() => window.__somnoStore.getState().pvtTap()); taps++; }
  }
  ok('tap test completes', (await get('screen')) !== 'PVT' && (await get('baseline')) > 0, `${taps} taps, -> ${await get('screen')}, baseline ${await get('baseline')}`);

  // ---------- face scan runs to completion ----------
  await p.evaluate(() => window.__somnoStore.getState().startScan('A8'));
  for (let i = 0; i < 200; i++) {
    await p.waitForTimeout(60);
    if ((await get('screen')) !== 'SCAN') break;
  }
  ok('face scan completes', (await get('screen')) !== 'SCAN', `-> ${await get('screen')}`);

  // ---------- back navigation ----------
  await go('F0');
  await go('F5');
  await p.evaluate(() => window.__somnoStore.getState().back());
  await p.waitForTimeout(400);
  ok('back returns', (await get('screen')) === 'F0', await get('screen'));

  // ---------- text input ----------
  await go('AU2');
  // `authEmail`, not `email`: the sign-in form's field is deliberately not the signed-in account's
  // address, so that typing in one cannot rename the other.
  await p.evaluate(() => window.__somnoStore.getState().setAuthEmail(''));
  const inp = await p.$('input');
  if (inp) { await inp.click(); await p.keyboard.type('maya@example.com'); await p.waitForTimeout(250); }
  ok('email input accepts text', ((await get('authEmail')) || '').includes('maya@'), String(await get('authEmail')));
  ok('and does not touch the account address', !((await get('email')) || '').includes('maya@'), String(await get('email')));

  // ---------- accounts ----------
  // The web build runs with no Supabase env, which is exactly the "backend not configured" path
  // every one of these screens has to stay usable on: nothing may dead-end or throw.
  await go('AU1');
  // Apple can only work on iOS, and this harness is not iOS — so the assertion is that the button
  // is absent rather than apologetic. (On iOS it renders and reports "coming soon" from the auth
  // layer; that path is covered by the auth module's own return value, not by a tap here.)
  ok(
    'Apple is not offered where it cannot work',
    !(await p.evaluate(() => document.body.innerText.includes('Continue with Apple'))),
    (await p.evaluate(() => document.body.innerText)).slice(0, 160)
  );
  await go('AU1');
  await tapText('Continue with Google');
  ok('Google without a backend explains itself', (await get('screen')) === 'AU1', await get('screen'));
  await go('AU1');
  await tapText('Continue with email');
  ok('AU1 -> email sign-in', (await get('screen')) === 'AU2', await get('screen'));

  await go('AU2');
  await p.evaluate(() => { const s = window.__somnoStore.getState(); s.setEmail('maya@example.com'); s.setPass('hunter2hunter2'); });
  await tapText('Create account');
  ok('AU2 submit advances', (await get('screen')) === 'AU3', await get('screen'));

  // Reset is a six-digit code now, not a browser link, so it continues into the code screen with
  // the screen's purpose switched to recovery.
  await go('AU4');
  await tapText('Send reset code');
  ok('AU4 reset goes to the code screen', (await get('screen')) === 'AU3', await get('screen'));
  ok('the code screen knows it is a reset', (await get('codeMode')) === 'recovery', await get('codeMode'));
  await p.evaluate(() => '123456'.split('').forEach((k) => window.__somnoStore.getState().pressCodeKey(k)));
  await p.waitForTimeout(300);
  await tapText('Verify');
  ok('a verified code leads to a new password', (await get('screen')) === 'AU5', await get('screen'));
  await p.evaluate(() => window.__somnoStore.getState().setCodeMode('signup'));

  await go('F9');
  await p.evaluate(() => window.__somnoStore.getState().closeSheet());
  await tapText('Restore from another device');
  ok('restore row responds', !!(await get('sheet')), JSON.stringify(await get('sheet')));
  await p.evaluate(() => window.__somnoStore.getState().closeSheet());

  // Deleting an account is irreversible, so the only safe assertion is that the control now asks
  // rather than that it goes through: the sweep answers "no" to the confirmation every time.
  {
    await go('F5');
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('[role="button"]')].find((e) => (e.textContent || '').trim() === 'Delete');
      el?.scrollIntoView({ block: 'center' });
    });
    await p.waitForTimeout(250);
    await tapText('Delete');
    const sheet = await get('sheet');
    ok('delete asks before deleting', !!sheet && !!sheet.confirm, JSON.stringify(sheet));
    ok('the confirmation names the consequence', !!sheet && /cannot be undone/i.test(sheet.body || ''));
    // Cancelling must leave everything exactly where it was.
    const before = (await get('sleepLogs')).length;
    await tapText('Cancel');
    ok('cancel keeps the data', (await get('sleepLogs')).length === before && !(await get('sheet')));
  }

  // A screen with no data must say so and say why. It must never draw an invented series — a
  // week of real use read the old sample charts as the app failing to show the user's own data,
  // which is exactly the reading a plausible-looking fake invites.
  {
    await p.evaluate(() =>
      window.__somnoStore.getState().applyRestoredData({ checkIns: [], sleepLogs: [], baseline: null, faceBaseline: null })
    );
    await go('E');
    await p.waitForTimeout(400);
    const trends = await p.evaluate(() => document.body.innerText);
    ok(
      'empty trends explain what would fill them',
      /your first reading appears here/i.test(trends) && /first tap test plots here/i.test(trends),
      trends.slice(0, 300)
    );
    ok('empty trends draw no invented series', !/SAMPLE/i.test(trends));
    // "Average NaN" was on this screen for every new user: an empty history divided by zero and
    // React rendered the result verbatim.
    ok('and no broken value reaches the screen', !/\bNaN\b|\bundefined\b|\bInfinity\b/.test(trends), trends.slice(0, 300));

    await go('D');
    await p.waitForTimeout(400);
    const recovery = await p.evaluate(() => document.body.innerText);
    ok(
      'an unmeasured sleep debt is a dash, not a number',
      /Debt by stage[\s\S]{0,40}—/.test(recovery),
      recovery.slice(0, 300)
    );
    ok(
      'and says there is nothing yet to estimate it from',
      /nothing to\s+estimate\s+it from/i.test(recovery),
      recovery.slice(0, 300)
    );
    ok('no invented debt figure is labelled an example', !/example figures/i.test(recovery));
  }

  // A brand-new install has measured nothing and must say so, in the largest type on the screen.
  {
    await p.evaluate(() => {
      window.__somnoStore.setState({ checkIns: [], sleepLogs: [], sdi: 0, delta: 0, signals: 0 });
    });
    await go('B');
    await p.waitForTimeout(400);
    const home = await p.evaluate(() => document.body.innerText);
    ok('an unmeasured SDI is a dash, not a number', /SDI\s*—/.test(home), home.slice(0, 300));
    ok('and no comparison is claimed against a week that does not exist', !/vs your weekly average/.test(home));
    ok('it says what would produce a reading', /Check in and your first reading appears here/i.test(home));
  }

  // The alarm screen is a clock. It used to show a fixed date from the design mockup and a time
  // taken from the alarm dial rather than from the device.
  {
    await p.evaluate(() => window.__somnoStore.getState().beginAlarmSession());
    ok('a firing opens the alarm screen', (await get('screen')) === 'G1', await get('screen'));
    ok('and begins a fresh event with no snoozes carried over', (await get('snoozes')) === 0, await get('snoozes'));
    const alarmText = await p.evaluate(() => document.body.innerText);
    ok('the date is not the mockup\'s', !/SUNDAY, 9 AUGUST/.test(alarmText), alarmText.slice(0, 200));
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    ok('it is today', alarmText.includes(today), `${alarmText.slice(0, 200)} | want ${today}`);
    const nowHM = (() => {
      const d = new Date();
      const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
      return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
    })();
    ok('and the clock is the device clock', alarmText.includes(nowHM), `${alarmText.slice(0, 200)} | want ${nowHM}`);
    await p.evaluate(() => window.__somnoStore.getState().stopAlarm('manual_stop'));
  }

  /**
   * A snooze that could not be armed must not be reported as one that was.
   *
   * There is no native module in this harness, so every snooze here is an unarmed one. It has to be
   * a snooze on a *real* alarm to be worth warning about — with no alarm behind it (id -1, the
   * in-app preview) there is nothing that was ever going to ring, and warning about that would be
   * noise on a demo.
   *
   * The warning used to be a line on the alarm screen keyed off `snoozeArmed` being false. That
   * stopped being sound once the flag was cleared correctly when a snooze re-fires, since "nothing
   * is armed" then also describes the ordinary case of a snooze that already rang. It is now said
   * once, at the only moment the two are distinguishable.
   */
  {
    await p.evaluate(() => {
      window.__somnoStore.setState({
        alarms: [{ id: 1, min: 420, days: [true, true, true, true, true, true, true], smart: true, on: true, sound: '', label: 'Test' }],
        alarmEvents: [],
        snoozes: 0,
      });
      window.__somnoStore.getState().beginAlarmSession(1);
    });
    await p.evaluate(() => window.__somnoStore.getState().snooze());
    await p.waitForTimeout(400);
    ok('a snooze is counted', (await get('snoozes')) === 1, await get('snoozes'));
    ok('and reports honestly that nothing was armed', (await get('snoozeArmed')) === false, await get('snoozeArmed'));
    const sheet = JSON.stringify(await get('sheet'));
    ok('the user is told nothing will wake them again', /will not ring/i.test(sheet), sheet.slice(0, 260));
    await p.evaluate(() => window.__somnoStore.getState().stopAlarm('manual_stop'));

    // And the ordinary re-fire says no such thing: a snooze that rang is not a snooze that failed.
    await p.evaluate(() => {
      window.__somnoStore.setState({ alarmEvents: [], snoozes: 0, sheet: null });
      const s = window.__somnoStore.getState();
      s.beginAlarmSession(1);
      s.snooze();
    });
    await p.evaluate(() => {
      // The snooze fires: the same session, resumed. `snoozeArmed` has to come back down with it.
      window.__somnoStore.setState({ snoozeArmed: true, sheet: null });
      window.__somnoStore.getState().beginAlarmSession(1);
    });
    await p.waitForTimeout(400);
    ok('a re-fire keeps the snooze count', (await get('snoozes')) === 1, await get('snoozes'));
    ok('and no longer claims a ring is pending', (await get('snoozeArmed')) === false, await get('snoozeArmed'));
    const reFire = await p.evaluate(() => document.body.innerText);
    ok('nor tells the user their alarm failed', !/will not ring|could not arm/i.test(reFire), reFire.slice(0, 260));
    await p.evaluate(() => window.__somnoStore.getState().stopAlarm('manual_stop'));
  }

  // No control may be inert. Two settings toggles shipped hard-wired to `true` with empty handlers:
  // they looked on, they could be tapped, and nothing behind them existed. Rather than trusting
  // aria state, this clicks each switch with the mouse and asserts the *store* moved — a switch
  // whose only effect is on itself is exactly the thing being ruled out.
  {
    // `alarms` is in here because F4's per-alarm on/off switches live on that array, not on a
    // scalar setting — leaving it out made a working switch look inert.
    const SETTINGS_KEYS = ['noteM', 'noteW', 'noteK', 'noteR', 'vibrate', 'scanOptimize', 'smartWake', 'highStress', 'alarms'];
    const snapshot = () => p.evaluate((keys) => {
      const st = window.__somnoStore.getState();
      return keys.map((k) => JSON.stringify(st[k])).join('|');
    }, SETTINGS_KEYS);

    for (const screen of ['FN', 'F4', 'F4S', 'F1']) {
      await go(screen);
      const count = await p.evaluate(() => document.querySelectorAll('[role="switch"]').length);
      const inert = [];
      for (let i = 0; i < count; i++) {
        const before = await snapshot();
        const box = await p.evaluate((idx) => {
          const sw = [...document.querySelectorAll('[role="switch"]')][idx];
          if (!sw) return null;
          sw.scrollIntoView({ block: 'center' });
          const r = sw.getBoundingClientRect();
          return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
        }, i);
        if (!box) { inert.push(`${i}:hidden`); continue; }
        await p.mouse.click(box.x, box.y);
        await p.waitForTimeout(350);
        if ((await snapshot()) === before) inert.push(String(i));
      }
      ok(`every switch on ${screen} changes something`, inert.length === 0 && count > 0, `inert: ${inert.join(',')} of ${count}`);
    }
  }

  // The notifications screen used to promise quiet hours "between 10:45pm and your alarm" — a
  // hardcoded time, and a rule with no implementation anywhere behind it.
  {
    await go('FN');
    const t = await p.evaluate(() => document.body.innerText);
    ok('no invented quiet-hours promise', !/10:45/.test(t), t.slice(0, 300));
    ok('what it says about timing is derived from the schedule', /an hour before your bedtime/i.test(t), t.slice(0, 300));
  }

  // Sleep debt has to be the accumulation, not last night's shortfall. The old model gave the same
  // figure for one bad night and for a week of them, which is the one thing the word cannot mean.
  {
    const dayKey = (back) => {
      const d = new Date();
      d.setDate(d.getDate() - back);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const nights = (hours, n) =>
      Array.from({ length: n }, (_, i) => {
        const date = dayKey(n - i);
        return { id: `sl_${date}`, date, bedMin: 1380, wakeMin: 300, durationMin: hours * 60, quality: 'Okay', restPct: 60, source: 'manual' };
      });

    const debtFor = async (logs) => {
      await p.evaluate((l) => {
        window.__somnoStore.getState().applyRestoredData({ checkIns: [], sleepLogs: l, baseline: null, faceBaseline: null });
      }, logs);
      await p.waitForTimeout(250);
      return p.evaluate(() => window.__somnoStore.getState().todayDebt().compositeDebtHours);
    };

    const one = await debtFor(nights(5, 1));
    const week = await debtFor(nights(5, 7));
    ok('one short night owes something', one > 0, one);
    ok('a week of the same night owes distinctly more', week > one * 2, `${one} -> ${week}`);

    const rested = await debtFor(nights(8, 10));
    ok('nights at need owe nothing', rested === 0, rested);

    // Nobody's debt may run away with the arithmetic.
    const twoMonths = await debtFor(nights(4, 60));
    ok('two months of four-hour nights stays a meaningful number', twoMonths > 10 && twoMonths <= 24, twoMonths);

    // And the screen has to explain what it measured against, rather than printing hours alone.
    await debtFor(nights(5, 7));
    await go('D');
    await p.waitForTimeout(400);
    const rec = await p.evaluate(() => document.body.innerText);
    ok('the Recovery screen names the target the debt is estimated against', /against a [\d.]+ h target/i.test(rec), rec.slice(0, 400));
    ok('and says how many nights are behind it', /Estimated across 7 nights/i.test(rec), rec.slice(0, 400));
    ok('no hardcoded plateau claim', !/recovery has plateaued/i.test(rec));
    ok('a run of short nights is named as a run', /run of short nights/i.test(rec), rec.slice(0, 500));
  }

  // A restore replaces local history and re-derives the headline figures from it — the store half
  // of sync, checked here because the network half cannot run in this harness.
  {
    const before = await get('sdi');
    await p.evaluate(() => {
      const ts = Date.now() - 3600_000;
      window.__somnoStore.getState().applyRestoredData({
        checkIns: [{ id: `ci_${ts}`, timestamp: ts, triggerType: 'manual', pvt: null, face: null, kss: 5, sdi: 41, confidence: 'low', signalsUsed: 1 }],
        sleepLogs: [{ id: 'sl_2026-03-01', date: '2026-03-01', bedMin: 1380, wakeMin: 420, durationMin: 420, quality: 'Okay', restPct: 60, source: 'manual' }],
        baseline: { pvtMeanRt: 297, pvtStdRt: 31, createdAt: Date.now() },
      });
    });
    await p.waitForTimeout(300);
    ok('restore replaces history', (await get('checkIns')).length === 1 && (await get('sleepLogs')).length === 1);
    ok('restore re-derives the score', (await get('sdi')) === 41, `${before} -> ${await get('sdi')}`);
    ok('restore adopts the account baseline', (await get('baseline')) === 297, String(await get('baseline')));
    // A restored account has a baseline, so signing in must land on Home rather than restart setup.
    await p.evaluate(() => window.__somnoStore.getState().completeSignIn());
    await p.waitForTimeout(400);
    ok('sign-in lands a returning account on Home', (await get('screen')) === 'B', await get('screen'));
  }


  // ---------- the day-ahead prediction ----------
  await go('B');
  ok(
    'Home predicts the day ahead',
    await p.evaluate(() => document.body.innerText.includes('Your day ahead') && /Sharpest \d/.test(document.body.innerText)),
    (await p.evaluate(() => document.body.innerText)).slice(0, 200)
  );

  // ---------- the profile choices that feed the recovery engine ----------
  await go('F1');
  // The chips sit below the fold on this screen, so scroll each into view the way a thumb would
  // before tapping it.
  const tapAfterScroll = async (label) => {
    await p.evaluate((txt) => {
      const el = [...document.querySelectorAll('[role="button"]')].find((e) => (e.textContent || '').trim() === txt);
      el?.scrollIntoView({ block: 'center' });
    }, label);
    await p.waitForTimeout(300);
    await tapText(label);
  };
  await tapAfterScroll('Female');
  ok('gender is recorded', (await get('gender')) === 'female', await get('gender'));
  await tapAfterScroll('Male');
  ok('and can be changed', (await get('gender')) === 'male', await get('gender'));
  await tapAfterScroll('Sleep aid');
  ok('medication is a category, not a yes/no', (await get('medication')) === 'sedative', await get('medication'));
  await tapAfterScroll('Antidepressant');
  ok('and the categories are distinct', (await get('medication')) === 'antidepressant', await get('medication'));

  // ---------- settings values are derived, not fixed ----------
  await go('F0');
  ok(
    'the permissions row counts real permissions',
    await p.evaluate(() => /\d of \d/.test(document.body.innerText)),
    (await p.evaluate(() => document.body.innerText)).slice(0, 160)
  );

  // ---------- the alarm: the safety rule the whole feature rests on ----------
  {
    await p.evaluate(() => window.__somnoStore.getState().startAlarmDemo());
    await p.waitForTimeout(500);
    ok('the alarm opens its screen', (await get('screen')) === 'G1', await get('screen'));
    ok('and files an event the moment it fires', (await get('alarmEvents')).length > 0);

    const max = await get('maxSnoozes');
    for (let i = 0; i < max; i++) {
      await p.evaluate(() => window.__somnoStore.getState().snooze());
      await p.waitForTimeout(120);
    }
    ok('snoozes are counted', (await get('snoozes')) === max, `${await get('snoozes')} of ${max}`);
    await go('G3');
    ok(
      'at the cap the screen offers a way out rather than another snooze',
      await p.evaluate(() => !/Snooze \d+ minutes/.test(document.body.innerText)),
      (await p.evaluate(() => document.body.innerText)).slice(0, 200)
    );
    await tapText('Just stop the alarm');
    ok('stopping always works', (await get('screen')) === 'B', await get('screen'));
    const events = await get('alarmEvents');
    const last = events[events.length - 1];
    ok('and the event records how it ended', !!last.dismissedAt && last.dismissMethod === 'manual_stop', JSON.stringify(last));
  }

  // ---------- the new-password screen guards itself ----------
  await go('AU5');
  await tapText('Save password');
  ok('an empty new password cannot be submitted', (await get('screen')) === 'AU5', await get('screen'));

  } catch (e) { ok('sweep aborted', false, String(e.message).slice(0,90)); }
  console.log(JSON.stringify({ results, errs: [...new Set(errs)] }, null, 1));
  await b.close();
})();
