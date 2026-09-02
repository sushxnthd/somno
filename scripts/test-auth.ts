import { code } from './_source.ts';

/**
 * How account identity is wired, checked against the source.
 *
 * Everything here is about one distinction that the code did not used to make: the address *typed
 * into a form* and the address that *is the account*. They were one field, and the two bugs that
 * produced are the reason this file exists.
 *
 * Both are structural rather than computational — there is no function to call that returns the
 * wrong number, only a screen bound to the wrong field and a subscription nobody made. So they are
 * checked where they live. The flows themselves are walked with real clicks in e2e/journeys.cjs.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

/** Source with comments stripped, so a check cannot pass on the prose describing the bug. */

const store = code('src/store/useSomnoStore.ts');
const types = code('src/store/types.ts');
const flow = code('src/lib/signInFlow.ts');
const auth = code('src/lib/auth.ts');
const app = code('App.tsx');
const AU2 = code('src/screens/auth/AU2Screen.tsx');
const AU3 = code('src/screens/auth/AU3Screen.tsx');
const AU4 = code('src/screens/auth/AU4Screen.tsx');
const F9 = code('src/screens/settings/F9Screen.tsx');
const F9E = code('src/screens/settings/F9EScreen.tsx');

{
  console.log('a typed address is not an identity');
  /**
   * The bug: AU4 — "Reset your password", reachable from Settings while signed in — bound its text
   * field straight to the store's `email`. Typing a different address to send a reset link to
   * therefore renamed the signed-in account everywhere in the app, with no authentication of any
   * kind having happened. The Account screen showed the new address as though it were the account's.
   */
  check('there are two fields, not one', /\bauthEmail: string;/.test(types) && /\bemail: string;/.test(types));
  check('and two setters', /setAuthEmail: \(v\) => set\(\{ authEmail: v \}\)/.test(store) && /setEmail: \(v\) => set\(\{ email: v \}\)/.test(store));

  for (const [name, source] of [['AU2', AU2], ['AU3', AU3], ['AU4', AU4]] as const) {
    check(`${name} reads the form field`, /s\.authEmail/.test(source), source.match(/.*s\.email.*/)?.[0]);
    check(`${name} never reads the account's identity`, !/\(s\) => s\.email\b/.test(source), source.match(/.*\(s\) => s\.email\b.*/)?.[0]);
    if (/onChangeText/.test(source)) {
      check(`${name} never writes it either`, !/s\.setEmail\b/.test(source), source.match(/.*s\.setEmail\b.*/)?.[0]);
    }
  }

  // The signed-in identity is written from a session and nowhere else.
  check('only the sign-in flow sets the account address', /setEmail\(/.test(flow));
  check('from the session, not from a field', /session\?\.user\.email/.test(flow));
  check('and the form field is cleared once a session exists', /setAuthEmail\(''\)/.test(flow));

  // Settings still shows the account, and prefills the form with it as a convenience.
  check('Settings shows the account address', /\(s\) => s\.email\b/.test(F9));
  check('and prefills the recovery form rather than binding to it', /setAuthEmail\(email\)/.test(F9));

  // Change-email keeps the new address local until Supabase confirms it.
  check('the change-email screen holds the new address in local state', /useState\(''\)/.test(F9E));
  check('and does not write it into the store', !/setEmail\(/.test(F9E), F9E.match(/.*setEmail\(.*/)?.[0]);
  check('reporting the change as pending, not done', /'pending'/.test(F9E) && /'pending'/.test(auth));
}

{
  console.log('\nthe app follows Supabase, not just the moment of sign-in');
  /**
   * `onAuthStateChange` was exported and nothing subscribed. The store's idea of who was signed in
   * was written once by `finishSignIn` and never revisited — so a confirmed email change, which by
   * design lands after the fact and often on another device, never reached the app at all. The user
   * changed their email successfully and the app went on showing the old one indefinitely.
   */
  check('there is a subscription', /export function initAuthSync/.test(flow));
  check('to the auth-state stream', /onAuthStateChange\(/.test(flow));
  check('and the app starts it', /initAuthSync\(\)/.test(app));
  check('and stops it on teardown', /unsubAuth\(\)/.test(app));

  // Every event goes through the one function that gets the claim-then-identify order right; the
  // ordering itself is checked in the block below.
  const body = flow.split('export function initAuthSync')[1] ?? '';
  check('every event adopts the session', /adoptSession\(session\)/.test(body), body.trim().slice(0, 200));
  /**
   * A null session must not be read as a sign-out. It also arrives from a token refresh that failed
   * on a bad connection, and blanking someone's account screen for that is worse than a stale one;
   * deliberate sign-out is handled by the store, which clears its own identity.
   */
  check('a null session is ignored rather than treated as a sign-out', /if \(!session\) return;/.test(body));

  // mirrorSession is additive: providers differ in what they supply, and a blank from one must not
  // erase what another established.
  const mirror = flow.split('function mirrorSession')[1]?.split('\n}')[0] ?? '';
  check('the email is only written when there is one', /if \(email\)/.test(mirror));
  check('and the name likewise', /if \(name\)/.test(mirror));

  /**
   * Signing out takes the whole identity, not just the address.
   *
   * `displayName` is persisted and is only ever written from a session, so leaving it behind had
   * the phone greeting the person who signed out — by name, on Home, above an Account screen
   * reading "Not signed in".
   */
  const out = store.split('signOut: () => {')[1]?.split('},')[0] ?? '';
  check('sign-out clears the account address', /email: ''/.test(out), out.trim().slice(0, 120));
  check('the form field', /authEmail: ''/.test(out));
  check('and the name shown on Home', /displayName: ''/.test(out), out.trim().slice(0, 120));
}

{
  console.log('\nswitching accounts claims the device before it writes the new identity');
  /**
   * `claimDataFor` wipes a device that belongs to a different user, and the wipe resets identity
   * along with the history. So writing the session's email and name *first* — which both callers
   * did — meant they were erased by the claim that followed: signing out of A and into B left B
   * with a valid session, a blank Account screen and no name on Home. Nothing surfaced the
   * contradiction, and the next sync pushed whatever was on screen.
   *
   * The order is checked by position rather than by presence. Both operations were always there;
   * only their sequence was wrong, so a check that merely finds them both would have passed on the
   * broken code.
   */
  const adopt = flow.split('async function adoptSession')[1]?.split('\n}')[0] ?? '';
  check('there is one place that does both', adopt.length > 0);
  check('it waits for the store to come off disk', /await whenHydrated\(\)/.test(adopt), adopt.trim().slice(0, 160));
  check('then claims ownership', /claimDataFor\(session\.user\.id\)/.test(adopt));
  check('and only then applies the identity', adopt.indexOf('claimDataFor') < adopt.indexOf('mirrorSession'), adopt.trim());
  check('hydration first of all', adopt.indexOf('whenHydrated') < adopt.indexOf('claimDataFor'), adopt.trim());

  // Both entry points go through it, rather than repeating the two steps by hand.
  const signIn = flow.split('export async function finishSignIn')[1]?.split('\n}')[0] ?? '';
  const sync = flow.split('export function initAuthSync')[1] ?? '';
  check('a fresh sign-in adopts the session', /adoptSession\(session\)/.test(signIn), signIn.trim().slice(0, 200));
  check('and so does every later auth event', /adoptSession\(session\)/.test(sync), sync.trim().slice(0, 200));
  check('neither claims ownership on its own any more', !/claimDataFor/.test(signIn) && !/claimDataFor/.test(sync));

  /**
   * And the wipe itself has to take the whole identity with it, or the ordering fix is only half
   * of it: `displayName` survived a wipe, so A's first name went on greeting B on Home.
   */
  const wipe = store.split('wipeLocalData: async () => {')[1]?.split('get().go(')[0] ?? '';
  for (const field of ['email', 'authEmail', 'displayName']) {
    check(`a wipe clears ${field}`, new RegExp(`${field}: ''`).test(wipe), wipe.trim().slice(0, 160));
  }
  check('and releases ownership', /dataOwnerId: null/.test(wipe));

  /**
   * The one thing it must *not* do. Data made before there was ever an account belongs to whoever
   * signs up next — a fortnight of check-ins is not somebody else's just because it predates the
   * account that claims it.
   */
  const claim = store.split('claimDataFor: async (userId) => {')[1]?.split('\n      },')[0] ?? '';
  check('an unchanged owner is a no-op', /if \(owner === userId\) return;/.test(claim), claim.trim());
  check('unclaimed data is adopted, not wiped', /if \(owner != null\) await get\(\)\.wipeLocalData\(\)/.test(claim), claim.trim());
}

{
  console.log('\nchanging an email is not the same as making an account');
  // The row used to navigate to AU2, the signup screen: a user moving their account to a new
  // address was handed a form that creates a second one.
  check('Change email opens the change-email screen', /go\('F9E'\)/.test(F9));
  check('and not the signup screen', !/go\('AU2'\)/.test(F9), F9.match(/.*go\('AU2'\).*/)?.[0]);
  check('changeEmail goes through updateUser', /updateUser\(\{ email: next \}\)/.test(auth));
  check('and refuses when nobody is signed in', /Sign in before changing your email/.test(auth));
  check('and when the address is the one already in use', /already your email address/.test(auth));
}

console.log(failures === 0 ? '\nAll auth checks passed.' : `\n${failures} auth check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
