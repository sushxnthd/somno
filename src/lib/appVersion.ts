import Constants from 'expo-constants';

/**
 * The version this build actually is.
 *
 * Read from the manifest rather than typed into a screen: a hardcoded string is right on the day it
 * is written and wrong at every release after, and the one place it matters — a support mail or a
 * diagnostics report — is precisely where nobody can check it. The prototype's footer read
 * "Somno 1.4.0"; the build it became is 1.0.0.
 */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';

/** Android's versionCode, which is what Play actually tracks a release by. */
export const BUILD_NUMBER: string = String(
  (Constants.expoConfig?.android as { versionCode?: number } | undefined)?.versionCode ?? ''
);

/** e.g. "1.0.0 (1)" — the pair support needs to identify a build exactly. */
export const VERSION_LABEL: string = BUILD_NUMBER ? `${APP_VERSION} (${BUILD_NUMBER})` : APP_VERSION;
