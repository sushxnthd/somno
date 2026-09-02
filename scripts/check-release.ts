import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';

/**
 * The release gate: every commitment this project has made, checked against the code.
 *
 * This exists because "is it ready" kept being answered from memory, and memory was wrong more than
 * once — an onboarding step that navigated nowhere sat behind 111 passing assertions for a week.
 * Everything a user asked for over the life of this app is written down here as something a machine
 * can check, so the answer to "did you actually do it" is a command rather than a claim.
 *
 * Two halves:
 *   - What the app promised to *be*. Each check names the report that caused it.
 *   - What Google Play requires before a listing can go live.
 *
 * A check that cannot be made here says so out loud rather than passing quietly. Nothing in this
 * environment can compile Kotlin, reach a Supabase project, or open a camera, and a gate that
 * pretended otherwise would be the same kind of lie the app spent this long removing.
 */

let failures = 0;
let manual = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok     ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL   ${name}`, detail ?? '');
  }
}

/** Something real but unverifiable from here. Counted and printed, never silently passed. */
function onDevice(name: string, why: string) {
  manual += 1;
  console.log(`  DEVICE ${name} — ${why}`);
}

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

function sourceFiles(roots = ['src', 'modules', 'plugins']): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|kt|js)$/.test(full)) out.push({ path: full, source: readFileSync(full, 'utf8') });
    }
  };
  for (const r of roots) walk(r);
  return out;
}

const files = sourceFiles();
const all = files.map((f) => f.source).join('\n');

/**
 * The same source with its comments removed.
 *
 * Needed because this file asks questions like "does anything still write to the calendar", and the
 * code that no longer does explains *why* in a comment that names the thing it removed. Matching
 * raw text reports the explanation as the offence — which it did, twice, on the first run.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const code = files.map((f) => stripComments(f.source)).join('\n');
const appJson = JSON.parse(read('app.json') || '{}');
const pkg = JSON.parse(read('package.json') || '{}');

// ---------------------------------------------------------------------------
console.log('\nthe reaction test is short enough to take half asleep');
// "the 32 reaction time test don't make sense to me", then "the baseline reaction test with 12
// trials is too long", then "if I were sleeping and started my reaction test but slept off midway
// that'd beat the purpose".
{
  const store = read('src/store/useSomnoStore.ts');
  const trials = (name: string) => Number(new RegExp(`${name} = (\\d+)`).exec(store)?.[1] ?? NaN);
  const baseline = trials('BASELINE_PVT_TRIALS');
  const daily = trials('DAILY_PVT_TRIALS');
  const alarm = trials('ALARM_PVT_TRIALS');
  check('the baseline is at most 9 trials, down from 32', baseline <= 9, baseline);
  check('a daily check-in is no longer', daily <= 9, daily);
  check('and the one at the alarm is shorter still', alarm <= 5, alarm);
  check('a trial nobody answers ends by itself', /TRIAL_TIMEOUT_MS = \d+/.test(store), 'no lapse timeout');
  check('and is scored as a lapse rather than hanging', /lapseTimer/.test(store));
}

// ---------------------------------------------------------------------------
console.log('\nthe face scan is the primary signal, and it refuses non-faces');
// "make the app lean towards the facial scan", "as scientifically validated as possible",
// "i tested it without my face and it said it completed the scan".
{
  const sdi = read('src/engine/sdi.ts');
  const weights = /BASE_WEIGHTS = \{([^}]*)\}/.exec(sdi)?.[1] ?? '';
  const weightOf = (k: string) => Number(new RegExp(`${k}: ([\\d.]+)`).exec(weights)?.[1] ?? NaN);
  const face = weightOf('face');
  const pvt = weightOf('pvt');
  const kss = weightOf('kss');
  // The architecture spec sets these defaults, and they are defaults rather than discoveries: the
  // PVT leads because it is the best-validated field measure of sleep-loss impairment, not because
  // anything in this repo measured that. An earlier revision equalised pvt and face on the grounds
  // that no *local* evidence ranked them, which overrode a specified default with a preference.
  const debt = weightOf('debt');
  check('the reaction test carries the spec weight', pvt === 0.4, pvt);
  check('the face scan carries the spec weight', face === 0.25, face);
  check('self-report carries the spec weight', kss === 0.15, kss);
  check('sleep debt carries the spec weight', debt === 0.2, debt);
  check('and they sum to one', Math.abs(pvt + face + kss + debt - 1) < 1e-9, pvt + face + kss + debt);
  check('measurement quality decides which one leads', /export function precisionOf/.test(sdi));
  check('and the scoring path uses it', /precisionOf\(\{/.test(read('src/store/useSomnoStore.ts')));

  // Detection is a trained model's job now. The hand-rolled photometric detector rejected real
  // faces in a lit room, on a grainy sensor, and at arm's length — three failure modes that came
  // from the method rather than from its constants, so the method is what changed.
  // Comments stripped before the absence checks below. These files explain at length *what was
  // removed and why*, so matching raw text reports the explanation as the offence — which is the
  // trap stripComments exists for, and which caught this block on its first run.
  const features = stripComments(read('src/lib/faceFeatures.ts'));
  const scoring = read('src/lib/faceScoring.ts');
  const detect = read('src/lib/faceDetect.ts');
  const ocularRaw = read('src/lib/ocular.ts');
  const ocular = stripComments(ocularRaw);

  check('a real detector is used', /RNMLKitFaceDetector/.test(detect));
  check('and it is bundled on-device, not a network call', /mlkit-face-detection/.test(JSON.stringify(pkg.dependencies ?? {})));
  check(
    'eye-open classification is switched on',
    /classificationMode: true/.test(detect),
    'without it ML Kit never fills in the eye-open probabilities'
  );
  check('the skin rule is gone', !/CB_MIN|isSkin/.test(features));
  check('so is the multiplicative likelihood that a lit room pinned to its own threshold', !/faceLikelihood/.test(features));
  check('and the frame-filling guards that rejected a close selfie', !/edgesTouched/.test(features));
  check('photometry now measures inside a detected box', /export function extractFeaturesIn/.test(features));
  check('anchored on the detector\'s eye landmarks', /eyeCentres/.test(features));

  check('a scan that mostly missed the face is refused', /MIN_DETECTED_FRACTION/.test(scoring));
  check('a head turned away does not count as a measurement', /facingCamera/.test(scoring));
  check('a missing detector is reported as such, not as a missing face', /detectorUnavailable/.test(scoring));

  // The eyelid measure must not invert when the eyes never open. The old within-scan normalisation
  // reported 0% closure for a scan with the eyes shut throughout; an absolute probability cannot.
  check('the eyelid measure comes from eye-open probability', /eyeOpen/.test(ocular));
  check('and no longer normalises against the scan\'s own maximum', !/ABSOLUTE_OPEN_FLOOR|quantile/.test(ocular));
  check('a detection gap is not counted as a closure', /eyeOpen: number; at: number/.test(ocular));
  check('the eyelid measure is gated on the sample rate', /temporalValid/.test(ocular));
  check('and a failed scan does not walk the user onward', /if \(failure && failure !== 'no-frames'\)/.test(read('src/store/useSomnoStore.ts')));
  onDevice('that ML Kit finds a real face on a real camera, in a lit room and a dark one', 'no camera in this environment');
  onDevice('that detection keeps the sample rate under 350ms so eyelid timing survives', 'depends on the phone; the scan reports it');
}

// ---------------------------------------------------------------------------
console.log('\nnothing on screen is cosmetic or invented');
// "nothing should be cosmetic or fake in the entire app", "the app doesn't ever store data for my
// stats", "Average NaN".
{
  const content = read('src/data/content.ts');
  check('the mockup\'s SDI series is gone', !/export const sdiSeries/.test(content));
  check('so is its reaction-time series', !/export const rtSeries/.test(content));
  check('and its week of bars', !/export const weekReview/.test(content));

  const store = read('src/store/useSomnoStore.ts');
  check('a new install has no score to show', /sdi: 0,/.test(store) && !/sdi: 72,/.test(store));
  check('it claims no baseline it has not taken', !/baselineTrials: 12,/.test(store));
  check('and no check-in it has not had', !/checkedInToday: true,/.test(store));
  check('the gauge renders the absence rather than a zero', /value: number \| null/.test(read('src/components/SDIGauge.tsx')));

  const dead = files.filter((f) => /on(?:Press|Toggle|Change)=\{\(\)\s*=>\s*\{\s*\}\}/.test(f.source));
  check('no control is wired to an empty handler', dead.length === 0, dead.map((f) => f.path).join(', '));

  check('the first check-in is plotted, not withheld', /sdiPoints\.length >= 1/.test(read('src/screens/trends/EScreen.tsx')));
  check('an empty average is not printed as NaN', /values\.length \? Math\.round/.test(read('src/screens/trends/EScreen.tsx')));
}

// ---------------------------------------------------------------------------
console.log('\nthe app agrees with the phone about the time');
// "the app's time doesn't sync with my device's actual time, like it's 7 pm alarm was ringing in
// the morning".
{
  const store = read('src/store/useSomnoStore.ts');
  const clock = read('src/utils/clock.ts');
  check('the clock format comes from the device', /is24h: \(\) => deviceUses24HourClock\(\)/.test(store));
  check('no screen still hardcodes a 12-hour clock', !files.some((f) => /fmt\([a-zA-Z.]+, false\)/.test(f.source)));
  check('a night is filed under the local date, not the UTC one', /export function localDateKey/.test(clock) && !/toISOString\(\)\.slice\(0, 10\)/.test(store));
  check('day counting survives daylight saving', /export function localDayNumber/.test(clock));
  check('and nothing counts days by dividing milliseconds', !/Math\.floor\(new Date\(d\.getFullYear/.test(code));
  check('the alarm screen shows the real date', !/SUNDAY, 9 AUGUST/.test(code));
}

// ---------------------------------------------------------------------------
console.log('\nthe alarm behaves like an alarm');
// "the alarm doesn't even function", "never showed up as a notification", "the alarm tone preview
// just went on and on".
{
  const plan = read('src/lib/alarmPlan.ts');
  const scheduler = read('modules/smart-wake-alarm/android/src/main/java/expo/modules/smartwakealarm/AlarmScheduler.kt');
  const player = read('modules/smart-wake-alarm/android/src/main/java/expo/modules/smartwakealarm/AlarmSoundPlayer.kt');
  const store = read('src/store/useSomnoStore.ts');

  check('every switched-on alarm is scheduled, not only the smart ones', /if \(!alarm\.on\) continue;/.test(plan) && !/if \(!alarm\.smart\) continue/.test(plan));
  check('an alarm re-arms itself the moment it fires', /fun rearmAfterFiring/.test(scheduler));
  check('and comes back after a reboot', /fun onBootCompleted/.test(scheduler) && /rearmAll/.test(scheduler));
  check('snooze actually rings again', /fun snooze\(/.test(scheduler) && /snoozeNativeAlarm/.test(store));
  check('and says so only when it really armed one', /snoozeArmed/.test(store));
  check('the tone preview stops by itself', /PREVIEW_MS/.test(player) && /isLooping = false/.test(player));
  check('onboarding creates the alarm it was given', /alarmFromOnboarding/.test(store));
  check('and then leaves onboarding', /onboardingComplete: true[\s\S]{0,220}get\(\)\.go\('B'\)/.test(store));
  check('a real firing opens a fresh alarm session', /beginAlarmSession/.test(read('App.tsx')));
  check('the notification permission is asked for when an alarm is made', /ensureAlarmNotifications/.test(all));
  onDevice('that the tone is audible, escalates, and shows over the lock screen', 'no Kotlin compiler or device here');
}

// ---------------------------------------------------------------------------
console.log('\nthe sleep-debt model is defensible');
// "make the app as extremely scientifically accurate in terms of sleep debt diagnosing".
{
  const debt = read('src/engine/debt.ts');
  check('debt accumulates over nights rather than reading one', /export function accumulatedDebt/.test(debt));
  check('sleep need follows age', /export function sleepNeedBand/.test(debt));
  check('and is never revised downward by restricted sleep', /q3 <= band\.mid\) return \{ hours: band\.mid, personal: false \}/.test(debt));
  check('the alertness index no longer feeds back into debt', !/sdiTopUp/.test(read('src/engine/recovery.ts')));
  check('the figure is bounded', /MAX_DEBT_HOURS/.test(debt));
  check('and the published sources are named', /Van Dongen/.test(debt) && /Hirshkowitz/.test(debt) && /Belenky/.test(debt));
}

// ---------------------------------------------------------------------------
console.log('\nthe things that were dropped stayed dropped');
// "a sleep timer event to be added to the calendar doesn't make sense to me".
{
  check('nothing writes to the calendar', !/expo-calendar|Calendar\.createEventAsync/.test(code));
  check('and no calendar permission is requested', !/READ_CALENDAR|WRITE_CALENDAR/.test(code + JSON.stringify(appJson)));
  check('the free-text assistant is gone', !/aiInput.*TextInput/.test(code));
}

// ---------------------------------------------------------------------------
console.log('\nthe rendering choices that made it fast are still in place');
// "it's extremely laggy", "none of those blob animations are actually working", "the glow seems to
// be enboxed in a square".
{
  check('the blobs are baked textures, not per-frame blurs', existsSync('src/components/blobTextures.ts'));
  check('no SVG filter survives anywhere', !/<(Fe|fe)GaussianBlur|filter=\{?["']url\(#/.test(code));
  check('the rasterised layer holds the whole texture', /overflow: 'visible'/.test(read('src/components/ConicBlob.tsx')));
  check('reduce-motion is honoured', /useReduceMotion/.test(all));
}

// ---------------------------------------------------------------------------
console.log('\nlayout survives a real phone');
{
  const offenders: string[] = [];
  for (const { path, source } of sourceFiles(['src'])) {
    for (const block of source.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
      const fs = /fontSize:\s*([\d.]+)/.exec(block[2]);
      const lh = /lineHeight:\s*([\d.]+)/.exec(block[2]);
      if (fs && lh && Number(lh[1]) <= Number(fs[1]) * 1.02) offenders.push(`${path} ${block[1]}`);
    }
  }
  check('no line box is shorter than its own type', offenders.length === 0, offenders.join(', '));
  check('the big numerals go through the Android-safe helper', /displayNumeral/.test(read('src/theme/tokens.ts')));
  check('and large system fonts are capped rather than ignored', /capFontScaling/.test(all));
}

// ---------------------------------------------------------------------------
console.log('\nPlay: the build is configured to be accepted');
{
  const android = appJson.expo?.android ?? {};
  check('an application id is set', typeof android.package === 'string' && android.package.includes('.'), android.package);
  check('a version and version code exist', Boolean(appJson.expo?.version) && Number.isInteger(android.versionCode), `${appJson.expo?.version} / ${android.versionCode}`);

  const buildProps = (appJson.expo?.plugins ?? []).find((p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties');
  const targetSdk = buildProps?.[1]?.android?.targetSdkVersion;
  // Play requires new apps to target within one year of the latest release; 35 is the current floor.
  check('targetSdkVersion meets Play\'s floor', typeof targetSdk === 'number' && targetSdk >= 35, targetSdk);

  check('health history is kept out of Google\'s auto-backup', android.allowBackup === false);
  check('permissions the app does not use are blocked', Array.isArray(android.blockedPermissions) && android.blockedPermissions.length > 0);
  check('and the generated manifest carries the removals', /tools:node="remove"/.test(read('android/app/src/main/AndroidManifest.xml')) || !existsSync('android'));

  // The alarm permissions live in the native module's manifest and are folded in by the Android
  // Gradle Plugin's merger. Checked here because the app manifest legitimately will not show them.
  const moduleManifest = read('modules/smart-wake-alarm/android/src/main/AndroidManifest.xml');
  for (const perm of [
    'POST_NOTIFICATIONS',
    'USE_FULL_SCREEN_INTENT',
    'SCHEDULE_EXACT_ALARM',
    'USE_EXACT_ALARM',
    'RECEIVE_BOOT_COMPLETED',
    'WAKE_LOCK',
  ]) {
    check(`the alarm module declares ${perm}`, moduleManifest.includes(perm));
  }
  check('and registers the receiver AlarmManager delivers to', /AlarmReceiver/.test(moduleManifest));
  check('the boot receiver that restores alarms', /BOOT_COMPLETED/.test(moduleManifest));
  check('and the activity that shows over the lock screen', /showWhenLocked="true"/.test(moduleManifest));
  check('the module is discoverable by autolinking', existsSync('modules/smart-wake-alarm/expo-module.config.json'));
  onDevice('that the merged manifest really contains all of the above', 'needs a Gradle build; see PLAY_STORE.md for the command');

  // Signing. `expo prebuild` emits a release buildType that signs with the *debug* keystore, and
  // Play rejects a debug-signed upload outright ("signed in debug mode"). EAS Build supplies its
  // own release keystore and never hits this, which is why it can sit there unnoticed — but a
  // local `./gradlew bundleRelease` produces an artefact that cannot be published, and looks fine
  // until the Console refuses it. Reported rather than patched: android/ is generated, so an edit
  // here would be erased by the next prebuild, and the durable answer is which build path is used.
  const appGradle = read('android/app/build.gradle');
  const debugSignedRelease = /release\s*\{[\s\S]{0,400}?signingConfig\s+signingConfigs\.debug/.test(appGradle);
  if (!appGradle) {
    onDevice('release signing', 'android/ is not generated here; run `npx expo prebuild -p android` to inspect it');
  } else if (debugSignedRelease) {
    onDevice(
      'release signing — the generated project signs release with the DEBUG keystore',
      'harmless if you build with `eas build -p android --profile production` (EAS injects its own upload key); a local `./gradlew bundleRelease` would be rejected by Play'
    );
  } else {
    check('the release buildType is not signed with the debug keystore', true);
  }
}

// ---------------------------------------------------------------------------
console.log('\nPlay: policy obligations the listing is judged on');
{
  const legal = read('src/lib/legal.ts');
  check('a privacy policy URL is wired into the app', /privacy: 'https?:\/\//.test(legal));
  check('so is a terms URL', /terms: 'https?:\/\//.test(legal));
  check('and a web route to delete an account', /deleteAccount: 'https?:\/\//.test(legal));
  check('a support address exists', /SUPPORT_EMAIL = '[^']+@[^']+'/.test(legal));

  // Play requires in-app deletion as well as the web route, for any app with accounts.
  check('an account can be deleted from inside the app', /deleteAccount|wipeLocalData/.test(read('src/screens/settings/F5Screen.tsx')));
  check('and deletion asks before it acts', /openConfirm/.test(read('src/store/useSomnoStore.ts')));

  // The pages themselves have to exist, or the listing is rejected on a dead link.
  const pagesWritten = existsSync('legal/privacy.md') && existsSync('legal/terms.md') && existsSync('legal/delete-account.md');
  check('the text of those pages is written and in the repo', pagesWritten, 'see legal/');

  check('the data-safety answers are written down', /Data safety/.test(read('PLAY_STORE.md')));
  check('the listing copy exists', existsSync('listing/LISTING.md'));
  check('a feature graphic exists', existsSync('listing/play/feature-graphic.png'));
  check('a 512px icon exists', existsSync('listing/play/icon-512.png'));
  const shots = existsSync('listing/play') ? readdirSync('listing/play').filter((f) => f.endsWith('.png') && !f.startsWith('icon') && !f.startsWith('feature')) : [];
  // Play requires at least two phone screenshots; more is better.
  check('there are at least two phone screenshots', shots.length >= 2, shots.length);

  onDevice('publishing those three pages at the addresses the app points to', 'needs a domain and a host');
  onDevice('the Data safety and content-rating forms in the Play Console', 'only completable in the Console');
}

// ---------------------------------------------------------------------------
console.log('\nno secret is in the repository');
{
  check('.env is ignored', /^\.env$/m.test(read('.gitignore')));
  check('but the example is kept', existsSync('.env.example'));
  const envExample = read('.env.example');
  check('the example holds no filled-in values', !/=\s*[A-Za-z0-9]{20,}/.test(envExample));
  // A service_role key bypasses every row-level security policy in the schema.
  check('no service_role key anywhere in the source', !/service_role/.test(all + envExample) || /NOT the service_role/.test(envExample));
  check('no bearer token or private key is committed', !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(all));
}

// ---------------------------------------------------------------------------
console.log('\nthe verification the project relies on still exists');
{
  const scripts = pkg.scripts ?? {};
  for (const s of ['test', 'e2e']) check(`npm run ${s} is defined`, typeof scripts[s] === 'string');
  const suites = Object.keys(scripts).filter((k) => k.startsWith('test:'));
  check('there are at least a dozen test suites', suites.length >= 12, suites.length);
  for (const harness of ['e2e/interactions.cjs', 'e2e/journeys.cjs', 'e2e/clipping.cjs', 'e2e/visual-audit.cjs']) {
    check(`${harness} exists`, existsSync(harness));
  }
  check('the journey walk refuses to teleport between screens', /Nothing is allowed to call `go\(\)`/.test(read('e2e/journeys.cjs')));
}


// ---------------------------------------------------------------------------
console.log('\nthe review pass of 16 August holds');
{
  const debt = read('src/engine/debt.ts');
  const stages = read('src/engine/stages.ts');
  const sdi = read('src/engine/sdi.ts');
  const recovery = read('src/engine/recovery.ts');
  const moduleManifest = read('modules/smart-wake-alarm/android/src/main/AndroidManifest.xml');

  // One minimum age, in the four places that used to disagree (12 / 16 / 16 / 18).
  const minAge = Number(/export const MIN_AGE = (\d+)/.exec(debt)?.[1] ?? NaN);
  check('a minimum age is defined once', Number.isInteger(minAge), minAge);
  check('onboarding uses it rather than a literal', /min=\{MIN_AGE\}/.test(read('src/screens/onboarding/A4Screen.tsx')));
  check('the store clamps to it', /Math\.max\(MIN_AGE/.test(read('src/store/useSomnoStore.ts')));
  check('the privacy policy agrees', new RegExp(`under ${minAge}`).test(read('legal/privacy.md')), minAge);
  check('the terms agree', new RegExp(`${minAge} or older`).test(read('legal/terms.md')));
  check('and the listing no longer declares a different audience', !/Adults, 18\+/.test(read('listing/LISTING.md')));

  // The stage split no longer comes from a chain that cannot support it.
  check('the per-stage debt split is deterministic', /export function stageLoss/.test(stages));
  check('and the simulation-derived one is deleted, not deprecated', !/export function splitDebtByStage/.test(recovery));
  check('the transition matrices are reduced to one kind of object first', /export function toEmbeddedChain/.test(recovery));
  check('the mixture uses the reduced chains', /toEmbeddedChain\(ALERT_MATRIX\)/.test(recovery) && /toEmbeddedChain\(DROWSY_MATRIX\)/.test(recovery));

  // No single signal can run away with the fused score.
  check('the debt signal is bounded', /MAX_ABS_Z/.test(sdi) && /Math\.max\(-MAX_ABS_Z/.test(sdi));
  check('and the score reads the ledger rather than one night', /accumulatedDebt\(s\.sleepLogs, s\.age\)\.hours/.test(read('src/store/useSomnoStore.ts')));
  check('with no invented night when nothing is logged', /s\.sleepLogs\.length \? debtToZ/.test(read('src/store/useSomnoStore.ts')));

  // Skin detection was replaced wholesale rather than improved again. The chrominance rule fixed
  // the tone dependence of the RGB rule it replaced and still rejected real faces for reasons that
  // had nothing to do with tone, so colour is no longer how this app decides where a face is.
  const featuresCode = stripComments(read('src/lib/faceFeatures.ts'));
  check('no colour rule decides where the face is any more', !/CB_MIN|CR_MIN|isSkin/.test(featuresCode));
  check('and nothing thresholds raw red', !/r > 60 && g > 30/.test(featuresCode));

  // Alarm permissions.
  check('SCHEDULE_EXACT_ALARM is capped where USE_EXACT_ALARM takes over', /SCHEDULE_EXACT_ALARM"\s+android:maxSdkVersion="32"/.test(moduleManifest));
  check('the app can tell when it may not cover the lock screen', /canUseFullScreenIntent/.test(read('modules/smart-wake-alarm/android/src/main/java/expo/modules/smartwakealarm/AlarmScheduler.kt')));
  check('and warns rather than degrading silently', /fullScreenAllowed/.test(read('src/screens/settings/F4Screen.tsx')));
  check('a regranted exact-alarm permission re-arms the alarms', /SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED/.test(moduleManifest));
}

// ---------------------------------------------------------------------------
console.log('\nthe app matches the architecture spec it was built from');
// Somno_03_Technical_Architecture.md, supplied as the source of truth.
{
  const features = read('src/lib/faceFeatures.ts');
  const geometry = read('src/lib/faceGeometry.ts');
  const detect = read('src/lib/faceDetect.ts');
  const baseline = read('src/lib/faceBaseline.ts');

  // §9/§10: the index has one name, and it is not the sleep-debt figure. Those are two different
  // quantities on two different screens, and calling both "Sleep Debt" made the gauge read as hours.
  const uiFiles = sourceFiles(['src']).concat([{ path: 'listing/LISTING.md', source: read('listing/LISTING.md') }]);
  const misnamed = uiFiles.filter((f) => /Sleep Debt Index/.test(f.source)).map((f) => f.path);
  check('SDI is named Sleep Deprivation Index everywhere', misnamed.length === 0, misnamed.join(', '));
  check('and the gauge says so to a screen reader', /Sleep Deprivation Index/.test(read('src/components/SDIGauge.tsx')));

  // §3: the engineered feature table, and the explicit instruction not to use a raw-pixel CNN.
  check('EAR is computed from eye contours', /export function eyeAspectRatio/.test(geometry));
  check('MAR from lip contours', /export function mouthAspectRatio/.test(geometry));
  check('mouth-corner droop too', /export function mouthCornerDrop/.test(geometry));
  check('contours are actually switched on', /contourMode: true/.test(detect), 'landmarks alone cannot give EAR');
  check('periorbital darkness is measured in CIELAB', /periorbitalLab/.test(features) && /export function rgbToLab/.test(features));
  check('scleral redness in HSV', /export function rgbToHsv/.test(features) && /scleralRedness/.test(features));
  check('skin tone in LAB', /skinToneL/.test(features) && /skinToneChroma/.test(features));
  check('PERCLOS is carried', /closureFraction/.test(read('src/lib/faceScoring.ts')));
  check('every feature is scored against the personal baseline', /scoreAgainstBaseline/.test(read('src/lib/faceScoring.ts')));
  check('and the new channels are in that baseline', /periorbitalLab/.test(baseline) && /scleralRedness/.test(baseline) && /ear\?/.test(baseline));
  // The spec is explicit that this stays a small transparent model, not an end-to-end classifier.
  check('no raw-pixel CNN was introduced', !/tensorflow|onnxruntime|mobilenet|\.tflite/i.test(JSON.stringify(pkg.dependencies ?? {})));

  // §5.1: the fusion is the transparent linear model with the spec's defaults.
  check('the fusion is the spec formula', /50 \+ 10 \* weighted/.test(read('src/engine/sdi.ts')));

  // §6: raw frames never persist or transmit. Checked on the *upload* path specifically — the
  // restore path legitimately mentions the field, to set it to null, and a blanket search on the
  // whole file reported that correct line as a leak.
  const syncCode = stripComments(read('src/lib/sync.ts'));
  const uploadRows = /const faceRows =[\s\S]*?\}\)\);/.exec(syncCode)?.[0] ?? '';
  check('the face rows sent upstream carry no image reference', uploadRows.length > 0 && !/photo/i.test(uploadRows));
  check('and a restored scan has no photo path from another device', /photoUri: null/.test(syncCode));

  // Smart Wake must not claim to detect stages it never measured.
  check('Smart Wake says nothing measures sleep stages', /Nothing measures your sleep stages/.test(read('src/screens/settings/F4EScreen.tsx')));
}

// ---------------------------------------------------------------------------
console.log('\nthe test setup runs every suite');
{
  const runner = read('scripts/run-tests.mjs');
  check('npm test is a runner, not a chain of &&', pkg.scripts?.test === 'node scripts/run-tests.mjs', pkg.scripts?.test);
  check('it discovers suites rather than listing them', /readdirSync/.test(runner) && /test-.+\\.ts/.test(runner));
  check('and it runs them all instead of stopping at the first failure', !/break|return/.test(runner.split('for (const file of suites)')[1] ?? ''));
  const suiteFiles = readdirSync('scripts').filter((f) => /^test-.+\.ts$/.test(f));
  check('there are at least fifteen suites', suiteFiles.length >= 15, suiteFiles.length);
}

// ---------------------------------------------------------------------------
console.log('\nnothing modelled is presented as a clinical measurement');
// The app derives three headline numbers that no sensor produced: the SDI, the accumulated debt,
// and the per-stage split. Each is defensible as an estimate and indefensible as a measurement,
// and the difference is a Play policy question as much as an honesty one — a wellness listing that
// reads as a diagnostic gets pulled. These assertions exist because copy is the easiest thing in
// the repo to reword by accident, and the qualifier is the part a tidying pass would cut first.
{
  const home = read('src/screens/home/HomeScreen.tsx');
  const recoveryScreen = read('src/screens/recovery/DScreen.tsx');
  const howItWorks = read('src/screens/settings/F7Screen.tsx');

  check('the SDI explainer calls the index an estimate', /an estimate, not a clinical measurement/.test(home));
  check('and disclaims lab validation', /validated against a sleep lab/.test(home));
  check('the hypnogram still says it was modelled', /not measured/.test(home));
  check('the stage split says what it was modelled from', /modelled from when in the night your sleep was lost/.test(recoveryScreen));
  check('and that it was not measured on the user', /not measured on you/.test(recoveryScreen));
  check('the debt ledger note claims an estimate, not a measurement', /Estimated across \$\{nightWord/.test(recoveryScreen));
  check('and the empty state does not promise measurement', !/your debt is measured here/.test(recoveryScreen));
  check('"How Somno works" names all three as estimates', /Your SDI, your sleep debt and the sleep stages/.test(howItWorks));
  check('and repeats the non-clinical claim there', /clinically validated measurement/.test(howItWorks));
  check('the app still says outright it is not a medical device', /not a medical device/.test(howItWorks));

  // The inverse, and the half that actually earns its keep: no screen may state one of the three
  // modelled figures as a measurement of the user. Written deliberately loose over the *subject*
  // (any of the four nouns, within a clause) because the first draft of this check keyed on
  // "sleep debt" and so sailed past the literal sentence it was written to catch — "your debt is
  // measured here". A gate that cannot catch the bug that prompted it is decoration.
  const OVERCLAIM = /\b(SDI|score|debt|stage|stages)\b[^.!?]{0,60}\b(is|are|was|were|gets?) measured\b/i;
  const overclaims = sourceFiles(['src/screens'])
    .filter((f) => OVERCLAIM.test(stripComments(f.source)))
    .map((f) => f.path);
  check('no screen calls a modelled figure measured', overclaims.length === 0, overclaims.join(', '));
}

console.log(
  failures === 0
    ? `\nRelease gate passed. ${manual} item(s) can only be confirmed on a device or in the Play Console — listed above.`
    : `\n${failures} release check(s) FAILED. ${manual} further item(s) need a device or the Play Console.`
);
process.exit(failures === 0 ? 0 : 1);
