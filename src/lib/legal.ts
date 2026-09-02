import * as WebBrowser from 'expo-web-browser';

/**
 * The Terms and Privacy Policy, and how they open.
 *
 * Google Play requires a privacy policy URL both in the Play Console listing and reachable from
 * inside the app, and the same page has to be the one the Data safety form describes. These are
 * the addresses the app points at; they are not secrets and they are the same on every build, so
 * they live here rather than in .env — but they must resolve to a real published page before the
 * listing can go live. See supabase/SETUP.md.
 *
 * Opened in the system's in-app browser rather than kicking out to Chrome: reading the terms
 * should not eject someone from a half-finished signup.
 */
export const LEGAL_URLS = {
  privacy: 'https://somno.app/privacy',
  terms: 'https://somno.app/terms',
  /** Play also requires a web page where deletion can be requested without installing the app. */
  deleteAccount: 'https://somno.app/delete-account',
} as const;

/**
 * Where feedback goes.
 *
 * There is no feedback server, and standing one up would mean collecting free text on somebody
 * else's machine and declaring it on the Data safety form. A mail composer keeps the message in the
 * user's own outbox, where they can see exactly what they are sending and to whom. Play requires a
 * working support address on the listing anyway, so this must be the same one.
 */
export const SUPPORT_EMAIL = 'support@somno.app';

export async function openLegal(which: keyof typeof LEGAL_URLS): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(LEGAL_URLS[which], {
      // Match the app rather than flashing a white browser chrome at 3am.
      toolbarColor: '#0B0916',
      controlsColor: '#C9BCFF',
      enableBarCollapsing: true,
    });
  } catch {
    // A device with no browser at all is not worth an error dialog over.
  }
}
