# Backend setup

Everything in this file is a step only you can take — it needs accounts and consoles I don't have.
The app itself is finished on this side: with none of it done, Somno still runs entirely on-device
(that is the `unconfigured` path, and every screen handles it), and each step below switches on one
more thing.

Nothing here needs the `service_role` key. The app never uses it, and it bypasses every RLS policy
in `schema.sql`, so it should not be pasted into `.env`, into a chat, or into the client at all.

---

## 1. Supabase project (enables accounts + sync)

1. Create a project at supabase.com.
2. **Project Settings → API** gives you two values. Put them in `.env` at the repo root (copy
   `.env.example`):

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<the anon / public key>
   ```

3. **SQL Editor →** paste `supabase/schema.sql` and run it. It is idempotent, so re-running after a
   change is safe.

That is enough for email accounts and two-way sync.

### Both emails need to carry a code, not a link

The app's AU3 screen asks for **six digits**. Supabase's default "Confirm signup" email sends a
*link* instead, and a link cannot be typed into that screen — so edit the template:

**Authentication → Emails → Confirm signup**, and make sure the body contains `{{ .Token }}`
(the six-digit code), e.g.

```html
<p>Your Somno code is <strong>{{ .Token }}</strong>. It expires in an hour.</p>
```

If you would rather not have a confirmation step at all, turn off **Confirm email** under
Authentication → Providers → Email. The app handles that too: signup returns a session
immediately and skips AU3.

The **Reset password** template needs the same treatment, for the same reason — password reset now
runs entirely inside the app (code, then a new-password screen) rather than sending someone to a
browser:

```html
<p>Your Somno reset code is <strong>{{ .Token }}</strong>.</p>
```

---

## 2. Google sign-in (enables the "Continue with Google" button)

In **Google Cloud Console → APIs & Services → Credentials**, create three OAuth clients under one
project:

| Type    | What to enter                                                      |
| ------- | ------------------------------------------------------------------ |
| iOS     | Bundle ID `com.somno.app` — already created, ID is in `.env.example` |
| Android | Package `com.somno.app` + the SHA-1 of the key EAS signs with (`eas credentials`) |
| Web     | No origins needed; this one exists so a token has an audience to be validated against |

Then:

1. `.env`: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<the WEB client id>`. This one is not optional — Supabase
   validates the ID token's audience against the *web* client even when the user is on a phone, so
   leaving it blank makes every Google sign-in fail with an audience mismatch.
2. **Supabase → Authentication → Providers → Google**: enable it, paste the same web client ID and
   its client secret. Add the iOS and Android client IDs to "Authorized Client IDs".
3. `app.json` already carries the iOS client's reversed form as `iosUrlScheme`. If you ever change
   the iOS client, change it there too — a config plugin cannot read `.env`.

**Google sign-in needs a development build.** The native module does not exist in Expo Go, where the
button reports that instead of crashing:

```
npx expo prebuild --clean
npx expo run:ios      # or: eas build --profile development --platform ios
```

---

## 3. Sign in with Apple — deliberately not live

The button is present and visually identical to the others; tapping it says "coming soon". It is a
real provider in `src/lib/auth.ts` that currently returns `{ status: 'coming-soon' }`, so switching
it on is a change inside that one file: request the credential with `expo-apple-authentication`,
hand its `identityToken` to `supabase.auth.signInWithIdToken({ provider: 'apple', token })`, and set
`isAppleEnabled = true`. No screen changes.

**This blocks an iOS App Store release.** Guideline 4.8 requires Sign in with Apple wherever another
third-party sign-in is offered, and Google is offered. TestFlight and Android are unaffected.

---

## What is wired, and what is not

Working once the steps above are done:

- Email signup, six-digit confirmation, sign-in, sign-out.
- Google sign-in (development build only).
- Two-way sync: check-ins, PVT results, facial *scores*, sleep logs and baselines push as they are
  made, and pull down on sign-in, on launch, and from Settings → Account → **Restore from another
  device**. Merge rules are in `src/lib/merge.ts` and tested by `npm run test:merge`.
- Signing in on a second device restores history *before* routing, so a returning account lands on
  Home rather than being walked through onboarding again.

- Password reset, end to end and inside the app: a six-digit code, then a new-password screen.
- Account deletion, via the `delete_own_account()` function at the end of `schema.sql`. It runs as
  its owner because the anon key cannot touch `auth.users`, and it derives the id from `auth.uid()`
  so it can only ever delete the caller's own account.
- The facial baseline syncs too, as numbers on `baseline_profiles.facial_feature_baseline`, so a
  new phone can score a face scan immediately instead of spending three scans relearning.
- The rest of the spec's model is now written as well as declared: the profile row (coarse — an age
  *band*, a medication *category*), alarm configs, alarm events with how each one ended, daily
  sleep-debt snapshots, and the append-only consent log.

Known gaps, called out rather than half-built:

- **Health Connect import is not built.** It is v1.5 in the spec's own sequencing, and the app says
  so where the toggle used to be.
- **Billing does not exist**, so neither does the paywall — nothing in the app is gated, and no
  screen claims otherwise.
- **Face images never sync, by design.** `facial_scan_results` stores derived numbers only; the
  photo stays on the device that took it, which is why a new phone re-derives from the baseline
  rather than re-scoring old scans.

---

## Verifying it works

I could not run any of this against a live project — the sandbox has no route to Supabase — so the
first real signup is yours. Worth checking, in order:

1. Sign up with an email. You should get a code, and entering it should land you in onboarding.
2. Table Editor → `check_ins` should gain a row after one check-in.
3. Sign out, sign back in — Settings → Account → Restore from another device should report the
   counts back to you.
4. Best test of all: install on a second device, sign in, and confirm the history is there.

Locally, without any of the above: `npx tsc --noEmit`, `npm test` (merge + face-scan checks) and
`npm run e2e` (with `npx expo start --web --port 8098` running) all pass.

For the Play listing itself — data safety answers, the permission declarations, the deletion URL —
see `PLAY_STORE.md`.
