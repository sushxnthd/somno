/**
 * Two whole-app sweeps that nothing else performs: text the layout cuts off, and values that
 * arrived on screen broken.
 *
 * A user reported text being cut off, and nothing in the suite could have seen it. Both existing
 * harnesses read `document.body.innerText`, which returns the whole string whether or not a single
 * pixel of it is on screen — a heading clipped to half its height reads identically to one that
 * fits. Clipping is a property of the box, so the box is what this measures.
 *
 * It runs at three viewports and two font scales, because the default 390x844 hides the problem:
 * a fixed-height row that fits a 13px caption on a Pixel is short by two lines on a small phone
 * with the system font turned up, which is exactly the combination a tired user is likely to have.
 *
 *   npx expo start --web --port 8098
 *   node e2e/clipping.cjs
 */
const { chromium } = require('playwright');

/** Every screen, addressed the way the app addresses them. */
const SCREENS = [
  'AU1', 'AU2', 'AU3', 'AU4', 'AU5',
  'A1', 'A2', 'A3', 'A4', 'A5', 'PVT', 'SCAN', 'SCANERR', 'A8', 'A9',
  'B', 'C1', 'C4', 'C5', 'CLOG',
  'D', 'DL', 'DD', 'E',
  'F0', 'F1', 'F2', 'F3', 'F4', 'F4E', 'F4S', 'F5', 'F6', 'F7', 'F8', 'FN', 'F9', 'W1',
  'G1', 'G3',
];

/**
 * The shapes to check.
 *
 * 360x640 is the small end of Android and the one that finds fixed heights; 412x915 is a large
 * modern phone; 390x844 is the design's own canvas. The font scale is applied as a root font-size
 * multiplier, which is how react-native-web surfaces `allowFontScaling`.
 */
const SHAPES = [
  { name: '360x640', width: 360, height: 640, fontScale: 1 },
  { name: '390x844', width: 390, height: 844, fontScale: 1 },
  { name: '412x915', width: 412, height: 915, fontScale: 1 },
  { name: '360x640 @1.3x', width: 360, height: 640, fontScale: 1.3 },
  { name: '390x844 @1.3x', width: 390, height: 844, fontScale: 1.3 },
];

const findings = [];
const broken = [];

/**
 * Values that should never reach a user.
 *
 * `Math.round(NaN)` is `NaN`, and React renders that as the four characters "NaN" without
 * complaint — which is how the Trends screen came to greet a new user with "Average NaN". The same
 * goes for a stray `undefined`, an `Infinity` from a divide by zero, and the string "null". These
 * only appear when a screen is asked to describe data it does not have, so the sweep runs twice:
 * once with a populated history and once with none at all.
 */
const BROKEN_VALUE = /\b(NaN|Infinity|undefined|\[object Object\])\b/;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

  for (const shape of SHAPES) {
    const context = await browser.newContext({ viewport: { width: shape.width, height: shape.height } });
    const page = await context.newPage();
    await page.goto('http://localhost:8098/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    if (shape.fontScale !== 1) {
      await page.addStyleTag({
        content: `html { font-size: ${16 * shape.fontScale}px; }
                  [data-testid], div, span, p { --somno-font-scale: ${shape.fontScale}; }`,
      });
      // react-native-web writes px font sizes inline, so scale them directly.
      await page.evaluate((scale) => {
        for (const el of document.querySelectorAll('*')) {
          const fs = getComputedStyle(el).fontSize;
          const px = parseFloat(fs);
          if (px > 0) el.style.fontSize = `${px * scale}px`;
        }
      }, shape.fontScale);
    }

    // Seed enough history that the data-bearing screens render their populated state, which is
    // where the long strings are. The empty pass below is where the broken values show up.
    const seedHistory = () => page.evaluate(() => {
      const key = (back) => {
        const d = new Date();
        d.setDate(d.getDate() - back);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      const s = window.__somnoStore.getState();
      s.applyRestoredData({
        checkIns: Array.from({ length: 8 }, (_, i) => ({
          id: `ci_${Date.now() - i * 86400000}`,
          timestamp: Date.now() - i * 86400000,
          triggerType: 'manual',
          pvt: null,
          face: null,
          kss: 5,
          sdi: 50 + i,
          confidence: 'medium',
          signalsUsed: 2,
        })).reverse(),
        sleepLogs: Array.from({ length: 8 }, (_, i) => ({
          id: `sl_${key(8 - i)}`,
          date: key(8 - i),
          bedMin: 1380,
          wakeMin: 400,
          durationMin: 340,
          quality: 'Okay',
          restPct: 62,
          source: 'manual',
        })),
        baseline: { pvtMeanRt: 300, pvtStdRt: 35, createdAt: Date.now() - 5 * 86400000 },
        faceBaseline: null,
      });
      window.__somnoStore.setState({
        alarms: [{ id: 1, min: 420, days: [true, true, true, true, true, false, false], smart: true, on: true, sound: '', label: 'Wake up' }],
      });
    });

    const clearHistory = () =>
      page.evaluate(() => {
        window.__somnoStore.getState().applyRestoredData({ checkIns: [], sleepLogs: [], baseline: null, faceBaseline: null });
        window.__somnoStore.setState({ alarms: [], sdi: 0, delta: 0, signals: 0, lastFaceMetrics: null, pvtTimes: [] });
      });

    for (const withData of [true, false]) {
      if (withData) await seedHistory();
      else await clearHistory();
      await page.waitForTimeout(300);

    for (const id of SCREENS) {
      await page.evaluate((s) => window.__somnoStore.getState().go(s), id);
      await page.waitForTimeout(420);

      const clipped = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('*')) {
          const t = (el.textContent || '').trim();
          if (!t || el.children.length) continue; // leaf text only
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          if (parseFloat(style.opacity) === 0) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;

          // Truncation the design asked for, with an ellipsis, is not a defect.
          const clamped = style.webkitLineClamp && style.webkitLineClamp !== 'none';
          const ellipsised = style.textOverflow === 'ellipsis';
          if (clamped || ellipsised) continue;

          // Is the text taller or wider than the box that is allowed to show it?
          const scrolls = style.overflow !== 'visible' || style.overflowY !== 'visible' || style.overflowX !== 'visible';
          const tallerThanBox = el.scrollHeight > el.clientHeight + 2;
          const widerThanBox = el.scrollWidth > el.clientWidth + 2;
          if (scrolls && (tallerThanBox || widerThanBox)) {
            out.push({ text: t.slice(0, 70), box: `${el.clientWidth}x${el.clientHeight}`, content: `${el.scrollWidth}x${el.scrollHeight}` });
            continue;
          }

          // Or pushed off the bottom of the viewport by a container that cannot scroll.
          let scrollableAncestor = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const ps = getComputedStyle(p);
            if (ps.overflowY === 'auto' || ps.overflowY === 'scroll' || p.scrollHeight > p.clientHeight + 4) {
              scrollableAncestor = true;
              break;
            }
          }
          if (!scrollableAncestor && r.bottom > window.innerHeight + 1) {
            out.push({ text: t.slice(0, 70), box: 'below the fold', content: `bottom ${Math.round(r.bottom)} > ${window.innerHeight}` });
          }
        }
        return out;
      });

      if (clipped.length) findings.push({ shape: shape.name, screen: id, clipped, withData });

      // The second sweep: anything that reached the screen as a broken value.
      const badValues = await page.evaluate((pattern) => {
        const re = new RegExp(pattern);
        const out = [];
        for (const el of document.querySelectorAll('*')) {
          if (el.children.length) continue;
          const t = (el.textContent || '').trim();
          if (!t) continue;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          if (re.test(t)) out.push(t.slice(0, 80));
        }
        return out;
      }, BROKEN_VALUE.source);
      if (badValues.length) broken.push({ shape: shape.name, screen: id, withData, values: [...new Set(badValues)] });
    }
    }

    await context.close();
  }

  await browser.close();

  const bySeverity = findings.sort((a, b) => b.clipped.length - a.clipped.length);
  console.log(
    JSON.stringify(
      { shapes: SHAPES.length, screens: SCREENS.length, findings: bySeverity, brokenValues: broken },
      null,
      1
    )
  );
  process.exit(findings.length === 0 && broken.length === 0 ? 0 : 1);
})();
