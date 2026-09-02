// Expo config plugin for Somno's native Smart Wake alarm module.
//
// Android: permissions + the AlarmReceiver/AlarmActivity/BootReceiver components are declared in
// modules/smart-wake-alarm/android/src/main/AndroidManifest.xml and get folded into the app's
// manifest automatically by the Android Gradle Plugin's manifest merger — no manual manifest
// editing needed here for Android.
//
// iOS: there's no equivalent auto-merge for Info.plist, so this plugin adds the one entry the
// native module needs: the `audio` UIBackgroundMode, which is what lets AlarmAudioManager keep a
// looping alarm tone alive in the background (see modules/smart-wake-alarm/ios/AlarmAudioManager.swift).
//
// Registered in app.json's "plugins" array. Takes effect on `npx expo prebuild`.
//
// Verification status, stated precisely because it differs by platform:
//   - Android: `npx expo prebuild -p android --clean` has been run here and succeeds, and
//     `expo-modules-autolinking search -p android` finds smart-wake-alarm, which is what makes the
//     manifest merge above happen. The *merged* manifest is still unverified, because compiling it
//     needs the Android Gradle Plugin from dl.google.com and the Android SDK, neither of which is
//     reachable from this environment. `npm run check:release` reports that as a device item.
//   - iOS: no prebuild has been run (no macOS here), so the Info.plist mod below is unexercised.
//     It mirrors the documented @expo/config-plugins API exactly and should apply cleanly.

const { withInfoPlist } = require('@expo/config-plugins');

function withSmartWakeAlarm(config) {
  config = withInfoPlist(config, (config) => {
    const modes = config.modResults.UIBackgroundModes || [];
    if (!modes.includes('audio')) {
      modes.push('audio');
    }
    config.modResults.UIBackgroundModes = modes;
    return config;
  });

  return config;
}

module.exports = withSmartWakeAlarm;
