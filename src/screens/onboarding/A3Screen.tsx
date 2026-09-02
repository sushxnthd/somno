import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, ProgressStep } from '../../components';
import { PermissionCard } from '../../components/PermissionCard';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { requestNotificationPermission } from '../../lib/notifications';
import { Camera } from 'expo-camera';

export function A3Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const perms = useSomnoStore((s) => s.perms);
  const setPermValue = useSomnoStore((s) => s.setPermValue);
  const logConsent = useSomnoStore((s) => s.logConsent);
  const go = useSomnoStore((s) => s.go);

  const requestNotif = async () => {
    const granted = await requestNotificationPermission();
    setPermValue('notif', granted ? 'granted' : 'denied');
    // The consent trail records the moment a permission was actually granted or refused, which is
    // the question compliance asks — not what the toggle happens to say today.
    logConsent('notifications', granted);
  };

  // This card used to only flip a local flag, which meant "granted" here could be a lie and the
  // real prompt appeared later, mid-scan. Ask the system now, and record what it actually said.
  const requestCamera = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setPermValue('cam', status === 'granted' ? 'granted' : 'denied');
      logConsent('camera', status === 'granted');
    } catch {
      setPermValue('cam', 'denied');
    }
  };

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ProgressStep step={3} showLabel={false} />
        <View style={styles.header}>
          <Text style={styles.headline}>What Somno needs</Text>
          <Text style={styles.sub}>Nothing here is required to keep going.</Text>
        </View>
        <View style={styles.list}>
          <PermissionCard
            icon="camera"
            title="Camera"
            body="Daily face check-in. Photos never leave your device."
            state={perms.cam}
            onPress={requestCamera}
          />
          <PermissionCard
            icon="bell"
            title="Notifications"
            body="Morning check-in and wind-down reminders."
            state={perms.notif}
            onPress={requestNotif}
          />
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <PrimaryButton label="Continue" onPress={() => go('A4')} />
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 18 },
  headline: { fontFamily: font.serif, fontSize: 32, lineHeight: 36, color: color.text, marginBottom: 6 },
  sub: { fontFamily: font.sans500, fontSize: 13.5, color: color.textDim50 },
  list: { flex: 1, paddingHorizontal: 22, paddingTop: 16, gap: 10 },
  footer: { paddingHorizontal: 24, paddingBottom: 0, paddingTop: 14 },
});
