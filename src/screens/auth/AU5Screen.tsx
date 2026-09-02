import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, KeyboardSafe } from '../../components';
import { BackChevron } from '../../components/TopBar';
import { Icon } from '../../components/Icons';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { updatePassword } from '../../lib/auth';
import { finishSignIn } from '../../lib/signInFlow';
import { haptics } from '../../theme/haptics';

/** Supabase's own floor. Stated up front rather than after a rejected submission. */
const MIN_LENGTH = 8;

/**
 * The last step of a password reset: choose the new one.
 *
 * Only reachable from a verified recovery code, which is what makes it safe — the session that
 * code returned is the proof of ownership, so this screen never asks for the old password (the
 * person resetting is precisely the person who does not have it).
 *
 * Not part of the original design, which stopped at "we sent a link". A link would open a browser
 * and leave the user outside the app holding a half-finished task, so the flow finishes here
 * instead, built from the same card, field and footer as AU2.
 */
export function AU5Screen() {
  const bottomPad = useBottomPad(40);
  const go = useSomnoStore((s) => s.go);
  const openSheet = useSomnoStore((s) => s.openSheet);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= MIN_LENGTH && confirm === password && !loading;

  const handleSave = async () => {
    setLoading(true);
    const r = await updatePassword(password);
    setLoading(false);
    if (r.status === 'error') {
      haptics.warn();
      openSheet('Could not set your password', r.message);
      return;
    }
    if (r.status === 'unconfigured') {
      go('AU2');
      return;
    }
    haptics.success();
    // The recovery session is a real session, so there is nothing left to sign in to — restore the
    // account and go wherever its history says this person belongs.
    await finishSignIn();
  };

  return (
    <ScreenContainer>
      <KeyboardSafe>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.top}>
            <BackChevron onPress={() => go('AU3')} />
          </View>
          <View style={styles.body}>
            <Text style={styles.headline}>Choose a new password</Text>
            <Text style={styles.sub}>At least {MIN_LENGTH} characters. Your baseline and history are untouched.</Text>
            <GlassCard variant="soft" radiusSize={24} pad={18}>
              <View style={{ gap: 12 }}>
                <View style={{ gap: 7 }}>
                  <Text style={styles.label}>NEW PASSWORD</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={`At least ${MIN_LENGTH} characters`}
                    placeholderTextColor={color.textDim32}
                    secureTextEntry
                    autoCapitalize="none"
                    style={styles.input}
                    accessibilityLabel="New password"
                  />
                </View>
                <View style={{ gap: 7 }}>
                  <Text style={styles.label}>CONFIRM</Text>
                  <TextInput
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder="Type it once more"
                    placeholderTextColor={color.textDim32}
                    secureTextEntry
                    autoCapitalize="none"
                    style={[styles.input, mismatch && styles.inputBad]}
                    accessibilityLabel="Confirm new password"
                  />
                </View>
                {(tooShort || mismatch) && (
                  <Text style={styles.hint} accessibilityLiveRegion="polite">
                    {tooShort ? `A little longer — ${MIN_LENGTH} characters minimum.` : 'Those two do not match yet.'}
                  </Text>
                )}
              </View>
            </GlassCard>
            <View style={styles.notice}>
              <Icon name="shield" size={15} color={color.textDim45} />
              <Text style={styles.noticeText}>Signing in on your other devices will need the new password.</Text>
            </View>
          </View>
          <View style={[styles.footer, { paddingBottom: bottomPad }]}>
            <PrimaryButton label="Save password" onPress={handleSave} disabled={!canSubmit} loading={loading} />
          </View>
        </SafeAreaView>
      </KeyboardSafe>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { paddingHorizontal: 26, paddingTop: 16 },
  body: { flex: 1, paddingHorizontal: 26, paddingTop: 14, gap: 16 },
  headline: { fontFamily: font.serif, fontSize: 34, lineHeight: 37.4, color: color.text },
  sub: { fontFamily: font.sans500, fontSize: 13.5, lineHeight: 20, color: color.textDim55 },
  label: { fontFamily: font.sans700, fontSize: 11.5, letterSpacing: 1, color: color.textDim50 },
  input: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 15,
    color: color.text,
    fontFamily: font.sans500,
    fontSize: 15,
  },
  inputBad: { borderColor: 'rgba(255,150,150,0.55)' },
  hint: { fontFamily: font.sans600, fontSize: 11.5, lineHeight: 16, color: '#E7A9A9' },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  noticeText: { flex: 1, fontFamily: font.sans500, fontSize: 11.5, lineHeight: 15, color: color.textDim45 },
  footer: { paddingHorizontal: 26, paddingBottom: 0, paddingTop: 14 },
});
