import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSomnoStore } from '../store/useSomnoStore';
import { SCREENS, TAB_SCREENS } from './registry';
import { TabBar } from '../components/TabBar';
import { BottomSheet } from '../components/BottomSheet';

export function RootNavigator() {
  const screen = useSomnoStore((s) => s.screen);
  const sheet = useSomnoStore((s) => s.sheet);
  const closeSheet = useSomnoStore((s) => s.closeSheet);
  const go = useSomnoStore((s) => s.go);

  const Screen = SCREENS[screen];
  const showTabs = TAB_SCREENS.includes(screen);

  return (
    <View style={styles.root}>
      {/* Keyed so every navigation remounts the screen and replays its entry animation,
          exactly as the design's screen divs do when they are swapped in. */}
      <Screen key={screen} />
      {showTabs && <TabBar active={screen} onNavigate={go} />}
      <BottomSheet sheet={sheet} onClose={closeSheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
