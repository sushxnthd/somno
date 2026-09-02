import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard , KeyboardSafe } from '../../components';
import { BackChevron } from '../../components/TopBar';
import { Icon } from '../../components/Icons';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { sendPasswordReset } from '../../lib/auth';

export function AU4Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const go = useSomnoStore((s) => s.go);
  const email = useSomnoStore((s) => s.authEmail);
  const setEmail = useSomnoStore((s) => s.setAuthEmail);
  const openSheet = useSomnoStore((s) => s.openSheet);
  const setCodeMode = useSomnoStore((s) => s.setCodeMode);
  const back = useSomnoStore((s) => s.back);
  const cameFrom = useSomnoStore((s) => s.history[s.history.length - 1]);
  const [loading, setLoading] = useState(false);

  // This screen is reached from two places: the sign-in screen, and Settings → Account → Change
  // password. Back used to be hardcoded to AU2, so leaving it from settings dropped a signed-in
  // user into the signup form. Go back to wherever they actually came from.
  const handleBack = () => (cameFrom ? back() : go('AU2'));

  const handleSend = async () => {
    setLoading(true);
    const r = await sendPasswordReset(email);
    setLoading(false);
    if (r.status === 'error') {
      openSheet('Could not send the code', r.message);
      return;
    }
    // Whether or not that address has an account is deliberately not revealed — saying "no such
    // account" would turn this screen into a way to test which emails are registered. So the flow
    // continues to the code screen either way, and a stranger's address simply never receives one.
    setCodeMode('recovery');
    go('AU3');
  };

  return (
    <ScreenContainer>
      <KeyboardSafe>
        <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.top}>
          <BackChevron onPress={handleBack} />
        </View>
        <View style={styles.body}>
          <Text style={styles.headline}>Reset your password</Text>
          <Text style={styles.sub}>We'll email a six-digit code that expires in an hour. Your baseline and history are untouched.</Text>
          <GlassCard variant="soft" radiusSize={24} pad={18}>
            <View style={{ gap: 9 }}>
              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={color.textDim32}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
            </View>
          </GlassCard>
          <View style={styles.notice}>
            <Icon name="mail" size={15} color={color.textDim45} />
            <Text style={styles.noticeText}>If an account exists for that address, the code is on its way.</Text>
          </View>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <PrimaryButton label="Send reset code" onPress={handleSend} loading={loading} disabled={loading} />
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
  headline: { fontFamily: font.serif, fontSize: 34, lineHeight: 37.4, color: color.text }, // 34px/1.1
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
  notice: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  noticeText: { flex: 1, fontFamily: font.sans500, fontSize: 11.5, lineHeight: 15, color: color.textDim45 },
  footer: { paddingHorizontal: 26, paddingBottom: 0, paddingTop: 14 },
});
