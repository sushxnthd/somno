# Publishing Somno on Google Play

Everything here needs an account, a console or a device, which is why it is a checklist for you
rather than work I could finish. The app side of each item is done unless it says otherwise.

Backend setup (Supabase, Google sign-in) is in `supabase/SETUP.md` and is a prerequisite for
signing in at all — though the app runs fully without it, on-device only.

---

## 1. Build it

```bash
npm install
npx expo prebuild --platform android --clean   # optional locally; EAS does this itself
eas build --profile production --platform android
```

`eas.json` defines three profiles: `development` (dev client, APK), `preview` (APK for testers),
`production` (**app bundle** — Play only accepts AAB). Version code is remote and auto-increments.

**Your `.env` does not reach EAS.** `EXPO_PUBLIC_*` values are inlined at build time, so a cloud
build without them produces an app with no backend — it will run, and every account feature will
report "not set up". Push them first:

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://<ref>.supabase.co" --environment production
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>" --environment production
eas env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "<web client id>" --environment production
eas env:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value "<ios client id>" --environment production
```

None of those four is a secret — they all ship inside the binary regardless. The Google client
*secret* is not among them: it belongs only in Supabase's Google provider settings.

## 2. Google sign-in needs your signing key

Google matches an Android app by package name plus signing certificate, so the OAuth client cannot
be created until EAS has generated (or you have uploaded) a keystore:

```bash
eas credentials            # Android → Keystore → shows the SHA-1
```

Then in Google Cloud Console → Credentials, create an **Android** OAuth client with package
`com.somno.app` and that SHA-1. If you later let Play re-sign with Play App Signing (the default),
add the **App signing key** SHA-1 from Play Console → Setup → App integrity as a second client, or
sign-in will work in your internal build and fail in the Play release.

## 3. Play Console listing

The listing text and images are written and built: **`listing/LISTING.md`** holds the title, short
and full descriptions, the "what's new" note, the content-rating answers and the tags, ready to
paste. `listing/play/` holds the eight 1080×1920 phone screenshots, the 1024×500 feature graphic and
the 512×512 icon. Both are reproducible — `scripts/store-assets.cjs` captures the screens and
`scripts/compose-store-assets.py` frames them — and the screenshots are captured from the real app
with three weeks of invented history seeded first, because a fresh install photographs as a set of
empty states.

- **Privacy policy URL** — required, and it must be live before review. The app links to the same
  page from AU1, the consent screen and Settings → Data & privacy; the URLs are in
  `src/lib/legal.ts` and currently point at `somno.app/privacy` and `/terms`.
  **The text of all three pages is written and lives in `legal/`** — `privacy.md`, `terms.md` and
  `delete-account.md`. They are written against the code rather than from a template, and each one
  has a short bracketed placeholder for your legal name and jurisdiction. Publish them at those
  three addresses (any static host will do), or change the constants in `src/lib/legal.ts` to
  wherever you put them. A privacy-policy link that 404s is a rejection, not a warning.
- **Account deletion URL** — required for any app with account creation. In-app deletion is done
  (Settings → Data & privacy → Delete), but Play also wants a web page where someone who has
  uninstalled the app can request it: `somno.app/delete-account` in the same file.
- **Data safety form.** What Somno actually collects, so the form matches the code:

  | Data | Collected | Shared | Purpose | Optional |
  | --- | --- | --- | --- | --- |
  | Email address | Yes, if an account is made | No | Account management | Yes — the app is fully usable with no account |
  | Health & fitness (sleep entries, alertness scores, reaction times) | Yes, if signed in | No | App functionality | Yes |
  | Photos | **No** | No | — | The face scan measures frames on the device and never uploads or stores an image |

  Answer **yes** to "data is encrypted in transit" (HTTPS to Supabase) and **yes** to "users can
  request deletion".
- **Health apps declaration.** Somno reports an alertness index, so expect the health-app form.
  It is a wellness tool, not a medical device: it does not diagnose, treat, or claim clinical
  accuracy, and the copy throughout stays on that side of the line.
- **Exact alarm permission declaration.** The alarm module declares `USE_EXACT_ALARM`, which Play
  restricts to alarm and calendar apps. Somno is an alarm clock, so the declaration is
  straightforward — say that it wakes users at a chosen time. If you would rather not make it,
  removing that one line from
  `modules/smart-wake-alarm/android/src/main/AndroidManifest.xml` leaves the app working with
  inexact alarms, and the UI already warns the user when that is the case.
- **Full-screen intent declaration.** `USE_FULL_SCREEN_INTENT` is also declared, for the alarm
  screen over the lock screen. Same answer: it is an alarm.

## 4. What the app already does about all this

- **Permissions are minimal and verified.** A prebuild of the merged manifest declares only
  `CAMERA`, `INTERNET` and `VIBRATE`, plus the alarm module's own set at Gradle merge time. The two
  calendar permissions are gone: the only thing that needed them wrote tonight's bedtime into the
  user's calendar, which is the wrong place for it, and a reminder does the same job with nothing
  but the notification permission the app already asks for.
  `RECORD_AUDIO`, both storage permissions and `SYSTEM_ALERT_WINDOW` are explicitly blocked in
  `app.json` — the camera plugin and the React Native template add them, and Somno uses none of
  them. (Side effect worth knowing: blocking `SYSTEM_ALERT_WINDOW` also removes the dev-client's
  floating menu bubble. Shake still opens the dev menu.)
- **Account deletion is real.** It calls `delete_own_account()` in `supabase/schema.sql`, which
  runs as its owner, derives the user id from `auth.uid()` so it can only ever delete the caller,
  and cascades every table. The device is wiped whether or not the server call succeeds.
- **Nothing invented is presented as the user's own data.** There is no illustrative series left in
  the app to mark: a screen with no history renders the absence and says what would fill it, and a
  screen with one reading plots that one reading and says so. The design mockup's numbers — a Sleep
  Debt Index of 72, a week of bars, a reaction-time series — are deleted rather than labelled.
- **A render error is a recoverable screen**, not a blank activity that reads as a crash in Android
  vitals. It is also written to a local fault log (`src/lib/diagnostics.ts`) along with anything
  ErrorUtils catches, and Help & feedback offers to share the last twenty entries. Nothing is sent
  automatically: there is no crash-reporting SDK in the app, which is why the Data safety form above
  has no third-party entry.
- **Health history is excluded from Android auto-backup** (`allowBackup: false`), so a device
  transfer does not copy someone's sleep record into a Google backup they never thought about. An
  account is the only route off the device, and the privacy screen says so.
- **Type never grows past 1.3×** the system size (`src/theme/fontScaling.ts`). The layouts are dense
  enough that Android's largest accessibility font clips rather than reflows, and clipped text is a
  worse accessibility outcome than text that stopped growing.
- **targetSdk 36**, set explicitly through `expo-build-properties` rather than inherited, so a
  toolchain default cannot quietly drop the app below Play's API-level floor at submission time.

## 5. Before you hit publish

Run the release gate first — it checks, against the source, every commitment this app has made over
its life, plus the Play requirements that can be verified without a Console:

```
npm run check:release
```

It prints `DEVICE` for anything it cannot honestly confirm from a workstation, and those items are
exactly the list below. If it prints a `FAIL`, that is a real regression and the build is not ready.

Then, in this order, since each one can only be checked on hardware:

1. Install the `preview` APK and run a full check-in: face scan → tap test → rating. **Watch the
   face-scan result line.** Where the camera sampled fast enough it reads "Eyes closed N% of the
   scan"; where it did not, it reads "Measured from stills only at N fps", meaning the eyelid
   channel was dropped and the scan scored on brightness, colour and steadiness alone. The rate is
   printed in that second case because it is the reason: eyelid timing needs frames closer than
   350 ms apart, and whether a phone manages that with ML Kit detection in the capture loop is the
   one thing no amount of testing off-device could establish. That line is the fastest way to tell
   whether the scan works on your hardware: hold your eyes shut for the second half of a scan and N
   should come out near 50%. **If it says "stills only", send me the fps** — the fix is in the
   capture loop, not in your lighting.
2. **Confirm the merged manifest really carries the alarm's permissions and components.** They are
   declared in the native module's own manifest and folded in by the Android Gradle Plugin, so they
   do not appear in `android/app/src/main/AndroidManifest.xml` and cannot be checked without a
   build. After a local build:

   ```
   npx expo prebuild --platform android
   cd android && ./gradlew :app:processReleaseManifest
   grep -E 'POST_NOTIFICATIONS|USE_EXACT_ALARM|USE_FULL_SCREEN_INTENT|BOOT_COMPLETED|AlarmReceiver' \
     app/build/intermediates/merged_manifests/release/AndroidManifest.xml
   ```

   All five must appear. If they do not, the module is not being autolinked, and the alarm cannot
   fire at all — `AlarmManager` will not deliver a broadcast to an unregistered receiver, and on
   Android 13+ nothing can post a notification without `POST_NOTIFICATIONS`.
3. Set an alarm two minutes out, lock the phone, and confirm it fires over the lock screen.
4. Revoke "Alarms & reminders" in system settings and confirm the amber warning appears on the
   alarms screen (that is the inexact-alarm path).
5. Deny the camera permission and confirm the scan says so and scores on the other signals.
6. Sign in with Google, add a check-in, delete the account, and confirm both the Supabase tables
   and the phone come back empty.
7. Check the face scan in a dark bedroom with the fill light on. This is the one I am least able to
   predict from here — see the honest limits below.
8. Let the alarm ring untouched for a minute and confirm it gets *louder*, and that vibration joins
   it. Then confirm "Just stop the alarm" silences it instantly, and that starting a check-in
   silences it before the tap test begins.
9. Export your data and open the CSV somewhere. Set tonight's reminder from the Recovery tab and
   confirm it arrives.
10. Set a repeating alarm, let it fire, and confirm it is still scheduled for the next day
   afterwards. Then restart the phone and confirm it survived — those are two separate mechanisms
   and both used to be missing.

## 6. What changed to make everything real

Anything that was a label without a mechanism behind it is now either wired or gone:

| Was | Now |
| --- | --- |
| "Good morning, Maya", a fixed date and a streak of 6 | Greeting from the clock and the account's own name, today's real date, streak counted from actual check-ins |
| Duration 80 / Quality 97 / Habits 74 | Derived from the logged night and the last seven days; a dash and a route to fix it when there is no record |
| A stock hypnogram of a night nobody slept | The recovery model's estimate of the night that was actually logged, labelled as an estimate, absent when nothing was logged |
| A weekly review of an invented week | The last seven days as measured, with empty columns for days with no check-in |
| "Peaked at 7.4 h on 2 Aug" | The real peak of the real debt series, plus the sleep-debt trend chart the spec asks for |
| A fixed insight card | Rules that only fire when the data supports them, and general advice, framed as advice, when it does not |
| A "screen time vs SDI" scatter | Removed — see below |
| "Export my data" opening an explainer | Real CSV and JSON through the system share sheet |
| "Add to Calendar" setting a flag | A reminder for tonight's target, from the app itself |
| Health sync toggle | An honest "not in this version" row |
| A £3.99/month paywall that navigated back | Removed. Nothing is gated, so nothing claims to be |
| A lesson chat box that "answered" free text | The prepared questions it always actually answered, without the input box |
| An alarm sound picker of four invented names | The device's own alarm ringtones, previewed on tap |
| **An alarm that never made a sound** | Plays the chosen tone on the alarm stream, on loop, escalating over 60s, with vibration after 15s |
| Chronotype standing in for gender in the recovery engine | Real optional gender, medication *categories*, a stress flag, and misalignment derived from the natural-wake question |
| 12-trial baseline calibration | 32 trials, as the spec requires for a baseline; the daily test stays at 12 |
| Confidence from signal count alone | Signals *and* how established the baseline is |
| A face scan of five stills at 2.4fps, weighted behind the reaction test | Six seconds sampled as fast as the device allows, measuring eyelid closure — now the heaviest channel in the score and the lead signal in the fusion |
| A reaction test that waited forever for a tap | Trials time out at 3s and score as maximal lapses, so falling asleep mid-test produces a finding rather than a hang |
| "4.2 h accumulated over 5 nights" printed on every check-in | The user's own debt over their own logged nights |
| Notification previews quoting invented text, including a bedtime and a statistic | The exported strings the reminders actually arrive with |
| A 32-trial baseline, scored with a plain mean and standard deviation | The same 12-trial protocol as the daily test, summarised robustly, and refined from every later session |
| Face regions assumed from the scan ring's framing | The face located from its own pixels, the eye band found inside it |
| Tonight's bedtime written into the user's calendar | A reminder from the app — and the calendar permissions dropped entirely |
| Alarm events, consent log and debt records never written | All three recorded, exported and synced |
| Expo's template icon — the blue chevron, layout guides still in it | A crescent in the app's own palette, drawn by `scripts/make-icons.py`: flat icon, adaptive foreground/background, monochrome themed icon, notification icon and splash |
| No splash configuration at all, so a white flash before a near-black app | An explicit splash on `#07060C` with the app mark |
| A footer reading "Somno 1.4.0" on a build that is 1.0.0 | The version from the manifest, with the Android versionCode beside it |
| A Send button on Help & feedback that did nothing with what you typed | Opens a mail composer to the support address, with the version in the subject |
| Sync pushing every record it had, one request per check-in, on every launch | Chunked upserts of only what the account is missing, and paged reads so a long history is not silently truncated at 1000 rows |
| Every weight of Figtree in the bundle, italics included | The five weights the app renders — 712KB of fonts down to 272KB |

Two deliberate removals, both with a reason:

- **Screen time.** Android needs `PACKAGE_USAGE_STATS`, a special-access permission Play scrutinises
  heavily and routinely rejects for non-core uses, and the spec itself records that iOS cannot
  provide the numbers at all. A correlation chart that can only ever exist on one platform, at the
  cost of the most-questioned permission on the store, is not worth the review risk for v1.
- **The paywall.** Billing was out of scope, so there were no products to buy, no entitlements to
  check, and no free-tier limits enforced anywhere. A priced button that quietly navigated back is
  worse than no paywall — and a store listing with a non-functional purchase flow is its own policy
  problem.

## 7. The models

The scores rest on published models rather than on invented arithmetic, and `npm run test:alertness`
checks them against what the literature says should be true rather than against whatever the code
happens to return.

**Three-Process Model of alertness** (`src/engine/alertness.ts`). Until this existed the app was
missing the largest source of variation in human alertness — the time of day — and was comparing a
7am check-in with a 3pm one as if the body clock did not exist. Three terms:

- **S**, homeostatic pressure, rising exponentially with time awake and dissipating during sleep.
  Front-loaded recovery falls out of this: eight hours from a depleted state gets most of the way
  back, not all of it, which is the plateau the recovery literature describes.
- **C**, the circadian process — a 24-hour sinusoid plus its 12-hour harmonic. The harmonic's phase
  is what produces the post-lunch dip; get it wrong and the model claims people are sharpest at 2pm.
  Chronotype shifts the whole curve, taken from the natural-wake question the profile already asks.
- **W**, sleep inertia — a steep decay over the first half hour. This is why the alarm-time PVT is
  not a measurement of how rested you are, and why it used to be scored as though it were.

Every check-in is now corrected for the phase difference between when it was taken and when the
baseline was taken. A baseline recorded before this existed has no phase, so no correction is
applied to it rather than a guessed one.

**PVT metrics** (`src/engine/pvt.ts`) follow Basner & Dinges (2011) on maximising sensitivity to
sleep loss. Reciprocal reaction time — response speed — is the primary outcome, because mean RT is
dominated by a handful of slow trials while speed uses the whole distribution. Lapse counts are
square-root transformed, since a raw count on a short test is zero for almost everyone until it
suddenly is not. Responses under 100 ms are anticipations, not fast trials, and are now excluded
from every statistic and counted as false starts — previously they made a sleepy user look sharp.

**What the models are used for, and what they are not.** They make comparisons fair and they answer
questions about timing: when today's sharpest stretch is, when the dip lands, which minute in the
half hour before an alarm is the lightest predicted sleep. They are group-level models, not
measurements of an individual's circadian phase, and nothing in the app presents them as a finding
about anyone's health.

## 8. Honest limits

- **The face scan has never run on a phone.** It measures real pixels — brightness, cheek redness,
  eye-region darkness relative to the cheeks, eye-band edge energy and movement between frames —
  and `npm run test:face` drives all of it against synthetic frames. The regions are now *found*
  rather than assumed: `locateFace` takes the face's bounding box from its own skin-coloured pixels
  and `locateEyeBand` finds the eyes inside it by integral projection, so a face held low or close
  is measured where it actually is. A frame where that fails falls back to the old fixed bands, is
  marked `located: false`, and counts for less. What no test here can tell you is how the skin rule
  behaves across real skin tones under a real phone's night-time front camera — that is the first
  thing to check against real captures, and the thresholds in `isSkin` are where to adjust it.
- **The eyelid measure is PERCLOS-shaped, not PERCLOS.** PERCLOS is defined against eyelid
  *position* — how much of the pupil the lid covers — and that needs a landmark model this app does
  not have. What `src/lib/ocular.ts` measures is the collapse of *structure* in the eye region
  across a six-second series: an open eye puts a hard dark line of lashes, iris and lid margin into
  the band, a closed one replaces it with smooth skin. It is judged against the eye's own open level
  within the same scan, so it does not depend on skin tone, lighting or distance. The distinction is
  stated in the file, in the code that consumes it, and to the user.
- **What the device can sample decides what is claimed.** The scan captures as fast as the phone
  allows and reads the timestamps back. Below twelve frames, or above 350ms between them, a 400ms
  closure can fall between two samples — so the temporal measures are marked unusable, dropped from
  the score, and the check-in says the camera was too slow rather than quoting a number. On a slow
  phone the face scan degrades to the still-image measures and says so.
- **No Eye Aspect Ratio and no blink rate.** Both need either landmarks or 30Hz+, and neither is
  available. Blinks last 100–400ms; the app deliberately only counts closures past 400ms, which is
  the drowsiness-specific event rather than an ordinary blink.
- Measurements are scored against the user's own running baseline, so the first three scans report
  `provisional` and are deliberately excluded from the fused score.
- **Nothing has been tested against a live Supabase project.** The sandbox has no route to it.
- **Sign in with Apple is still not implemented**, which does not matter for Play but blocks an iOS
  release later (App Store guideline 4.8).
- **The alarm's audio path has never been heard.** The Kotlin is straightforward — a MediaPlayer on
  `USAGE_ALARM`, looping, with a volume ramp — but there is no Kotlin compiler in the environment
  this was built in, so it has been checked by reading, not by running. It is the first thing to
  test on a device, and step 2 of the checklist above exists for it.
- **Health Connect import is not built.** It is v1.5 in the spec's own build sequencing, and the
  screens say so rather than offering a toggle that imports nothing.
- **Smart Wake is a model estimate too.** It moves the alarm up to 30 minutes *earlier* — never
  later — to the lightest sleep the semi-Markov simulation predicts. Without a wearable there is no
  way to know the actual stage, and the setting says so under the toggle.
- **R8 minification is off.** `expo-build-properties` carries the keep rules for the alarm module,
  so turning `enableMinifyInReleaseBuilds` on is a one-line change — but no release build has been
  compiled in this environment, and a shrinker that strips something reflective fails at runtime in
  the exact build nobody has run yet. Turn it on, install the resulting AAB, and walk the checklist
  in §5 before shipping with it.
- **The hypnogram is a model, not a measurement.** Without a wearable there is no way to know when
  someone entered REM. It is driven entirely by the user's own logged duration, score and
  personalisation factors, and the card says "modelled … not measured" underneath it.
