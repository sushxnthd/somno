import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreenExpo from 'expo-splash-screen';
// Imported one weight at a time, from the per-weight entry points rather than the package index.
// The index re-exports all fourteen cuts of Figtree, and each is a `require` of a .ttf — so
// importing five weights from it puts every weight, italics included, in the release bundle. That
// is about 420KB of fonts the app never renders.
import { useFonts } from '@expo-google-fonts/figtree/useFonts';
import { Figtree_300Light } from '@expo-google-fonts/figtree/300Light';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { capFontScaling } from './src/theme/fontScaling';
import { color } from './src/theme/tokens';
import { initNotifications } from './src/lib/notifications';
import { initSync } from './src/lib/sync';
import { initAuthSync } from './src/lib/signInFlow';
import { initAlarmScheduler, getPendingAlarm } from './src/lib/alarmScheduler';
import { initDiagnostics } from './src/lib/diagnostics';
import { useSomnoStore } from './src/store/useSomnoStore';

SplashScreenExpo.preventAutoHideAsync().catch(() => {});

// Before the first render, so every Text in the tree is created with the cap already on it.
capFontScaling();

export default function App() {
  const [fontsLoaded] = useFonts({
    Figtree_300Light,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    InstrumentSerif_400Regular,
  });

  const onLayout = useCallback(() => {
    if (fontsLoaded) SplashScreenExpo.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  useEffect(() => {
    const unsubDiagnostics = initDiagnostics(() => useSomnoStore.getState().screen);
    const unsubNotifications = initNotifications();
    const unsubSync = initSync();
    // Keeps the signed-in email and name in step with Supabase for the life of the app — a
    // confirmed email change lands here rather than waiting for the next sign-in.
    const unsubAuth = initAuthSync();
    const unsubAlarms = initAlarmScheduler();
    /**
     * The app cold-started because an alarm fired.
     *
     * Two things used to go wrong here. The navigation raced rehydration — `onRehydrateStorage`
     * sets the screen back to 'B' for anyone past onboarding, so whichever finished last decided
     * where the user landed, and an alarm that woke the phone could open the app on Home. And
     * arriving at G1 this way never began an alarm session, so no event was recorded for any real
     * firing and the persisted snooze count carried over from the last one — an alarm could open
     * already at its cap and refuse to snooze.
     *
     * Waiting for hydration fixes the first; going through `beginAlarmSession` fixes the second.
     */
    let cancelled = false;
    const openPendingAlarm = () => {
      getPendingAlarm().then((pending) => {
        // The real id, so the session is attributed to the alarm that actually rang and snooze and
        // dismiss act on that one. `beginAlarmSession` still falls back if it is null.
        if (!cancelled && pending) useSomnoStore.getState().beginAlarmSession(pending.alarmId ?? undefined);
      });
    };
    let unsubHydration: (() => void) | undefined;
    if (useSomnoStore.getState().hasHydrated) openPendingAlarm();
    else {
      unsubHydration = useSomnoStore.subscribe((state) => {
        if (state.hasHydrated) {
          unsubHydration?.();
          unsubHydration = undefined;
          openPendingAlarm();
        }
      });
    }

    /**
     * And again every time the app comes back to the foreground.
     *
     * The check above runs once, when React mounts. That covers a cold start and nothing else — but
     * the common case is an app that is *already running*, backgrounded, when the alarm goes off.
     * AlarmActivity records the pending alarm and brings MainActivity forward; React is already
     * mounted, so this effect never runs again, the flag is never read, and the user is handed the
     * screen they left rather than the alarm. The same applies to a snooze re-firing minutes later
     * with the app still warm in the background, which is the *most* likely path of all.
     *
     * Consuming is safe to repeat: the native store clears the flag on read, so a foreground event
     * with no alarm behind it finds nothing and does nothing.
     */
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && useSomnoStore.getState().hasHydrated) openPendingAlarm();
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      unsubHydration?.();
      unsubDiagnostics();
      unsubNotifications();
      unsubSync();
      unsubAuth();
      unsubAlarms();
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <View style={styles.root} onLayout={onLayout}>
        <StatusBar style="light" />
        <ErrorBoundary>
          <RootNavigator />
        </ErrorBoundary>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
