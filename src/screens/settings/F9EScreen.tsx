import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard, KeyboardSafe } from '../../components';
import { Icon } from '../../components/Icons';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { SettingsHeader } from './_shared';
import { changeEmail } from '../../lib/auth';
import { haptics } from '../../theme/haptics';

/**
 * Settings → Account → Change email.
 *
 * This screen exists because the row that opened it used to navigate to AU2 — the *signup* screen.
 * Someone moving their account to a new address was shown a form that creates a second account, and
 * following it through left their history stranded on the address they were trying to leave.
 *
 * Two things are deliberate here:
 *
 *  - The new address is local state, not the store's `email`. `email` is what the account *is*, and
 *    Supabase does not switch it until the confirmation link is followed. Typing into the stored
 *    value would make the Account screen show an address that cannot yet sign you in.
 *  - Success is worded as pending, not done, for the same reason.
 */
export function F9EScreen() {
  const bottomPad = useBottomPad(40);
  const go = useSomnoStore((s) => s.go);
  const current = useSomnoStore((s) => s.email);
  const openSheet = useSomnoStore((s) => s.openSheet);
  const [next, setNext] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = next.trim().length > 0 && !loading;

  const handleSave = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const r = await changeEmail(next);
    setLoading(false);
    switch (r.status) {
      case 'pending':
        haptics.success();
        openSheet('Check your new inbox', r.message);
        go('F9');
        break;
      case 'unconfigured':
        openSheet(
          'Accounts are unavailable',
          'Somno is running without an account server, so there is no email address to change. Everything stays on this device.'
        );
        break;
      default:
        haptics.warn();
        openSheet('Could not change your email', 'message' in r ? r.message : 'Please try again.');
    }
  };

  return (
    <ScreenContainer>
      <KeyboardSafe>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <SettingsHeader title="Change email" onBack={() => go('F9')} />
          <View style={styles.body}>
            <Text style={styles.sub}>
              We'll send a confirmation link to the new address. Your baseline, scores and sleep
              entries stay with the account — only the address changes.
            </Text>
            <GlassCard variant="soft" radiusSize={24} pad={18}>
              <View style={{ gap: 14 }}>
                <View style={{ gap: 9 }}>
                  <Text style={styles.label}>CURRENT</Text>
                  <View style={[styles.input, styles.readOnly]}>
                    <Text style={styles.readOnlyText} numberOfLines={1}>
                      {current || 'Not signed in'}
                    </Text>
                  </View>
                </View>
                <View style={{ gap: 9 }}>
                  <Text style={styles.label}>NEW EMAIL</Text>
                  <TextInput
                    value={next}
                    onChangeText={setNext}
                    placeholder="you@example.com"
                    placeholderTextColor={color.textDim32}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    style={styles.input}
                  />
                </View>
              </View>
            </GlassCard>
            <View style={styles.notice}>
              <Icon name="mail" size={15} color={color.textDim45} />
              <Text style={styles.noticeText}>
                Until the link is opened, your old address is still the one that signs you in.
              </Text>
            </View>
          </View>
          <View style={[styles.footer, { paddingBottom: bottomPad }]}>
            <PrimaryButton label="Send confirmation" onPress={handleSave} loading={loading} disabled={!canSubmit} />
          </View>
        </SafeAreaView>
      </KeyboardSafe>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 14, gap: 16 },
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
  readOnly: { justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.025)' },
  readOnlyText: { fontFamily: font.sans500, fontSize: 15, color: color.textDim50 },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  noticeText: { flex: 1, fontFamily: font.sans500, fontSize: 11.5, lineHeight: 15, color: color.textDim45 },
  footer: { paddingHorizontal: 24, paddingTop: 14 },
});
