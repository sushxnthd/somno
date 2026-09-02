# Play Store listing — Somno

Everything the Play Console asks for as text, written to be pasted in. The images beside it are in
`listing/play/`; `listing/raw/` holds the unframed screen captures they were built from.

Regenerate the images with:

```bash
npx expo start --web --port 8098          # the app under test
node scripts/store-assets.cjs             # captures listing/raw/*.png
python3 scripts/compose-store-assets.py   # frames them into listing/play/*.png
```

The copy below deliberately claims only what `src/engine/` actually computes. Play's health-app
policy and the app's own honesty rule point the same way: no diagnosis, no treatment, no promised
outcome, and no number the app cannot show its working for.

---

## App details

| Field | Value |
| --- | --- |
| App name (30 max) | `Somno: Sleep Debt & Alertness` (29) |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free |
| Category | Health & Fitness |
| Tags | Sleep, Personal wellness, Habit tracking |
| Contact email | support@somno.app |
| Website | https://somno.app |
| Privacy policy | https://somno.app/privacy |
| Account deletion URL | https://somno.app/delete-account |

## Short description (80 max)

```
Measure how tired you actually are — a 30-second test, scored against you.
```

(74 characters. The em dash counts as one; Play counts UTF-16 code units, not bytes.)

## Full description (4000 max)

```
Most sleep apps tell you how long you were in bed. Somno measures something harder and more
useful: how much that night is costing you right now.

A check-in takes about thirty seconds.

• A reaction-time test. Somno uses the psychomotor vigilance task, the measure sleep laboratories
  have used for forty years, because reaction speed and lapses in attention are the best-studied
  consequences of sleep loss. Your score is compared against your own baseline, not a population
  average — and that baseline sharpens with every test you take.

• An optional face scan. The front camera finds your face, locates your eyes within it, and
  measures the light around them, your skin colour and how steadily you hold the phone. It runs
  entirely on your device and no photograph is ever saved or sent — the scan keeps numbers only.

• How sleepy you say you feel, on the Karolinska scale.

Somno fuses whatever signals it got into one Sleep Deprivation Index, and always shows you how many
signals went into it and how confident the result is. Fewer signals means a wider margin, and it
says so.

WHAT YOU GET

Sleep debt, split properly. Not one number but three: lost wake time, lost deep sleep and lost REM
recover at different speeds, so they are tracked separately and repaid separately.

A recovery plan for tonight. Somno models your night as a sequence of sleep stages and works out
what a realistic bedtime can actually repair — including the honest answer that one good night
will not clear a week of short ones.

A smart alarm. Set a wake time and Somno looks for a moment of light sleep in the half hour before
it, so you wake between cycles instead of out of deep sleep. It can also ask you to pass a short
reaction test before the alarm will stop.

Your day ahead. A curve built from the three-process model of alertness — the homeostatic pressure
that builds while you are awake, your circadian rhythm, and the fog in the first hour after waking
— showing when you will be sharpest and when you should not be making decisions.

A weekly review that names one thing to change, drawn from your own week rather than a list of
generic sleep hygiene tips.

PRIVACY

Somno works completely offline and without an account. Nothing is uploaded unless you sign in, and
signing in is only there so your history survives a new phone.

No photograph is ever stored or transmitted. The face scan produces five numbers and discards the
image. There is no advertising, no analytics SDK, no third-party tracker, and no crash reporter
quietly shipping your data somewhere. Your history is excluded from Android's automatic backups.
Everything can be exported as CSV and JSON, and deleting your account deletes the server copy.

WHAT SOMNO IS NOT

It is not a medical device and it does not diagnose anything. It cannot detect sleep apnoea,
insomnia, narcolepsy or any other disorder, and it does not measure your sleep while you sleep —
you tell it when you slept. If something feels wrong with your sleep, talk to a clinician, and take
the export with you.

It also will not tell you that you are fine to drive. No app can.
```

## What's new (500 max) — 1.0.0

```
First release.

• A 30-second check-in: reaction-time test, optional on-device face scan, and how sleepy you feel.
• Sleep debt tracked as wake, NREM and REM separately.
• Recovery plans and a smart alarm that looks for light sleep before your wake time.
• Your day-ahead alertness curve and a weekly review.
• Works offline with no account. Export or delete everything, any time.
```

## Graphics

| Asset | File | Size |
| --- | --- | --- |
| App icon | `listing/play/icon-512.png` | 512×512 |
| Feature graphic | `listing/play/feature-graphic.png` | 1024×500 |
| Phone screenshots (8) | `listing/play/{home,pvt,result,recovery,trends,week,alarms,how-it-works}.png` | 1080×1920 |

Play requires 2–8 phone screenshots between 320px and 3840px with an aspect ratio no more extreme
than 2:1. A modern phone screen is about 2.16:1 and would be rejected on its own, which is why each
screen is composed onto a 1080×1920 board rather than uploaded raw.

Tablet screenshots are not supplied: the app is phone-only by layout, and Play does not require
them unless the listing opts into tablet distribution.

**The screenshots contain invented data.** Three weeks of a plausible sleeper is seeded before
capture (see `scripts/store-assets.cjs`) because a fresh install photographs as a set of empty
states. No figure in them is a promise, and none of them shows a real person's night.

## Content rating questionnaire

| Question | Answer |
| --- | --- |
| Category | Utility, Productivity, Communication or Other |
| Violence, sexuality, profanity, controlled substances | None |
| User-generated content or sharing | No |
| Does the app share user location | No |
| Digital purchases | No |
| Does the app collect personal information | Yes — email address and health data, only when the user creates an account |

Expected outcome: rated for everyone / PEGI 3.

## Target audience

**16 and over.** Not directed at children, so the app is out of scope for the Families policy and
the Play Console's "designed for families" programme.

This has to match three other places or the declaration is false: the age floor the app enforces
(`MIN_AGE` in `src/engine/debt.ts`, which is the slider's minimum), and the minimum age stated in
`legal/privacy.md` and `legal/terms.md`. It previously read 18 here, 16 in both legal documents, and
12 in onboarding.

## Data safety

The full form — every collected type, whether it is shared, whether it is optional, and the
deletion route — is written out in `PLAY_STORE.md §4`. It has to match the published privacy policy
word for word or the listing is rejected on review.

## Before this can go live

Things only the account owner can do:

1. Publish the three pages at `somno.app`: `/privacy`, `/terms`, `/delete-account` (see
   `src/lib/legal.ts` for the exact URLs the app opens).
2. Create the Play Console app, upload the AAB, and complete the Data safety and content rating
   forms with the answers above.
3. Add the release keystore's SHA-1 to the Supabase Google provider and the Google Cloud OAuth
   client, or Google sign-in will fail on the released build while working in development
   (`PLAY_STORE.md §2`).
4. Point `support@somno.app` at a mailbox someone reads — the in-app Send button opens a mail
   composer addressed to it.
