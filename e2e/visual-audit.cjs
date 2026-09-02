/**
 * Visual regression against the design prototype.
 *
 * Captures the same screen from the Claude Design prototype and from the app's web build, and
 * reports the mean per-pixel difference. This is the check that took the port from "resembles the
 * design" to pixel-accurate, and it is worth keeping runnable because every later change to a
 * screen is a chance to drift away from it again.
 *
 *   node e2e/visual-audit.cjs                 # every screen
 *   node e2e/visual-audit.cjs B E F0          # only these
 *
 * Needs both servers up:
 *   npx expo start --web --port 8098
 *   npx http-server ../project -p 8099 --silent
 *
 * The prototype's runtime pulls React and Babel from unpkg, which the sandbox blocks, so those
 * three files are vendored under project/_vendor and support.js points at them.
 *
 * Screens the app deliberately no longer matches are listed in INTENTIONAL below, with the reason.
 * A screen that drifts without being on that list is a regression.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = process.env.AUDIT_OUT || '/tmp/somno-audit';
const APP = 'http://localhost:8098/';
const PROTO = 'http://localhost:8099/Somno%20Prototype.dc.html';
const FONT_DIR = path.resolve(__dirname, '../../project/_fonts');

/** Every screen in the app, paired with the prototype's id for it. */
const SCREENS = [
  'SPLASH', 'AU1', 'AU2', 'AU3', 'AU4',
  'A1', 'A2', 'A3', 'A4', 'A5', 'PVT', 'SCAN', 'SCANERR', 'A8', 'A9',
  'B', 'C1', 'C4', 'C5', 'CLOG',
  'D', 'DL', 'DD', 'E',
  'F0', 'F1', 'F2', 'F3', 'F4', 'F4E', 'F4S', 'F5', 'F6', 'F7', 'F8', 'FN', 'F9',
  'W1', 'G1', 'G3',
];

/**
 * Screens that have deliberately diverged, and why. Each of these was a place where the design
 * showed a number, a toggle or a screen that nothing behind it could actually produce.
 */
const INTENTIONAL = {
  F7: 'the intro counts the SDI\'s four inputs rather than three — the design left out accumulated sleep debt, which carries the second-largest weight in the fusion',
  CLOG: 'the entry is seeded from the user\'s own schedule rather than the mockup\'s 23:52 / 06:41, and the screen now names the night it is recording instead of leaving it to be guessed',
  D: 'the debt figure is marked as an example until a night is logged, the trend carries a today marker, and the calendar button is a reminder now',
  AU1: 'Apple is hidden off iOS where it can never work, and the legal links are real links now',
  B: 'stat tiles, streak, insight and hypnogram are derived from records now; empty on a fresh device',
  E: 'sample markers, real axis dates, real debt series, the screen-time card removed, and two analyses the design has no equivalent for: sleep regularity and what the user\'s own mornings follow',
  W1: 'the week is the real one, so an empty device shows an empty week',
  F2: 'the fabricated screen-time permission card is gone; health says "later" instead of toggling',
  F3: 'health sync is an honest "not in this version"; the calendar integration is gone entirely',
  F5: 'the privacy row opens the published policy rather than a summary sheet',
  F9: 'the account card shows the real account (or none); the Plus upsell is gone with the paywall',
  DD: 'the free-text "assistant" input is gone; the prepared questions remain',
  F4S: 'the sound list comes from the device, and the web harness has no ringtones',
  F4: 'the mockup\'s two seeded alarms are gone, so a fresh device shows the empty state; "Escalate volume" is a statement rather than a Toggle wired to nothing; and the snooze-length row now names what happens when it is off',
  A4: 'gender and medication category replace a toggle that fed the engine the wrong factor',
  F1: 'same profile fields as A4, plus a chronotype line computed from the user’s own answers',
  C5: 'the face-scan row reports the eyelid measurement, the sleep-debt row is the real figure rather than a fixed string, and the four icons are the app\'s stroke set rather than typographic glyphs',
};

const FONT_CSS = () => {
  const face = (family, file, weight) => {
    const data = fs.readFileSync(path.join(FONT_DIR, file)).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(data:font/ttf;base64,${data}) format('truetype');}`;
  };
  return [
    face('Figtree', 'Figtree_300Light.ttf', 300),
    face('Figtree', 'Figtree_400Regular.ttf', 400),
    face('Figtree', 'Figtree_500Medium.ttf', 500),
    face('Figtree', 'Figtree_600SemiBold.ttf', 600),
    face('Figtree', 'Figtree_700Bold.ttf', 700),
    face('Instrument Serif', 'InstrumentSerif_400Regular.ttf', 400),
  ].join('\n');
};

/**
 * Reaches the prototype's React class instance through its own fiber tree.
 *
 * The prototype is a single class component rendered by the Claude Design runtime, which exposes
 * no handle to it. The search walks *down* from the container fiber rather than up from a DOM
 * node: the first class instance above any element is the runtime's own error boundary, and the
 * component that owns `screen` sits below it.
 */
const PROTO_DRIVER = `
window.__proto = (function () {
  const root = [...document.querySelectorAll('*')].find((el) =>
    Object.keys(el).some((k) => k.startsWith('__reactContainer$'))
  );
  if (!root) return null;
  const containerKey = Object.keys(root).find((k) => k.startsWith('__reactContainer$'));
  const stack = [root[containerKey]];
  const seen = new Set();
  while (stack.length) {
    const fiber = stack.pop();
    if (!fiber || seen.has(fiber)) continue;
    seen.add(fiber);
    const host = fiber.stateNode;
    // The runtime's wrapper keeps the author's class on .logic, and that is the object holding
    // state.screen. Its setState re-renders the template, which is what drives navigation.
    if (host && host.logic && host.logic.state && 'screen' in host.logic.state) return host.logic;
    if (fiber.child) stack.push(fiber.child);
    if (fiber.sibling) stack.push(fiber.sibling);
  }
  return null;
})();
`;

/**
 * Finds the prototype's phone frame.
 *
 * The design renders a 390x844 device mock inside a much larger preview canvas, so a plain
 * screenshot captures the desk it is sitting on. Everything is measured inside that frame — it is
 * the one element whose size matches the app's viewport exactly.
 */
/**
 * Both sides are compared as full 390x844 screens.
 *
 * The design's device mock draws its own status bar strip at the top; the app reserves the same
 * band through its safe-area inset, so content lands in the same place on both and no offset
 * correction is needed. (Measured, not assumed: shifting either side by the strip's height makes
 * every screen's difference worse.)
 */
const SCREEN_W = 390;
const SCREEN_H = 844;

const FIND_FRAME = () => {
  const el = [...document.querySelectorAll('div')].find((e) => {
    const r = e.getBoundingClientRect();
    // Literals, not the constants above: this function is serialised into the page, where the
    // module's scope does not exist.
    return Math.round(r.width) === 390 && Math.round(r.height) === 844;
  });
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: 390, height: 844 };
};

async function capture(page, screens, setScreen, prefix, clipToFrame = false) {
  const shots = {};
  for (const id of screens) {
    try {
      await setScreen(page, id);
      await page.waitForTimeout(900);
      const file = path.join(OUT, `${prefix}-${id}.png`);
      if (clipToFrame) {
        const box = await page.evaluate(FIND_FRAME);
        if (!box) throw new Error('phone frame not found');
        await page.screenshot({ path: file, clip: box });
      } else {
        await page.screenshot({ path: file });
      }
      shots[id] = file;
    } catch (e) {
      shots[id] = null;
      console.error(`  ! ${prefix} ${id}: ${e.message.slice(0, 80)}`);
    }
  }
  return shots;
}

const DIFF_PY = `
import sys, json
from PIL import Image, ImageChops
a = Image.open(sys.argv[1]).convert('RGB')
b = Image.open(sys.argv[2]).convert('RGB')
if a.size != b.size:
    b = b.resize(a.size)
diff = ImageChops.difference(a, b)
pixels = list(diff.getdata())
n = len(pixels) * 3
total = sum(p[0] + p[1] + p[2] for p in pixels)
# share of pixels that differ by more than a just-noticeable amount in any channel
strong = sum(1 for p in pixels if max(p) > 24)
print(json.dumps({'mean': round(total / n / 255 * 100, 2), 'strong': round(strong / len(pixels) * 100, 2)}))
`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const screens = only.length ? only : SCREENS;

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const fontCss = FONT_CSS();

  const proto = await browser.newPage({ viewport: { width: 1120, height: 940 } });
  await proto.goto(PROTO, { waitUntil: 'networkidle', timeout: 60000 });

  // The runtime fetches Babel and re-executes, which tears down the execution context at least
  // once. Retry until the instance is reachable rather than racing it.
  let driverOk = false;
  for (let attempt = 0; attempt < 15 && !driverOk; attempt++) {
    await proto.waitForTimeout(2000);
    // The injection itself often throws "execution context destroyed" while still having run —
    // the runtime tears the context down right after Babel lands. So the two steps are separate,
    // and only the check is trusted.
    try {
      await proto.evaluate(PROTO_DRIVER);
    } catch {
      /* injected or not; the check below decides */
    }
    try {
      driverOk = await proto.evaluate(() => !!window.__proto);
    } catch {
      driverOk = false;
    }
  }
  if (!driverOk) {
    console.error('could not reach the prototype component instance');
    process.exit(2);
  }
  await proto.addStyleTag({ content: fontCss });
  await proto.evaluate(() => document.fonts && document.fonts.ready);
  await proto.waitForTimeout(1200);

  const app = await browser.newPage({ viewport: { width: SCREEN_W, height: SCREEN_H } });
  await app.goto(APP, { waitUntil: 'networkidle', timeout: 60000 });
  await app.waitForTimeout(3000);

  console.log('capturing prototype…');
  const protoShots = await capture(
    proto,
    screens,
    async (page, id) => {
      await page.evaluate((s) => {
        window.__proto.clearTimers && window.__proto.clearTimers();
        window.__proto.setState({ screen: s });
      }, id);
    },
    'proto',
    true
  );

  console.log('capturing app…');
  const appShots = await capture(
    app,
    screens,
    async (page, id) => {
      await page.evaluate((s) => window.__somnoStore.getState().go(s), id);
    },
    'app'
  );

  const results = [];
  for (const id of screens) {
    if (!protoShots[id] || !appShots[id]) {
      results.push({ id, error: 'capture failed' });
      continue;
    }
    const out = execFileSync('python3', ['-c', DIFF_PY, protoShots[id], appShots[id]]).toString();
    const { mean, strong } = JSON.parse(out);
    results.push({ id, mean, strong, intentional: INTENTIONAL[id] });
  }

  results.sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0));
  const regressions = results.filter((r) => !r.intentional && (r.error || r.mean > 6));
  console.log(JSON.stringify({ results, regressions: regressions.map((r) => r.id), out: OUT }, null, 1));
  await browser.close();
  process.exit(regressions.length ? 1 : 0);
})();
