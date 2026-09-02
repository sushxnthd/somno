import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard , KeyboardSafe } from '../../components';
import { BackChevron } from '../../components/TopBar';
import { Icon } from '../../components/Icons';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { signInWithEmail, signUpWithEmail } from '../../lib/auth';
import { finishSignIn } from '../../lib/signInFlow';

export function AU2Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const go = useSomnoStore((s) => s.go);
  const authMode = useSomnoStore((s) => s.authMode);
  // The form's field, not the account's identity — see `authEmail` in store/types.ts.
  const email = useSomnoStore((s) => s.authEmail);
  const pass = useSomnoStore((s) => s.pass);
  const setEmail = useSomnoStore((s) => s.setAuthEmail);
  const setPass = useSomnoStore((s) => s.setPass);
  const toggleAuthMode = useSomnoStore((s) => s.toggleAuthMode);
  const submitAuth = useSomnoStore((s) => s.submitAuth);
  const openSheet = useSomnoStore((s) => s.openSheet);
  const [loading, setLoading] = useState(false);

  const title = authMode === 'signup' ? 'Create your account' : 'Welcome back';
  const cta = authMode === 'signup' ? 'Create account' : 'Sign in';
  const swap = authMode === 'signup' ? 'I already have an account' : 'I need an account';

  const handleSubmit = async () => {
    setLoading(true);
    const r = authMode === 'signup' ? await signUpWithEmail(email, pass) : await signInWithEmail(email, pass);
    switch (r.status) {
      case 'needs-verification':
        // A code is in the user's inbox; AU3 confirms it.
        setLoading(false);
        submitAuth();
        return;
      case 'ok':
        // Either a returning account, or a signup on a project with email confirmation off — the
        // session already exists, so the code screen would have nothing to verify. Restore first,
        // then land wherever the account's own history says this user belongs.
        await finishSignIn();
        setLoading(false);
        return;
      case 'unconfigured':
        // No backend wired up. The app is fully usable locally, so carry on through the flow
        // rather than blocking someone at a sign-in screen for an account they don't need.
        setLoading(false);
        submitAuth();
        return;
      default:
        setLoading(false);
        openSheet(
          authMode === 'signup' ? 'Could not create your account' : 'Could not sign in',
          'message' in r ? r.message : 'Please check your details and try again.'
        );
    }
  };

  return (
    <ScreenContainer>
      <KeyboardSafe>
        <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.top}>
          <BackChevron onPress={() => go('AU1')} />
        </View>
        <View style={styles.body}>
          <Text style={styles.headline}>{title}</Text>
          <GlassCard variant="soft" radiusSize={24} pad={18}>
            <View style={{ gap: 12 }}>
              <View style={{ gap: 7 }}>
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
              <View style={{ gap: 7 }}>
                <Text style={styles.label}>PASSWORD</Text>
                <TextInput
                  value={pass}
                  onChangeText={setPass}
                  placeholder="At least 8 characters"
                  placeholderTextColor={color.textDim32}
                  secureTextEntry
                  style={styles.input}
                />
              </View>
              <View style={styles.notice}>
                <Icon name="shield" size={15} color={color.textDim45} />
                <Text style={styles.noticeText}>Face data is never part of your account. Only scores and timings sync.</Text>
              </View>
            </View>
          </GlassCard>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Pressable onPress={toggleAuthMode} accessibilityRole="button">
              <Text style={styles.swap}>{swap}</Text>
            </Pressable>
            <Pressable onPress={() => go('AU4')} accessibilityRole="button">
              <Text style={styles.forgot}>Forgot your password?</Text>
            </Pressable>
          </View>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <PrimaryButton label={cta} onPress={handleSubmit} loading={loading} disabled={loading} />
        </View>
      </SafeAreaView>
      </KeyboardSafe>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { paddingHorizontal: 26, paddingTop: 16 },
  body: { flex: 1, paddingHorizontal: 26, paddingTop: 14, gap: 18 },
  headline: { fontFamily: font.serif, fontSize: 34, lineHeight: 37.4, color: color.text }, // 34px/1.1
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
  notice: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  noticeText: { flex: 1, fontFamily: font.sans500, fontSize: 11.5, lineHeight: 16.675, color: color.textDim45 }, // 11.5px/1.45
  swap: { fontFamily: font.sans700, fontSize: 13.5, color: '#A99BFF' },
  forgot: { fontFamily: font.sans700, fontSize: 13, color: color.textDim45 },
  footer: { paddingHorizontal: 26, paddingBottom: 0, paddingTop: 14 },
});
