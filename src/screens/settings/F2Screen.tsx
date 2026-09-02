import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, PermissionCard } from '../../components';
import { Icon } from '../../components/Icons';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { Camera } from 'expo-camera';
import { SettingsHeader } from './_shared';
import { requestNotificationPermission } from '../../lib/notifications';

export function F2Screen() {
  const go = useSomnoStore((s) => s.go);
  const perms = useSomnoStore((s) => s.perms);
  const setPerm = useSomnoStore((s) => s.setPerm);
  const logConsent = useSomnoStore((s) => s.logConsent);
  const setPermValue = useSomnoStore((s) => s.setPermValue);

  const requestNotif = async () => {
    const granted = await requestNotificationPermission();
    setPermValue('notif', granted ? 'granted' : 'denied');
    logConsent('notifications', granted);
  };

  // Both cards ask the system rather than flipping a local flag. Once a permission is denied,
  // Android will not show the dialog again, so the fallback is the one place that can still change
  // it: the app's own settings page.
  const requestCamera = async () => {
    const { status, canAskAgain } = await Camera.requestCameraPermissionsAsync();
    setPermValue('cam', status === 'granted' ? 'granted' : 'denied');
    logConsent('camera', status === 'granted');
    if (status !== 'granted' && !canAskAgain) Linking.openSettings().catch(() => {});
  };

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SettingsHeader title="Permissions" onBack={() => go('F0')} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <PermissionCard
            pad={15}
            compact
            icon="camera"
            title="Camera"
            body="Face check-ins"
            state={perms.cam}
            iconBg={['rgba(178,160,255,0.55)', '']}
            onPress={requestCamera}
          />
          <PermissionCard
            pad={15}
            compact
            icon="bell"
            title="Notifications"
            body="Reminders and weekly summary"
            state={perms.notif}
            iconBg={['rgba(255,197,140,0.55)', '']}
            onPress={requestNotif}
          />
          {/* Health Connect import is the spec's own v1.5 tier, not v1. Rather than a toggle that
              flips and imports nothing, the row says where it stands. */}
          <GlassCard variant="faint" radiusSize={22} pad={15}>
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Icon name="heart" size={17} color={color.textDim70} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Health app</Text>
                <Text style={styles.rowBody}>Importing sleep from Health Connect is not in this version.</Text>
              </View>
              <View style={styles.pillDenied}>
                <Text style={styles.pillDeniedText}>Later</Text>
              </View>
            </View>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 10, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconWrap: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.sans700, fontSize: 14, color: color.text },
  rowBody: { marginTop: 2, fontFamily: font.sans500, fontSize: 11.5, color: color.textDim45 },
  pillDenied: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.07)' },
  pillDeniedText: { fontFamily: font.sans600, fontSize: 11.5, color: color.textDim70, opacity: 0.7 },
});
