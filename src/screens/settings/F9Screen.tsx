import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Path, Rect } from 'react-native-svg';
import { ScreenContainer, AmbientBlob, GlassOrb } from '../../components';
import { Icon } from '../../components/Icons';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { GroupCard, Row, RowIcon, SettingsHeader } from './_shared';
import { signOut as signOutOfAccount } from '../../lib/auth';
import { syncNow } from '../../lib/sync';
import { haptics } from '../../theme/haptics';

/**
 * What a restore actually brings across.
 *
 * The last sentence used to read "Face data was never stored, so the first face scan on the new
 * device recalibrates from your existing baseline" — which contradicts itself and is wrong on the
 * part that matters. No image is ever kept, but the handful of numbers derived from those images
 * *is* the facial baseline, and it syncs like everything else; a restored phone scores its very
 * first scan against it. Telling users the opposite invited them to recalibrate on a new device for
 * no reason, throwing away a settled reference.
 */
const RESTORE_EXPLAINER =
  'Sign in on the new phone with the same email. Your baseline, scores, sleep entries and facial calibration download from your account, so scans are compared against the same reference as before. No photo or video is ever stored or transferred — only the numbers measured from them.';

export function F9Screen() {
  const go = useSomnoStore((s) => s.go);
  const email = useSomnoStore((s) => s.email);
  const openSheet = useSomnoStore((s) => s.openSheet);
  const setAuthEmail = useSomnoStore((s) => s.setAuthEmail);
  const signOut = useSomnoStore((s) => s.signOut);
  const [restoring, setRestoring] = useState(false);
  const displayName = useSomnoStore((s) => s.displayName);

  // No account means no card full of somebody else's details: the row says what is true, which is
  // that everything lives on this device until they make one.
  const signedIn = Boolean(email);
  const emailShown = email || 'Not signed in';
  const nameShown = displayName || (email ? email.split('@')[0] : 'This device');

  // Both credential rows need an account to act on. Without one they used to navigate into the
  // auth stack, which read as "changing your email means signing up" — the confusion this pair of
  // rows caused in the first place. Say what is true instead.
  const requireAccount = (then: () => void) => () => {
    if (!signedIn) {
      openSheet(
        'No account yet',
        'Somno is running on this device only, so there is no email or password to change. Create an account to sync your history and to be able to restore it on another phone.'
      );
      return;
    }
    then();
  };

  const handleSignOut = () => {
    // Fire-and-forget: the local session is cleared either way, and a network hiccup must not
    // leave someone stuck signed in on a device they are handing over.
    signOutOfAccount().catch(() => {});
    signOut();
  };

  // The row used to only explain what restoring means. It now does it: pull the account down,
  // merge it with whatever this device holds, and say what arrived.
  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    const r = await syncNow();
    setRestoring(false);
    switch (r.status) {
      case 'ok':
        haptics.success();
        openSheet(
          'Restored',
          `${r.checkIns} check-in${r.checkIns === 1 ? '' : 's'} and ${r.sleepLogs} sleep ${r.sleepLogs === 1 ? 'entry' : 'entries'} are now on this device.` +
            (r.hadBaseline ? ' Your baseline came across too.' : ' No baseline was found on the account yet.')
        );
        break;
      case 'signed-out':
        openSheet('Sign in first', RESTORE_EXPLAINER);
        break;
      case 'unconfigured':
        openSheet('Restore from another device', RESTORE_EXPLAINER);
        break;
      default:
        haptics.warn();
        openSheet('Could not restore', `${r.message} Nothing on this device was changed.`);
    }
  };

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SettingsHeader title="Account" onBack={() => go('F0')} />
        <View style={styles.body}>
          <View style={styles.profileRow}>
            <View style={styles.avatarWrap}>
              {/* source: inset:-6px on a 56px avatar -> 68px, from 200deg, blur(14px) saturate(180%), .7, 20s */}
              <AmbientBlob size={68} style={{ left: -6, top: -6 }} fromDeg={200} blurPx={14} saturate={1.8} opacity={0.7} durationMs={20000} />
              <GlassOrb size={56} highlight={0} fill={0.1} borderAlpha={0.2} cornerRadius={20}>
                <Icon name={signedIn ? 'user' : 'moon'} size={24} color="#F2EFFF" strokeWidth={1.7} />
              </GlassOrb>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{nameShown}</Text>
              <Text style={styles.email}>{signedIn ? emailShown : 'Everything stays on this device'}</Text>
            </View>
          </View>

          <GroupCard>
            <Row
              label="Change email"
              onPress={requireAccount(() => go('F9E'))}
              icon={
                <RowIcon size={17} fg={color.textDim70}>
                  <Rect x={3} y={5.5} width={18} height={13} rx={2.5} />
                  <Path d="m3.8 7.5 8.2 6 8.2-6" />
                </RowIcon>
              }
            />
            <Row
              label="Change password"
              // Prefilled with the account's own address, which is what someone resetting their own
              // password wants. It goes into the form field rather than into the account identity,
              // so editing it here sends the code elsewhere without renaming this account.
              onPress={requireAccount(() => {
                setAuthEmail(email);
                go('AU4');
              })}
              icon={
                <RowIcon size={17} fg={color.textDim70}>
                  <Rect x={4.5} y={10} width={15} height={10.5} rx={3} />
                  <Path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
                </RowIcon>
              }
            />
            <Row
              last
              label="Restore from another device"
              onPress={handleRestore}
              trailing={restoring ? <ActivityIndicator size="small" color={color.textDim70} /> : undefined}
              icon={
                <RowIcon size={17} fg={color.textDim70}>
                  <Path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4" />
                </RowIcon>
              }
            />
          </GroupCard>

          <Pressable
            onPress={signedIn ? handleSignOut : () => go('AU1')}
            style={styles.signOutBtn}
            accessibilityRole="button"
          >
            <Text style={styles.signOutText}>{signedIn ? 'Sign out' : 'Sign in or create an account'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    padding: 18,
  },
  avatarWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: font.sans700, fontSize: 16, color: color.text },
  email: { fontFamily: font.sans500, fontSize: 12.5, color: color.textDim50, marginTop: 2 },
  signOutBtn: {
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: { fontFamily: font.sans700, fontSize: 14.5, color: color.text },
});
