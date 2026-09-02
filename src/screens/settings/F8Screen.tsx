import React, { useCallback, useEffect, useState } from 'react';
import { LayoutAnimation, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, GlassCard , CssGradient , KeyboardSafe } from '../../components';
import { color, font } from '../../theme/tokens';
import { haptics } from '../../theme/haptics';
import { useReduceMotion } from '../../theme/useReduceMotion';
import { useSomnoStore } from '../../store/useSomnoStore';
import { faqList } from '../../data/content';
import { SettingsHeader } from './_shared';
import { SUPPORT_EMAIL } from '../../lib/legal';
import { VERSION_LABEL } from '../../lib/appVersion';
import { clearDiagnostics, readDiagnostics, shareDiagnostics, type DiagnosticEntry } from '../../lib/diagnostics';

export function F8Screen() {
  const reduceMotion = useReduceMotion();
  const go = useSomnoStore((s) => s.go);
  const faq = useSomnoStore((s) => s.faq);
  const setFaq = useSomnoStore((s) => s.setFaq);
  const [feedback, setFeedback] = useState('');
  const [sendNote, setSendNote] = useState('');
  const [entries, setEntries] = useState<DiagnosticEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    readDiagnostics().then((e) => alive && setEntries(e));
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Opens the user's mail app with the message already written.
   *
   * There is nowhere to POST this to — see SUPPORT_EMAIL — and a Send button that silently discards
   * what someone typed is worse than no Send button at all. The version goes in the subject because
   * it is the first thing anyone answering the mail will need.
   */
  const send = useCallback(async () => {
    const body = feedback.trim();
    if (!body) {
      setSendNote('Write something first.');
      return;
    }
    haptics.select();
    const url =
      `mailto:${SUPPORT_EMAIL}` +
      `?subject=${encodeURIComponent(`Somno feedback (${VERSION_LABEL})`)}` +
      `&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      setSendNote('Opened in your mail app.');
    } catch {
      setSendNote(`No mail app found. Write to ${SUPPORT_EMAIL}.`);
    }
  }, [feedback]);

  const errorCount = entries?.length ?? 0;

  return (
    <ScreenContainer>
      <KeyboardSafe>
        <SafeAreaView style={styles.safe} edges={['top']}>
        <SettingsHeader title="Help & feedback" onBack={() => go('F0')} />
        <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.group}>
            {faqList.map((f, i) => {
              const open = faq === i;
              return (
                <Pressable
                  key={f.q}
                  onPress={() => {
                    // An accordion swapping height in one frame reads as the list jumping. Ask for
                    // the next layout pass to be animated and the rows glide instead.
                    if (!reduceMotion) {
                      LayoutAnimation.configureNext(
                        LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
                      );
                    }
                    haptics.select();
                    setFaq(i);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={f.q}
                  accessibilityState={{ expanded: open }}
                  accessibilityHint={open ? 'Collapses the answer' : 'Expands the answer'}
                  style={({ pressed }) => [
                    styles.faqRow,
                    i < faqList.length - 1 && styles.rowBorder,
                    pressed && styles.faqRowPressed,
                  ]}
                >
                  <View style={styles.faqHead}>
                    <Text style={styles.faqQ}>{f.q}</Text>
                    <Text style={styles.faqMark}>{open ? '▴' : '▾'}</Text>
                  </View>
                  {open && <Text style={styles.faqA}>{f.a}</Text>}
                </Pressable>
              );
            })}
          </View>

          <GlassCard variant="faint" radiusSize={22} pad={18}>
            <View style={{ gap: 11 }}>
              <Text style={styles.feedbackTitle}>Tell us something</Text>
              <TextInput
                value={feedback}
                onChangeText={setFeedback}
                placeholder="What's working, what isn't…"
                placeholderTextColor={color.textDim32}
                multiline
                style={styles.textarea}
              />
              <Pressable onPress={send} accessibilityRole="button" accessibilityLabel="Send feedback by email">
                {/* `linear-gradient(150deg, ...)` — the design fills every CTA with a gradient, not a flat tint. */}
                <CssGradient angle={150} colors={['rgba(255,255,255,0.96)', 'rgba(214,208,255,0.86)']} style={styles.sendBtn}>
                  <Text style={styles.sendText}>Send</Text>
                </CssGradient>
              </Pressable>
              {!!sendNote && <Text style={styles.note}>{sendNote}</Text>}
            </View>
          </GlassCard>

          {/*
            Only appears when there is something in it. An empty log is not information, and a help
            screen that always carries a "0 errors" card teaches people to ignore the card on the one
            day it matters.
          */}
          {errorCount > 0 && (
            <GlassCard variant="faint" radiusSize={22} pad={18}>
              <View style={{ gap: 9 }}>
                <Text style={styles.feedbackTitle}>
                  {errorCount === 1 ? '1 error recorded' : `${errorCount} errors recorded`}
                </Text>
                <Text style={styles.diagBody}>
                  Something failed to draw or finish on this device. The details are stored here and
                  nowhere else — nothing has been sent. Sending them with your message makes the
                  problem far easier to find.
                </Text>
                <Text style={styles.diagLatest} numberOfLines={2}>
                  Most recent: {entries?.[0]?.message ?? ''}
                </Text>
                <View style={styles.diagActions}>
                  <Pressable
                    onPress={async () => {
                      haptics.select();
                      const r = await shareDiagnostics(VERSION_LABEL);
                      if (r.status === 'unavailable') setSendNote('Sharing is not available on this device.');
                      else if (r.status === 'error') setSendNote('Could not prepare the report.');
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.diagBtn, pressed && styles.diagBtnPressed]}
                  >
                    <Text style={styles.diagBtnText}>Send report</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      haptics.select();
                      await clearDiagnostics();
                      setEntries([]);
                      setSendNote('Diagnostics cleared.');
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.diagBtn, pressed && styles.diagBtnPressed]}
                  >
                    <Text style={styles.diagBtnText}>Clear</Text>
                  </Pressable>
                </View>
              </View>
            </GlassCard>
          )}
        </ScrollView>
      </SafeAreaView>
      </KeyboardSafe>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  bodyScroll: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 12, paddingBottom: 32 },
  note: { fontFamily: font.sans500, fontSize: 11.5, color: color.textDim55, textAlign: 'center' },
  diagBody: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 19, color: color.textDim70 },
  diagLatest: { fontFamily: font.sans400, fontSize: 11, lineHeight: 15, color: color.textDim35 },
  diagActions: { flexDirection: 'row', gap: 9, marginTop: 2 },
  diagBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  diagBtnPressed: { backgroundColor: 'rgba(255,255,255,0.09)' },
  diagBtnText: { fontFamily: font.sans600, fontSize: 13, color: color.text },
  group: { backgroundColor: color.glassFillFaint, borderWidth: 1, borderColor: color.glassBorder12, borderRadius: 22, overflow: 'hidden' },
  faqRow: { paddingHorizontal: 16, paddingVertical: 15, gap: 7 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  faqHead: { flexDirection: 'row', alignItems: 'center' },
  faqQ: { flex: 1, fontFamily: font.sans500, fontSize: 13.5, color: color.text },
  faqRowPressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  faqMark: { color: color.textDim35, fontSize: 13 },
  faqA: { fontFamily: font.sans500, fontSize: 12.5, lineHeight: 19.375, color: color.textDim70 }, // 12.5px/1.55
  feedbackTitle: { fontFamily: font.sans700, fontSize: 14.5, color: color.text },
  textarea: {
    // The design's textarea is `height:96px; padding:12px` in the browser's default content-box,
    // so it occupies 122px. React Native measures border-box, hence the explicit total.
    height: 122,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    color: color.text,
    fontFamily: font.sans400,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  sendBtn: { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontFamily: font.sans700, fontSize: 15, color: color.ink },
});
