import { readdirSync, readFileSync } from 'node:fs';

/**
 * Layout rules checked against the source, because no browser-based harness can check them.
 *
 * Everything else in this repo that looks at the UI runs on react-native-web: the interaction
 * sweep, the journey walk and the pixel diff all drive a Chromium. That is a real coverage gap, and
 * a user found it — text was being cut off on an Android phone while three green harnesses saw
 * nothing wrong, because the specific way Android lays out text is the one thing web does not
 * reproduce.
 *
 * These are cheap, exact, whole-codebase checks for the differences that matter.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

/** Every component, screen and theme file. */
function sourceFiles(): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push({ path: full, source: readFileSync(full, 'utf8') });
    }
  };
  for (const root of ['src/components', 'src/screens', 'src/theme']) walk(root);
  return out;
}

const files = sourceFiles();

{
  console.log('no text is set in a box too short to hold it');
  /**
   * Android clips `Text` to its line box. CSS lets a tall glyph overflow one and draws it anyway.
   *
   * So `fontSize: 88, lineHeight: 88` — which is the honest transcription of the design's
   * `font: 700 88px/1` — renders perfectly in every browser check this repo has, and cuts the top
   * and bottom off the digit on a phone. Nine styles were written that way, and they were the nine
   * largest numbers in the app: the Sleep Deprivation Index, the alarm clock, the check-in score, the
   * weekly average, the recommended bedtime, and the readouts on all three dials.
   *
   * `displayNumeral` in theme/tokens.ts is the fix — no explicit line height, so the platform uses
   * the font's own ascent and descent, plus `includeFontPadding: false` so Android does not pad it
   * back out and lose the design's tight metrics.
   */
  const offenders: string[] = [];
  for (const { path, source } of files) {
    for (const block of source.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
      const body = block[2];
      const fontSize = /fontSize:\s*([\d.]+)/.exec(body);
      const lineHeight = /lineHeight:\s*([\d.]+)/.exec(body);
      if (!fontSize || !lineHeight) continue;
      const fs = Number(fontSize[1]);
      const lh = Number(lineHeight[1]);
      // 1.02 rather than 1.0, so a rounding artefact is not reported as a defect.
      if (lh <= fs * 1.02) offenders.push(`${path} → ${block[1]} (fontSize ${fs}, lineHeight ${lh})`);
    }
  }
  check('every line box is taller than its own type', offenders.length === 0, offenders.join('\n         '));
}

{
  console.log('the big numerals go through the helper');
  // A regression here would not fail the check above — dropping `lineHeight` entirely also passes
  // it — but it would reintroduce the Android padding the design does not want.
  const usesHelper = files.filter((f) => f.source.includes('displayNumeral(')).map((f) => f.path);
  check('displayNumeral is actually used', usesHelper.length >= 9, `${usesHelper.length} files: ${usesHelper.join(', ')}`);
  const helper = files.find((f) => f.path.endsWith('theme/tokens.ts'));
  check('and it turns off Android font padding', Boolean(helper?.source.includes('includeFontPadding: false')));
}

{
  console.log('no control is wired to nothing');
  /**
   * Two settings toggles shipped hard-wired to `true` with an empty handler: tappable, apparently
   * on, and controlling nothing. The interaction sweep now clicks every switch and asserts the
   * store moved, but that only covers switches on screens it visits — this covers the whole tree.
   */
  const dead: string[] = [];
  for (const { path, source } of files) {
    for (const m of source.matchAll(/on(?:Press|Toggle|Change|ChangeText)=\{\(\)\s*=>\s*\{\s*\}\}/g)) {
      const line = source.slice(0, m.index ?? 0).split('\n').length;
      dead.push(`${path}:${line}`);
    }
  }
  check('no empty press or toggle handler anywhere', dead.length === 0, dead.join(', '));
}

{
  console.log('every screen can be left');
  /**
   * A screen with no way off it is the shape of the worst bug this app has had: the final
   * onboarding step set two flags, navigated nowhere, and stranded every new user until they
   * force-quit. This is the static half of that check — the journey walk is the dynamic half.
   */
  const screens = files.filter((f) => /src\/screens\/.*Screen\.tsx$/.test(f.path));
  const stranded = screens
    .filter((f) => {
      const s = f.source;
      // Something on the screen must be able to change the screen: a `go(`, an action that
      // navigates, or a back control.
      // `start*` actions navigate too — they set up a flow and then `go` to its first screen. The
      // check-in tab reaches every one of its destinations that way and through no bare `go(` at
      // all, which is a real route off the screen and was being read as a dead end.
      return !/\bgo\(|goBack|\bback\(\)|onBack|abortTest|stopAlarm|submitKss|finishOnboarding|saveLog|saveAlarm|skipScan|retryScan|nextSlide|nextLesson|startPvt|startSleepLog|startDailyCheckin|startQuickRating|startAlarmDemo|consentContinue/.test(s);
    })
    .map((f) => f.path);
  check('no screen is a dead end', stranded.length === 0, stranded.join(', '));
  check('and there are screens to check', screens.length > 30, screens.length);
}

console.log(failures === 0 ? '\nAll layout checks passed.' : `\n${failures} layout check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
