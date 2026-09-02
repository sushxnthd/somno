import type { Session } from '@supabase/supabase-js';
import { useSomnoStore } from '../store/useSomnoStore';
import { getSession, onAuthStateChange } from './auth';
import { syncNow, whenHydrated } from './sync';

/**
 * Copies whatever the session says about the user into the store.
 *
 * Everything that knows who is signed in reads these two fields, so this is the single place that
 * writes them from an authoritative source. Deliberately additive: a field is only overwritten when
 * the session actually carries a value, because Google supplies a name and email signup does not,
 * and a blank arriving from one provider must not erase what another already established.
 */
function mirrorSession(session: Session | null): void {
  const email = session?.user.email;
  if (email) useSomnoStore.getState().setEmail(email);
  const meta = session?.user.user_metadata as { full_name?: string; name?: string } | undefined;
  const name = meta?.full_name ?? meta?.name;
  if (name) useSomnoStore.getState().setDisplayName(String(name).split(' ')[0]);
}

/**
 * Takes ownership of the device for this session, then writes the session's identity.
 *
 * The two steps are one function because the order between them is load-bearing and was wrong in
 * both places that used to do it by hand.
 *
 * `claimDataFor` wipes the device when it finds it belongs to a *different* user, and a wipe resets
 * identity along with everything else — so mirroring first meant the new account's email and name
 * were written and then immediately erased by the wipe that followed. Signing out of A and into B
 * on the same phone left B looking signed out: no address on the Account screen, no name on Home,
 * with a valid session behind it. Nothing surfaced the contradiction, and the next sync pushed
 * whatever was on screen.
 *
 * Claiming first also means the wipe happens while there is nothing of B's to lose, which is the
 * same reason it has to happen before `syncNow`.
 *
 * Waiting for hydration is part of the same ordering. `claimDataFor` compares against the persisted
 * `dataOwnerId`, and before the store comes off disk that field is still its default — so a claim
 * made too early writes an owner onto empty state, hydration replaces it a moment later, and the one
 * case the check exists for passes without the wipe.
 */
async function adoptSession(session: Session): Promise<void> {
  await whenHydrated();
  await useSomnoStore.getState().claimDataFor(session.user.id);
  mirrorSession(session);
}

/**
 * What happens between "the session exists" and "the app shows a screen".
 *
 * The account is pulled down *before* deciding where to land, and that ordering is the whole
 * point: on a new phone the store is empty, so routing first would send a user with months of
 * history back through consent and PVT calibration. Restoring first means `completeSignIn` sees
 * the baseline the account already holds and lands them on Home.
 *
 * A failed sync is not a failed sign-in. `syncNow` never throws and reports its outcome; the user
 * is signed in either way, and the next sync carries whatever this one missed.
 */
export async function finishSignIn(): Promise<void> {
  const session = await getSession();

  /**
   * Claim the device, then adopt the identity — and both before syncing, never after.
   *
   * `syncNow` merges local into remote and pushes the result up, so by the time it has run it is
   * too late: the previous account's history is already in this one. Claiming first wipes a device
   * that belonged to somebody else, leaving the merge nothing of theirs to carry across.
   *
   * The identity write is inside `adoptSession` rather than here, because a wipe resets identity
   * too — see the note there. It also covers Google and Apple, which never pass through the email
   * field, so without it the Account screen would show a blank address for exactly the users who
   * never typed one.
   */
  if (session?.user.id) await adoptSession(session);
  else mirrorSession(session);

  // The address typed into a sign-in or recovery form has done its job. Clearing it here keeps it
  // from being mistaken later for the account's own address — which is what `email` now means.
  useSomnoStore.getState().setAuthEmail('');

  await syncNow();
  useSomnoStore.getState().completeSignIn();
}

/**
 * Keeps the signed-in identity in step with Supabase, for the whole life of the app.
 *
 * `onAuthStateChange` existed and nothing subscribed to it, so the store's idea of who was signed
 * in was written exactly once, by `finishSignIn`, and never revisited. The visible consequence was
 * the change-email flow: Supabase only switches the address when the confirmation link is opened,
 * which by design happens *after* — often on a different device — so the Account screen went on
 * showing the old address indefinitely, and a user who had successfully changed their email had no
 * way to tell from inside the app. The same gap covered a name changed at the provider and a session
 * that came back belonging to somebody else.
 *
 * Every event is mirrored rather than a chosen few: `USER_UPDATED` is the email confirmation,
 * `TOKEN_REFRESHED` carries a fresh user record roughly hourly, and both are cheap to apply.
 *
 * A null session is only treated as a sign-out when the event says so. `SIGNED_OUT` is a decision —
 * by the user, an admin, or a token reuse — and clears the identity. A null arriving on any other
 * event is Supabase failing to refresh, and blanking someone's account screen because their train
 * went into a tunnel is a worse error than showing it a minute stale.
 */
export function initAuthSync(): () => void {
  return onAuthStateChange((session, event) => {
    /**
     * A real sign-out, told apart from a bad connection by the event rather than by the null.
     *
     * `SIGNED_OUT` is what Supabase emits when the session is genuinely gone — the user signed out,
     * an admin revoked it, the account was deleted, the refresh token was reused somewhere else.
     * This used to be indistinguishable from a refresh that failed in a tunnel, because both arrive
     * with `session: null` and the event was thrown away, so the safe choice was to ignore both.
     * That left the Account screen and the home greeting showing a person who was no longer signed
     * in, with the app confidently syncing nothing.
     *
     * Only the identity goes. The history is the user's, it lives on this device, and the app works
     * without an account at all — see `clearAccountIdentity` for why the ownership marker stays too.
     */
    if (event === 'SIGNED_OUT') {
      useSomnoStore.getState().clearAccountIdentity();
      return;
    }
    // Any other event arriving without a session is Supabase failing to refresh, not a decision.
    if (!session) return;
    /**
     * The same claim-then-identify order as a fresh sign-in, and for the same reason.
     *
     * This path used to mirror the session immediately and claim ownership later, which is the
     * ordering the wipe destroys: a session arriving for a user this device does not belong to had
     * its email and name written and then erased by the claim that followed. `claimDataFor` is a
     * no-op when the id already matches, which is what every ordinary event here is.
     */
    void adoptSession(session);
  });
}
