# Somno — Privacy Policy

**Last updated: 16 August 2026**

This policy describes what Somno collects, where it goes, and how to get rid of it. It is written
against the code rather than from a template: every claim below corresponds to something in the
app's source, and the file that implements it is named so you can check.

Somno is operated by **[YOUR LEGAL NAME OR COMPANY]**, contactable at **support@somno.app**.

> **Before publishing:** replace the operator name above, and the contact address if you use a
> different one. The address here, the one in the Play Console listing, and `SUPPORT_EMAIL` in
> `src/lib/legal.ts` must all be the same, and it must be an address you actually read.

---

## The short version

- Somno works completely without an account. If you never sign in, **nothing leaves your phone**.
- Signing in is optional, and only exists so your history survives a new phone.
- The face scan **never uploads or stores a photograph**. It measures the camera frames while they
  are in memory and keeps only the resulting numbers.
- There is no advertising, no analytics SDK, no crash-reporting service, and nothing is sold or
  shared with anyone.
- You can export everything, and you can delete everything, from inside the app.

---

## What Somno stores on your phone

All of this is held in the app's own storage on your device and is removed when you uninstall it.

| What | Why |
| --- | --- |
| Your check-ins — time, reaction-time statistics, face-scan measurements, your own sleepiness rating, and the resulting alertness score | The app's entire purpose is comparing you with yourself over time |
| Nights you log — date, bedtime, wake time, duration, how rested you felt | Sleep debt and the recovery model are computed from these |
| Your reaction-time baseline and your facial baseline | Every later reading is scored against them |
| Alarms, and a record of each time one fired and how it ended | So the snooze cap is auditable, and so an alarm survives a reboot |
| Your profile — age, and optionally gender, medication category and whether you are under sustained stress | These change the sleep-stage model's parameters. All are optional except age |
| Settings, and a log of which permissions you granted or revoked | So consent is a record rather than an assumption |
| A local fault log of app errors | So a crash can be diagnosed. It is never sent anywhere automatically |

Android's automatic cloud backup is **switched off** for this app (`allowBackup: false` in
`app.json`), so your sleep history is not copied to your Google account behind your back.

---

## The face scan

This is the part most worth being precise about.

When you run a scan, the app opens the front camera and captures a short series of frames over about
six seconds. Each frame is measured **in memory, on your device**: overall brightness, redness in the
cheek area, how dark the eye region is compared with the cheeks, how much fine detail is in the eye
band, and how much the image moves between frames. Those measurements become a handful of numbers.

**The frames themselves are not uploaded, and not stored.** The most recent scan may keep a single
image file in the app's private cache so the result screen can show you what it looked at; that file
lives only on your device, is replaced by the next scan, and is deleted when you delete your data or
uninstall the app. Its file path is explicitly excluded from anything that syncs — see the comment
at `src/lib/sync.ts:107`.

Somno does not perform facial recognition, does not build a face template that could identify you,
and cannot match you against any other person or database. The "facial baseline" it keeps is a
running average and spread of the numbers above — enough to notice that your eye region is darker
than your own usual, and nothing that could be used to find you.

The camera is used only while a scan is on screen.

---

## What leaves your phone, and only if you sign in

Creating an account is optional and the app is fully functional without one. If you do sign in, the
following is stored in the app's backend (Supabase) so it can be restored on another device:

- **Your email address**, for the account itself.
- **Your display name**, if you signed in with Google and it provided one.
- **Your check-ins** — timestamps, reaction-time statistics, face-scan measurements, your ratings
  and the computed scores.
- **Nights you have logged.**
- **Your baselines, alarms, alarm events, sleep-debt history and consent log.**

Everything is sent over HTTPS. Each row is tied to your account by database row-level security
policies (`supabase/schema.sql`), so one account cannot read another's data.

**Not sent, ever:** camera frames, any image file, the face photo's path, or your local fault log.

If you never sign in, none of this happens and there is no account to describe.

---

## Who else sees it

Nobody, in the sense that matters: your sleep data is not sold, rented, shared with advertisers, or
used to train anything.

Two service providers are unavoidably involved when you choose to use the features that need them:

- **Supabase** hosts the database and handles authentication, and therefore processes the data above
  on our behalf. It is a processor, not a recipient of data for its own purposes.
- **Google Sign-In**, only if you choose that button. Google tells the app your email address and
  name; the app tells Google nothing about your sleep.

There is no analytics SDK, no advertising SDK, and no crash-reporting SDK in the app. Nothing is
transmitted in the background other than the sync described above.

---

## Legal basis and where data is held

Where the GDPR or UK GDPR applies, the basis for processing is **your consent**, given when you
create an account, and **performance of a contract** for operating the account itself. You may
withdraw consent at any time by deleting your account, which deletes the data.

Data is held in the region chosen for the Supabase project.

---

## Your rights

- **See it.** Settings → Data & privacy → Export exports your entire history as CSV and JSON.
- **Correct it.** Sleep entries can be re-logged; profile details can be edited in Settings.
- **Delete it.** See below. Deletion is immediate and is not a request queued for review.
- **Take it with you.** The export is plain CSV and JSON, not a proprietary format.

Where the GDPR, UK GDPR, CCPA or a similar law applies, you also have the right to complain to your
data protection authority.

---

## Deleting your data

**Inside the app:** Settings → Data & privacy → Delete. You will be asked to confirm, because it
cannot be undone. This removes every row belonging to your account from the backend and wipes the
app's storage on the device — including alarms, which are also cancelled at the system level so a
deleted account cannot ring a phone.

**Without the app:** if you have already uninstalled it, email **support@somno.app** from the
address you signed up with, or use the form at **https://somno.app/delete-account**. Deletion is
completed within 30 days and normally within one working day.

Uninstalling the app removes everything held on the device. If you had an account, the account is
not deleted by uninstalling — use one of the two routes above.

---

## Children

Somno is not directed at children and is not intended for anyone under 16. It is rated for a general
audience and collects no data from children knowingly. If you believe a child has created an
account, contact **support@somno.app** and it will be removed.

---

## Somno is not a medical device

Somno estimates alertness and sleep debt from a reaction-time task, a camera-based measurement and
your own ratings. It is a wellness tool. It does not diagnose, treat, cure or prevent any condition,
it is not a substitute for medical advice, and its readings are not clinically validated.

Do not use it to decide whether you are fit to drive, operate machinery, or do anything else where
being wrong is dangerous. If you are persistently sleepy, or you suspect a sleep disorder such as
sleep apnoea or insomnia, see a doctor.

---

## Changes

If this policy changes materially, the app will say so before the change takes effect, and the date
at the top will be updated.

---

## Contact

**support@somno.app**
