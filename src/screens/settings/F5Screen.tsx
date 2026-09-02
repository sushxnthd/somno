import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard } from '../../components';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { GroupCard, Row, SettingsHeader } from './_shared';
import { deleteAccount } from '../../lib/auth';
import { exportAllData } from '../../lib/exportData';
import { openLegal } from '../../lib/legal';
import { haptics } from '../../theme/haptics';

function Dot({ tint }: { tint: string }) {
  return <View style={[styles.dot, { backgroundColor: tint }]} />;
}

export function F5Screen() {
  const go = useSomnoStore((s) => s.go);
  const openSheet = useSomnoStore((s) => s.openSheet);
  const wipeLocalData = useSomnoStore((s) => s.wipeLocalData);
  const openConfirm = useSomnoStore((s) => s.openConfirm);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  /**
   * The row that explains an export now performs one.
   *
   * It used to open a sheet describing what an export would contain and stop there — on the screen
   * whose entire subject is what happens to the user's data, under a heading both app stores read
   * as a data-portability commitment. The same working flow was already two taps away on the
   * Settings root; this row simply never called it.
   */
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    const r = await exportAllData();
    setExporting(false);
    if (r.status === 'ok') {
      haptics.success();
      return; // the share sheet was the outcome; saying so afterwards is noise
    }
    if (r.status === 'empty') {
      openSheet(
        'Nothing to export yet',
        'There is nothing on this device to export. Once you finish setting up, or make a check-in, this hands you the whole record: two CSV files for a spreadsheet and a JSON file that keeps every detail, in one archive.'
      );
    } else if (r.status === 'unavailable') {
      openSheet('Sharing unavailable', 'This device has nowhere to send the files.');
    } else {
      haptics.warn();
      openSheet('Could not export', `${r.message} Nothing on this device was changed.`);
    }
  };

  /**
   * Deletion is irreversible and unattended — there is no support desk to undo it — so it asks
   * first, in the app's own sheet rather than a platform dialog.
   *
   * The local wipe runs whatever the server says. Most of this app's users will never have made an
   * account at all, and for them "delete everything" is entirely a local operation; for the rest, a
   * server error must not leave the history sitting on the phone after the user asked for it gone.
   */
  const runDelete = async () => {
    setDeleting(true);
    const r = await deleteAccount();
    await wipeLocalData();
    setDeleting(false);
    if (r.status === 'error') {
      // Local data is gone either way; be straight about what may still be on the server.
      openSheet(
        'Deleted from this device',
        `Everything on this phone has been erased, but your account could not be reached: ${r.message} Sign in again to retry, or write to us.`
      );
    }
  };

  const confirmDelete = () =>
    openConfirm({
      title: 'Delete your account?',
      body: 'Your baseline, check-ins, sleep entries and account are permanently deleted from this device and from your account. This cannot be undone.',
      confirm: { label: 'Delete everything', onConfirm: runDelete },
    });

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SettingsHeader title="Data & privacy" onBack={() => go('F0')} />
        <View style={styles.body}>
          <GlassCard variant="strong" radiusSize={24} pad={18}>
            <View style={{ gap: 11 }}>
              <Text style={styles.headline}>What we keep</Text>
              <View style={styles.bulletRow}>
                <Dot tint="#C4B4FF" />
                <Text style={styles.bulletText}>Face scans are analysed on your device. No photo or video is stored or uploaded. Only a handful of numbers.</Text>
              </View>
              <View style={styles.bulletRow}>
                <Dot tint="#FFB877" />
                <Text style={styles.bulletText}>Reaction times, ratings and sleep entries sync to your account so trends survive a new phone.</Text>
              </View>
              <View style={styles.bulletRow}>
                <Dot tint="#FF8E7A" />
                <Text style={styles.bulletText}>Nothing is sold or shared with advertisers. Ever.</Text>
              </View>
              <View style={styles.bulletRow}>
                <Dot tint="#8FD8FF" />
                {/* Android's automatic backup would copy this device's whole history into the
                    user's Google Drive. It is switched off, which is the right default for sleep
                    data — and it has a consequence worth stating rather than discovering. */}
                <Text style={styles.bulletText}>
                  Your history is never included in Android&apos;s automatic backups. An account is the only way it
                  survives a new phone.
                </Text>
              </View>
            </View>
          </GlassCard>

          <GroupCard>
            <Row
              label="Export my data"
              trailing={
                exporting ? (
                  <ActivityIndicator size="small" color={color.textDim70} />
                ) : (
                  <Text style={styles.meta}>CSV + JSON ›</Text>
                )
              }
              onPress={handleExport}
            />
            <Row
              last
              label="View privacy policy"
              onPress={() => openLegal('privacy')}
            />
          </GroupCard>

          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>Delete my account and data</Text>
            {/* This used to end "We'll email a copy first if you'd like one." Nothing emails
                anything — there is no server-side job, no address to send from, and deletion is
                immediate and local. Pointing at the export above is the true version of the same
                offer, and it is one tap away. */}
            <Text style={styles.dangerBody}>
              Removes everything, including your baseline. Export your data first if you want to keep a copy —
              once this is done it cannot be undone.
            </Text>
            <Pressable
              style={styles.dangerBtn}
              onPress={confirmDelete}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel="Delete my account and data"
              accessibilityState={{ disabled: deleting, busy: deleting }}
            >
              {deleting ? <ActivityIndicator size="small" color="#FFB4B4" /> : <Text style={styles.dangerBtnText}>Delete</Text>}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  headline: { fontFamily: font.serif, fontSize: 22, color: color.text },
  bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 6, flexShrink: 0 },
  bulletText: { flex: 1, fontFamily: font.sans500, fontSize: 12.5, lineHeight: 19, color: color.textDim70 },
  meta: { fontFamily: font.sans500, fontSize: 12, color: color.textDim40 },
  dangerCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,142,122,0.35)',
    borderRadius: 22,
    padding: 18,
    gap: 10,
  },
  dangerTitle: { fontFamily: font.sans700, fontSize: 14.5, color: '#FF8E7A' },
  dangerBody: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 18, color: color.textDim55 },
  dangerBtn: { height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,142,122,0.45)', alignItems: 'center', justifyContent: 'center' },
  dangerBtnText: { fontFamily: font.sans700, fontSize: 14, color: '#FF8E7A' },
});
