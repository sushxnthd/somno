import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer , KeyboardSafe } from '../../components';
import { BackChevron } from '../../components/TopBar';
import { Icon } from '../../components/Icons';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { getSession, resendSignupCode, sendPasswordReset, verifyEmailCode, verifyRecoveryCode } from '../../lib/auth';
import { finishSignIn } from '../../lib/signInFlow';
import { isSupabaseConfigured } from '../../lib/supabase';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function AU3Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(36);
  const go = useSomnoStore((s) => s.go);
  // The address the code was sent to, which is the one typed into the form before this screen —
  // not the signed-in account's, which for a recovery started from Settings is a different thing.
  const email = useSomnoStore((s) => s.authEmail);
  const code = useSomnoStore((s) => s.code);
  const pressCodeKey = useSomnoStore((s) => s.pressCodeKey);
  const verifyCode = useSomnoStore((s) => s.verifyCode);
  const codeMode = useSomnoStore((s) => s.codeMode);
  const openSheet = useSomnoStore((s) => s.openSheet);
  const [loading, setLoading] = useState(false);

  // The same six digits confirm two different things, and the difference is only in what happens
  // either side of them: a signup goes on into onboarding, a reset goes on to choose a password.
  const recovering = codeMode === 'recovery';

  // A resend has to be rate-limited or it becomes a way to spam an inbox, and Supabase enforces its
  // own cooldown anyway — better to show one than to let the user tap into a server error.
  const [cooldown, setCooldown] = useState(30);
  const [resending, setResending] = useState(false);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    const r = recovering ? await sendPasswordReset(email) : await resendSignupCode(email);
    setResending(false);
    setCooldown(30);
    if (r.status === 'error') openSheet('Could not resend', r.message);
  };

  const handleVerify = async () => {
    if (!isSupabaseConfigured) {
      recovering ? go('AU5') : verifyCode();
      return;
    }
    setLoading(true);

    if (recovering) {
      const r = await verifyRecoveryCode(email, code);
      setLoading(false);
      if (r.status !== 'ok') {
        openSheet('Could not verify code', 'message' in r ? r.message : 'That code did not work. Check it and try again.');
        return;
      }
      // The verified code is itself the proof of ownership; the session it returns is what lets
      // the next screen set a new password.
      go('AU5');
      return;
    }

    // A password sign-in (existing user) already established a session in AU2 — nothing left to
    // verify here. A fresh signup needs the emailed code confirmed.
    if (await getSession()) {
      await finishSignIn();
      setLoading(false);
      return;
    }
    const r = await verifyEmailCode(email, code);
    setLoading(false);
    if (r.status !== 'ok') {
      openSheet('Could not verify code', 'message' in r ? r.message : 'That code did not work. Check it and try again.');
      return;
    }
    // A just-verified signup has no history to restore, so this goes straight on into onboarding.
    verifyCode();
  };

  return (
    <ScreenContainer>
      <KeyboardSafe>
        <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.top}>
          <BackChevron onPress={() => go(recovering ? 'AU4' : 'AU2')} />
        </View>
        <View style={styles.body}>
          <Text style={styles.headline}>Enter the code we sent</Text>
          <Text style={styles.sub}>
            {email ? `Six digits, sent to ${email}.` : 'Six digits, sent to your email.'}
            {recovering ? ' Then you can choose a new password.' : ''}
          </Text>
          <View style={styles.boxes}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View
                key={i}
                style={[
                  styles.box,
                  {
                    backgroundColor: code[i] ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                    borderColor: code.length === i ? 'rgba(201,188,255,0.8)' : 'rgba(255,255,255,0.12)',
                  },
                ]}
              >
                <Text style={styles.boxText}>{code[i] || ''}</Text>
              </View>
            ))}
          </View>
          <View style={styles.keypad}>
            {KEYS.map((k, i) => (
              <Pressable key={i} disabled={!k} onPress={() => pressCodeKey(k)} style={styles.key} accessibilityRole="button">
                <Text style={styles.keyText}>{k}</Text>
              </Pressable>
            ))}
          </View>
          {/* This used to read "Resend in 24s" forever, counting nothing and resending nothing.
              It is a real cooldown over a real resend now. */}
          <Pressable
            onPress={handleResend}
            disabled={cooldown > 0 || resending}
            style={styles.resend}
            accessibilityRole="button"
            accessibilityState={{ disabled: cooldown > 0 || resending }}
          >
            <Icon name="refresh" size={14} color={color.textDim45} />
            <Text style={styles.resendText}>
              {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
            </Text>
          </Pressable>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <PrimaryButton label="Verify" onPress={handleVerify} disabled={code.length !== 6 || loading} loading={loading} />
        </View>
      </SafeAreaView>
      </KeyboardSafe>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: { paddingHorizontal: 26, paddingTop: 16 },
  body: { flex: 1, paddingHorizontal: 26, paddingTop: 12, gap: 16 },
  headline: { fontFamily: font.serif, fontSize: 32, lineHeight: 36, color: color.text },
  sub: { fontFamily: font.sans500, fontSize: 13.5, lineHeight: 19, color: color.textDim50 },
  boxes: { flexDirection: 'row', gap: 8 },
  box: { flex: 1, height: 58, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  boxText: { fontFamily: font.sans700, fontSize: 24, color: color.text },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 4 },
  key: {
    width: '31%',
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontFamily: font.sans600, fontSize: 21, color: color.text },
  resend: { flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'center' },
  resendText: { fontFamily: font.sans600, fontSize: 12.5, color: color.textDim45 },
  footer: { paddingHorizontal: 26, paddingBottom: 0, paddingTop: 8 },
});
