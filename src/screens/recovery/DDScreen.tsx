import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, AmbientBlob, Rise , KeyboardSafe } from '../../components';
import { BackChevron } from '../../components/TopBar';
import { Icon } from '../../components/Icons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font } from '../../theme/tokens';
import { useSomnoStore } from '../../store/useSomnoStore';
import { lessons, aiFaq } from '../../data/content';

export function DDScreen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const go = useSomnoStore((s) => s.go);
  const lesson = useSomnoStore((s) => s.lesson);
  const aiMsgs = useSomnoStore((s) => s.aiMsgs);
  const askAi = useSomnoStore((s) => s.askAi);
  const nextLesson = useSomnoStore((s) => s.nextLesson);

  const l = lessons[lesson];
  const chips = aiFaq[lesson];

  return (
    <ScreenContainer>
      <KeyboardSafe>
        <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <BackChevron onPress={() => go('DL')} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            {/* source: 260 at left -40/top -60, from 140deg, blur(38px) saturate(165%), .6, swirl 20s */}
            <AmbientBlob size={260} style={{ left: -40, top: -60 }} fromDeg={140} blurPx={38} saturate={1.65} opacity={0.6} durationMs={20000} />
            {/* source: 190 at right -50/bottom -70, warm from 20deg, blur(34px) saturate(180%), .45, swirl 26s reverse */}
            <AmbientBlob size={190} style={{ right: -50, bottom: -70, left: undefined }} warm fromDeg={20} blurPx={34} saturate={1.8} opacity={0.45} durationMs={26000} reverse />
          </View>

          <View style={{ gap: 7 }}>
            <View style={styles.readRow}>
              <Text style={styles.readLabel}>60-SECOND READ</Text>
            </View>
            {/* No icon beside the title — the design pass explicitly removed lesson icon
                illustrations from this screen, and the prototype's markup has only the label + h1. */}
            <Text style={styles.lessonTitle}>{l.t}</Text>
          </View>

          <Text style={styles.paragraph}>{l.a}</Text>
          <Text style={styles.paragraph}>{l.b}</Text>

          <View style={styles.aiCard}>
            <View style={styles.aiHeaderRow}>
              <Icon name="sparkle" size={17} color="#DCD3FF" strokeWidth={1.7} />
              <Text style={styles.aiHeader}>Ask about this lesson</Text>
            </View>

            {aiMsgs.map((m, i) => (
              // `rise .25s ease` — each reply slides up into the thread as it arrives.
              <Rise
                key={i}
                style={[
                  styles.msgBubble,
                  {
                    alignSelf: m.r === 'u' ? 'flex-end' : 'flex-start',
                    backgroundColor: m.r === 'u' ? 'rgba(236,234,246,0.92)' : 'rgba(255,255,255,0.07)',
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: m.r === 'u' ? font.sans600 : font.sans500,
                    fontSize: 12.5,
                    lineHeight: m.r === 'u' ? 18.75 : 19.4,
                    color: m.r === 'u' ? '#150F2C' : 'rgba(236,234,246,0.86)',
                  }}
                >
                  {m.t}
                </Text>
              </Rise>
            ))}

            <View style={styles.chipsRow}>
              {chips.map(([q]) => (
                <Pressable key={q} onPress={() => askAi(q)} style={styles.chip} accessibilityRole="button">
                  <Text style={styles.chipText}>{q}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.disclaimer}>
              Prepared answers to common questions. General sleep education, not medical advice.
            </Text>
          </View>

          <View style={styles.tipCard}>
            <Text style={styles.tipLabel}>Try tonight</Text>
            <Text style={styles.tipBody}>{l.c}</Text>
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <Pressable onPress={nextLesson} style={styles.nextBtn} accessibilityRole="button">
            <Text style={styles.nextBtnText}>Next lesson</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      </KeyboardSafe>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  // The source's header is a plain block holding an inline-flex 20px chevron, so its line
  // box is 20px + the strut's descender ~= 24px tall, not 20px. Without the extra 4px every
  // element below it sat 4px high.
  header: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 4 },
  body: { paddingHorizontal: 26, paddingTop: 12, gap: 16 },
  hero: {
    height: 104,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readRow: { flexDirection: 'row' },
  readLabel: { fontFamily: font.sans600, fontSize: 10.5, letterSpacing: 1.6, color: color.textDim45 },
  lessonTitle: { fontFamily: font.serif, fontSize: 32, lineHeight: 36, color: color.text },
  paragraph: { fontFamily: font.sans400, fontSize: 14.5, lineHeight: 24, color: 'rgba(236,234,246,0.72)' },
  aiCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(138,123,255,0.14)',
    padding: 16,
    gap: 11,
  },
  aiHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  aiHeader: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  msgBubble: { maxWidth: '88%', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 13, paddingVertical: 11 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  chipText: { fontFamily: font.sans600, fontSize: 12, color: color.text },
  disclaimer: { fontFamily: font.sans500, fontSize: 10.5, lineHeight: 14, color: color.textDim35 },
  tipCard: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: 16,
  },
  tipLabel: { fontFamily: font.sans700, fontSize: 13.5, color: color.text, marginBottom: 4 },
  tipBody: { fontFamily: font.sans500, fontSize: 13, lineHeight: 19.5, color: color.textDim55 },
  footer: { paddingHorizontal: 24, paddingBottom: 0, paddingTop: 14 },
  nextBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: { fontFamily: font.sans700, fontSize: 15, color: color.text },
});
