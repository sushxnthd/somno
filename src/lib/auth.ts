import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Every way into an account, behind one interface.
 *
 * Screens never touch `supabase.auth` directly. That matters for two reasons: the sign-in methods
 * differ wildly in mechanism (a password round-trip, a native Google sheet, an Apple entitlement)
 * but should be identical to call, and Apple is deliberately not wired yet — keeping it a real
 * provider that reports `coming-soon` means enabling it later is a change inside this file, not a
 * change to the sign-in screen.
 */

export type AuthOutcome =
  | { status: 'ok'; session: Session | null }
  /** Signed up, but the account needs an emailed code confirmed before there's a session. */
  | { status: 'needs-verification' }
  /** The provider exists in the UI but is intentionally not live yet. */
  | { status: 'coming-soon'; message: string }
  /** The user backed out of a native sheet or browser flow. Not an error — say nothing. */
  | { status: 'cancelled' }
  /** Supabase isn't configured, so accounts are unavailable; the app still works locally. */
  | { status: 'unconfigured' }
  | { status: 'error'; message: string };

const unconfigured = (): AuthOutcome => ({ status: 'unconfigured' });

function toMessage(e: unknown): string {
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return 'Something went wrong. Please try again.';
}

// ---------------------------------------------------------------------------
// email + password
// ---------------------------------------------------------------------------

export async function signUpWithEmail(email: string, password: string): Promise<AuthOutcome> {
  if (!isSupabaseConfigured) return unconfigured();
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { status: 'error', message: error.message };
    // With email confirmation on, signUp returns a user but no session until the code is entered.
    if (!data.session) return { status: 'needs-verification' };
    return { status: 'ok', session: data.session };
  } catch (e) {
    return { status: 'error', message: toMessage(e) };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthOutcome> {
  if (!isSupabaseConfigured) return unconfigured();
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', session: data.session };
  } catch (e) {
    return { status: 'error', message: toMessage(e) };
  }
}

export async function verifyEmailCode(email: string, token: string): Promise<AuthOutcome> {
  if (!isSupabaseConfigured) return unconfigured();
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', session: data.session };
  } catch (e) {
    return { status: 'error', message: toMessage(e) };
  }
}

/**
 * Starts a password reset.
 *
 * Supabase's recovery email carries both a link and a `{{ .Token }}` code. This app uses the code,
 * because the link opens a browser and a phone-only app has nowhere sensible to send someone from
 * there. The six-digit screen already exists for signup, so recovery reuses it.
 */
export async function sendPasswordReset(email: string): Promise<AuthOutcome> {
  if (!isSupabaseConfigured) return unconfigured();
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', session: null };
  } catch (e) {
    return { status: 'error', message: toMessage(e) };
  }
}

/** Sends the signup confirmation code again. Supabase rate-limits this server-side as well. */
export async function resendSignupCode(email: string): Promise<AuthOutcome> {
  if (!isSupabaseConfigured) return unconfigured();
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', session: null };
  } catch (e) {
    return { status: 'error', message: toMessage(e) };
  }
}

/** Confirms a recovery code. On success there is a session, which is what allows a new password. */
export async function verifyRecoveryCode(email: string, token: string): Promise<AuthOutcome> {
  if (!isSupabaseConfigured) return unconfigured();
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', session: data.session };
  } catch (e) {
    return { status: 'error', message: toMessage(e) };
  }
}

/** Sets a new password on the current session. Only reachable straight after a verified code. */
export async function updatePassword(password: string): Promise<AuthOutcome> {
  if (!isSupabaseConfigured) return unconfigured();
  try {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', session: data.user ? await getSession() : null };
  } catch (e) {
    return { status: 'error', message: toMessage(e) };
  }
}

/**
 * Changes the signed-in account's email address.
 *
 * Settings → Account → "Change email" used to navigate to AU2, the *signup* screen. Someone trying
 * to move their account to a new address was offered a form to create a second one — and if they
 * filled it in they got exactly that, a new empty account, with their history left behind on the
 * old address they were trying to leave.
 *
 * Supabase sends a confirmation link to the new address and does not switch until it is followed,
 * which is why this returns 'pending' rather than 'ok': the caller has to say "check your email"
 * instead of showing the new address as though it were already live.
 */
export async function changeEmail(email: string): Promise<AuthOutcome | { status: 'pending'; message: string }> {
  if (!isSupabaseConfigured) return unconfigured();
  const next = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) {
    return { status: 'error', message: 'That does not look like an email address.' };
  }
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { status: 'error', message: 'Sign in before changing your email.' };
    if (data.session.user.email?.toLowerCase() === next) {
      return { status: 'error', message: 'That is already your email address.' };
    }
    const { error } = await supabase.auth.updateUser({ email: next });
    if (error) return { status: 'error', message: error.message };
    return { status: 'pending', message: `Confirm the change from the link sent to ${next}. Until then your old address still signs you in.` };
  } catch (e) {
    return { status: 'error', message: toMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

/**
 * The native module is loaded lazily and defensively. It ships no JS-only fallback, so it simply
 * does not exist in Expo Go — and a missing module must produce a clear message rather than a red
 * screen, because email sign-in still works there and the rest of the app must stay usable.
 */
type GoogleModule = typeof import('@react-native-google-signin/google-signin');
let googleModule: GoogleModule | null | undefined;

function loadGoogle(): GoogleModule | null {
  if (googleModule !== undefined) return googleModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    googleModule = require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    googleModule = null;
  }
  return googleModule;
}

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

let googleConfigured = false;
function configureGoogle(mod: GoogleModule): void {
  if (googleConfigured) return;
  mod.GoogleSignin.configure({
    // Supabase validates the ID token's audience against the WEB client, even on a phone — the
    // platform client ID only identifies the app to Google. Both are needed.
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });
  googleConfigured = true;
}

export const isGoogleAvailable = (): boolean => loadGoogle() !== null && Boolean(GOOGLE_WEB_CLIENT_ID);

export async function signInWithGoogle(): Promise<AuthOutcome> {
  if (!isSupabaseConfigured) return unconfigured();
  const mod = loadGoogle();
  if (!mod) {
    return {
      status: 'error',
      message: 'Google sign-in needs a development build of the app. Use email for now.',
    };
  }
  if (!GOOGLE_WEB_CLIENT_ID) {
    return { status: 'error', message: 'Google sign-in is not configured yet.' };
  }
  try {
    configureGoogle(mod);
    if (Platform.OS === 'android') await mod.GoogleSignin.hasPlayServices();
    const result = await mod.GoogleSignin.signIn();
    // v13+ returns a discriminated result; older shapes put the token at the top level.
    const idToken =
      (result as { data?: { idToken?: string | null } }).data?.idToken ??
      (result as { idToken?: string | null }).idToken ??
      null;
    if (!idToken) return { status: 'cancelled' };

    const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) return { status: 'error', message: error.message };
    return { status: 'ok', session: data.session };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    // The user dismissing the account sheet is a normal outcome, not a failure to report.
    if (code === 'SIGN_IN_CANCELLED' || code === '-5' || code === '12501') return { status: 'cancelled' };
    return { status: 'error', message: toMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Apple — a real provider slot, deliberately not live yet
// ---------------------------------------------------------------------------

/**
 * Sign in with Apple is present in the UI but not wired.
 *
 * When it is enabled, everything needed lives here: request the credential with
 * `expo-apple-authentication`, then hand its `identityToken` to
 * `supabase.auth.signInWithIdToken({ provider: 'apple', token })` — the same shape as Google
 * above. The sign-in screen calls this function either way and does not change.
 *
 * Note for release: Apple requires Sign in with Apple to be offered wherever another third-party
 * sign-in is (App Store guideline 4.8), so iOS submission is blocked until this is live.
 */
export const APPLE_COMING_SOON = 'Sign in with Apple is coming soon. Use Google or email for now.';

export async function signInWithApple(): Promise<AuthOutcome> {
  return { status: 'coming-soon', message: APPLE_COMING_SOON };
}

/** Whether Apple sign-in is live. Drives the button's visual state, not its presence. */
export const isAppleEnabled = false;

// ---------------------------------------------------------------------------
// session
// ---------------------------------------------------------------------------

export async function getSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const mod = loadGoogle();
  // Sign out of Google too, or the next sign-in silently reuses the same account with no chooser.
  if (mod && googleConfigured) await mod.GoogleSignin.signOut().catch(() => {});
  await supabase.auth.signOut().catch(() => {});
}

/**
 * Deletes the account itself, not just its contents.
 *
 * Play policy and App Store guideline 5.1.1(v) both require this to be reachable from inside the
 * app, and to actually remove the account rather than deactivate it. The anon key cannot touch
 * `auth.users`, so the work happens in the `delete_own_account()` function in schema.sql, which
 * derives the id from `auth.uid()` and cascades every table.
 *
 * Local data is the caller's job — see the store's `wipeLocalData`. Both have to happen, and the
 * local wipe has to happen even when there is no account at all, because someone who never signed
 * up still has everything on the device.
 */
export async function deleteAccount(): Promise<AuthOutcome> {
  if (!isSupabaseConfigured) return unconfigured();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { status: 'ok', session: null }; // nothing on the server to delete
  try {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) return { status: 'error', message: error.message };
    await signOut();
    return { status: 'ok', session: null };
  } catch (e) {
    return { status: 'error', message: toMessage(e) };
  }
}

/**
 * Which auth events matter to the app, as Supabase names them.
 *
 * The event is passed through rather than swallowed because a null session is ambiguous and the
 * event is not. `SIGNED_OUT` means the session is genuinely gone — the user signed out, an admin
 * revoked it, the account was deleted, the refresh token was reused elsewhere. A null session on
 * any *other* event means Supabase could not refresh right now, which on a phone usually means a
 * tunnel. Treating the second as the first logs people out of their own app on a bad train.
 */
export type AuthEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'
  | (string & {});

export function onAuthStateChange(fn: (session: Session | null, event: AuthEvent) => void): () => void {
  if (!isSupabaseConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => fn(session, event));
  return () => data.subscription.unsubscribe();
}
