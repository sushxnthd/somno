import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Circle, Path, Rect } from 'react-native-svg';
import { ScreenContainer } from '../../components';
import { BackChevron } from '../../components/TopBar';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { exportAllData } from '../../lib/exportData';
import { VERSION_LABEL } from '../../lib/appVersion';
import { GroupCard, Row, RowIcon, SectionLabel } from './_shared';

export function F0Screen() {
  const go = useSomnoStore((s) => s.go);
  const alarmMin = useSomnoStore((s) => s.alarmMin);
  const fmtMin = useSomnoStore((s) => s.fmtMin);
  const email = useSomnoStore((s) => s.email);
  const perms = useSomnoStore((s) => s.perms);
  const baselineProfile = useSomnoStore((s) => s.baselineProfile);

  // Every trailing value on this screen used to be a fixed string. Each is now the answer to the
  // question the row asks.
  const permValues = Object.values(perms);
  const totalPerms = permValues.length;
  const grantedPerms = permValues.filter((p) => p === 'granted').length;
  const baselineAge = !baselineProfile
    ? 'Not set'
    : (() => {
        const days = Math.floor((Date.now() - baselineProfile.createdAt) / 86_400_000);
        return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
      })();

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    const r = await exportAllData();
    setExporting(false);
    if (r.status === 'empty') openSheet('Nothing to export yet', 'There is nothing on this device to export. Once you finish setting up, or make a check-in, this hands you the whole record as CSV and JSON.');
    else if (r.status === 'unavailable') openSheet('Sharing unavailable', 'This device has nowhere to send the files.');
    else if (r.status === 'error') openSheet('Could not export', r.message);
  };
  const openSheet = useSomnoStore((s) => s.openSheet);

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.top}>
          <BackChevron onPress={() => go('B')} />
          <Text style={styles.title}>Settings</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <SectionLabel>ACCOUNT</SectionLabel>
          <GroupCard>
            <Row
              label="Account"
              onPress={() => go('F9')}
              icon={
                <RowIcon>
                  <Rect x={4.5} y={10} width={15} height={10.5} rx={3} />
                  <Path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
                </RowIcon>
              }
              trailing={<Text style={styles.meta}>{email ? 'Signed in ›' : 'Local only ›'}</Text>}
            />
            <Row
              last
              label="Profile & personal factors"
              onPress={() => go('F1')}
              icon={
                <RowIcon bg="rgba(178,160,255,0.55)" fg="#1A1330">
                  <Circle cx={12} cy={8.5} r={3.5} />
                  <Path d="M5 20c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" />
                </RowIcon>
              }
            />
          </GroupCard>

          <SectionLabel>APP</SectionLabel>
          <GroupCard>
            <Row
              label="Permissions"
              onPress={() => go('F2')}
              icon={
                <RowIcon>
                  <Path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
                  <Circle cx={12} cy={13} r={3.2} />
                </RowIcon>
              }
              trailing={<Text style={styles.meta}>{`${grantedPerms} of ${totalPerms} ›`}</Text>}
            />
            <Row
              label="Integrations"
              onPress={() => go('F3')}
              icon={
                <RowIcon>
                  <Path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6zM12 17v4" />
                </RowIcon>
              }
            />
            <Row
              label="Alarm & Smart Wake"
              onPress={() => go('F4')}
              icon={
                <RowIcon bg="rgba(255,197,140,0.55)" fg="#2A1608">
                  <Circle cx={12} cy={13} r={7} />
                  <Path d="M12 9.5V13l2.2 1.6M5 4.5 8 2.5M19 4.5 16 2.5" />
                </RowIcon>
              }
              trailing={<Text style={styles.meta}>{fmtMin(alarmMin)} ›</Text>}
            />
            <Row
              last
              label="Notifications"
              onPress={() => go('FN')}
              icon={
                <RowIcon>
                  <Path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9z" />
                  <Path d="M10 18a2 2 0 0 0 4 0" />
                </RowIcon>
              }
            />
          </GroupCard>

          <SectionLabel>DATA</SectionLabel>
          <GroupCard>
            <Row
              label="Data & privacy"
              onPress={() => go('F5')}
              icon={
                <RowIcon>
                  <Path d="M12 3l7 3v6c0 4.2-3 7.5-7 9-4-1.5-7-4.8-7-9V6z" />
                </RowIcon>
              }
            />
            <Row
              label="Recalibrate baseline"
              onPress={() => go('F6')}
              icon={
                <RowIcon>
                  <Path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4" />
                </RowIcon>
              }
              trailing={<Text style={styles.meta}>{`${baselineAge} ›`}</Text>}
            />
            <Row
              last
              label="Export my data"
              onPress={handleExport}
              icon={
                <RowIcon>
                  <Path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
                </RowIcon>
              }
            />
          </GroupCard>

          <SectionLabel>SUPPORT</SectionLabel>
          <GroupCard>
            <Row
              label="How Somno works"
              onPress={() => go('F7')}
              icon={
                <RowIcon>
                  <Path d="M4 5.5A2 2 0 0 1 6 4h5v16H6a2 2 0 0 1-2-2z" />
                  <Path d="M20 5.5A2 2 0 0 0 18 4h-5v16h5a2 2 0 0 0 2-2z" />
                </RowIcon>
              }
            />
            <Row
              last
              label="Help & feedback"
              onPress={() => go('F8')}
              icon={
                <RowIcon>
                  <Path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.15-2.9-.42L4 20l1.3-3.2C4.5 15.6 4 14.1 4 12.5 4 8.9 7.6 6 12 6s8 2.9 8 6.5z" />
                </RowIcon>
              }
            />
          </GroupCard>

          <Text style={styles.version}>Somno {VERSION_LABEL}</Text>
        </ScrollView>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingTop: 18 },
  title: { fontFamily: font.serif, fontSize: 26, color: color.text }, // source sets no line-height here
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 12, paddingBottom: 40 },
  meta: { fontFamily: font.sans500, fontSize: 12, color: color.textDim40 },
  version: { textAlign: 'center', fontFamily: font.sans500, fontSize: 11, color: color.textDim32 },
});
