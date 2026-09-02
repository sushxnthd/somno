import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer, AmbientBlob, PopIn, CssGradient, AnimatedNumber } from '../../components';
import { Icon, type IconName } from '../../components/Icons';
import { PrimaryButton } from '../../components/Buttons';
import { useBottomPad } from '../../theme/useBottomPad';
import { color, font, displayNumeral } from '../../theme/tokens';
import { useSomnoStore, useTodayDebt } from '../../store/useSomnoStore';
import { kssWords } from '../../data/content';

export function C5Screen() {
  // The design's footer padding, grown only if the hardware needs more room.
  const bottomPad = useBottomPad(40);
  const go = useSomnoStore((s) => s.go);
  const sdi = useSomnoStore((s) => s.sdi);
  const signals = useSomnoStore((s) => s.signals);
  // Re-running a signal edits *this* check-in: it clears only that signal, comes back here, and
  // commits over the same record rather than appending a second one.
  const rerunFaceScan = useSomnoStore((s) => s.rerunFaceScan);
  const editRating = useSomnoStore((s) => s.editRating);
  const kss = useSomnoStore((s) => s.kss);
  const baseline = useSomnoStore((s) => s.baseline);
  const avgMs = useSomnoStore((s) => s.avgMs);
  const openSheet = useSomnoStore((s) => s.openSheet);
  const openConfirm = useSomnoStore((s) => s.openConfirm);
  const face = useSomnoStore((s) => s.lastFaceMetrics);
  const debt = useTodayDebt();
  const sleepLogs = useSomnoStore((s) => s.sleepLogs);

  /**
   * Compared against the user's actual week, or not compared at all.
   *
   * This was `sdi >= 64`: a fixed number standing in for "your weekly average", so the headline
   * claimed a comparison against the user's own history while consulting a constant. On a first
   * check-in there is no week to compare with, and the honest headline says what was measured
   * instead of inventing a verdict.
   */
  const priorCheckIns = useSomnoStore((s) => s.checkIns);
  // The week *before* this reading. Averaging the check-in into the thing it is being compared
  // against makes the first one trivially equal to its own average, which is not a finding.
  const priorAverage = (() => {
    const prior = priorCheckIns.slice(0, -1).slice(-7);
    return prior.length ? Math.round(prior.reduce((a, c) => a + c.sdi, 0) / prior.length) : null;
  })();
  const resultHeadline =
    priorAverage == null
      ? 'Your first reading'
      : sdi >= priorAverage
        ? 'More alert than your weekly average'
        : 'Lower than your average. Here is what might help';
  // Both halves counted, not just the first. This used to read "3 of 4 signals" for any check-in
  // that was not all four — including one scored on a single signal, which it described as medium
  // confidence built on three.
  const confidenceWord = signals >= 4 ? 'High' : signals >= 2 ? 'Medium' : 'Low';
  const confidenceLabel = `${confidenceWord} confidence · ${signals} of 4 signals`;
  const avg = avgMs();
  const pvtSummary = `${avg} ms · ${Math.abs(avg - baseline)} ms ${avg > baseline ? 'slower' : 'faster'} than baseline`;
  // Says what the scan actually found, rather than a fixed line of copy. A provisional scan is
  // reported as exactly what it is — measured, but with nothing yet to compare it against.
  // Leads with the eyelid measurement when there is one, because that is the finding — and because
  // a user who cannot see what the scan measured has no way to tell whether it did anything at all.
  const eyelidPart =
    face?.closureFraction != null
      ? `eyes closed ${Math.round(face.closureFraction * 100)}% of the scan${face.longClosures ? `, ${face.longClosures} slow closure${face.longClosures > 1 ? 's' : ''}` : ''}`
      : null;
  const comparison = !face
    ? null
    : face.provisional
      ? 'still learning your usual face'
      : face.zScore <= -0.75
        ? 'heavier than your usual'
        : face.zScore < -0.25
          ? 'slightly heavier than usual'
          : face.zScore <= 0.25
            ? 'about your usual'
            : 'brighter-eyed than usual';
  const faceSummary = !face
    ? 'Skipped today, other signals weighted up'
    : eyelidPart
      ? `${eyelidPart[0].toUpperCase()}${eyelidPart.slice(1)} — ${comparison}`
      : // No eyelid timing: the camera could not sample fast enough, and saying so is better than
        // quoting the other channels as though they were the whole measurement. The achieved rate
        // is named because it is the one number that explains *why* — the eyelid measure needs
        // frames closer than 350ms apart, and whether a given phone manages that with detection in
        // the loop is the thing no amount of testing here could establish.
        `Measured from stills only at ${face.framesPerSecond} fps — ${comparison}`;
  const kssSummary = kss ? `${kss} of 9, ${kssWords[kss - 1].toLowerCase()}` : 'Not rated today';
  // Was a fixed string — "4.2 h accumulated over 5 nights" — printed on every check-in regardless
  // of what the user had actually slept, including on a device that had never logged a night.
  const debtSummary = sleepLogs.length
    ? `${debt.compositeDebtHours} h accumulated over ${sleepLogs.length} night${sleepLogs.length > 1 ? 's' : ''}`
    : 'Log a night to see your debt';

  /**
   * Offers the re-run this row never had.
   *
   * The other two measured signals re-run when tapped; this one opened an explainer, so the tap
   * test was the only reading on the screen a user could not correct — and a tap test spoiled by a
   * phone call or a dropped phone had no route back other than starting the whole check-in again.
   * The explanation is worth keeping, so it comes with the offer rather than instead of it.
   */
  const rerunPvt = useSomnoStore((s) => s.rerunPvt);
  const offerPvtRerun = () =>
    openConfirm({
      title: 'Reaction time',
      body: 'A brief tap test measures how quickly you respond to a random visual cue. Slower and more variable responses are one of the clearest signs of reduced alertness.\n\nRunning it again replaces this check-in\u2019s reading and rescores it.',
      confirm: { label: 'Run it again', onConfirm: rerunPvt },
    });

  return (
    <ScreenContainer>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.body}>
          <View style={styles.hero}>
            <Text style={styles.sdiLabel}>TODAY'S SDI</Text>
            <View style={styles.sdiRing}>
              {/* source: 164x164, from 220deg, blur(30px) saturate(165%), opacity .62, swirl 17s */}
              <AmbientBlob size={164} fromDeg={220} blurPx={30} saturate={1.65} opacity={0.62} durationMs={17000} />
              {/* `popin .5s` — the design lands the score rather than cutting it in. */}
              <PopIn>
                <AnimatedNumber value={sdi} style={styles.sdiValue} />
              </PopIn>
            </View>
            <Text style={styles.headline}>{resultHeadline}</Text>
            <View style={styles.confidencePill}>
              <Text style={styles.confidenceText}>{confidenceLabel}</Text>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <MetricRow icon="camera" bg="rgba(255,206,150,0.9)" fg="#2A1608" title="Face scan" sub={faceSummary} onPress={rerunFaceScan} />
            <MetricRow icon="pulse" bg="rgba(190,172,255,0.9)" fg="#1A1330" title="Reaction time" sub={pvtSummary} onPress={offerPvtRerun} />
            <MetricRow icon="sun" bg="rgba(160,190,255,0.9)" fg="#0C1430" title="How you rated yourself" sub={kssSummary} onPress={editRating} />
            <MetricRow icon="moon" bg="rgba(255,150,130,0.9)" fg="#2A0E0A" title="Sleep debt" sub={debtSummary} onPress={() => go('D')} />
          </View>
        </View>
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <Pressable onPress={() => go('D')} accessibilityRole="button">
            {/* `linear-gradient(150deg, ...)` — the design fills its CTAs with a gradient, not a flat tint. */}
            <CssGradient angle={150} colors={['rgba(255,255,255,0.96)', 'rgba(214,208,255,0.86)']} style={styles.primaryCta}>
              <Text style={styles.primaryCtaText}>See today&apos;s recovery plan</Text>
            </CssGradient>
          </Pressable>
          <Pressable onPress={() => go('B')} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </ScreenContainer>
  );
}

function MetricRow({
  icon,
  bg,
  fg,
  title,
  sub,
  onPress,
}: {
  icon: IconName;
  bg: string;
  fg: string;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.metricRow} accessibilityRole="button">
      {/* The app's own stroke icons. These four were typographic characters — ↝ ◔ ☺ ☾ — which is
          the only place in the app that happened, and they render as whatever glyph the platform
          font happens to have, at whatever weight it happens to be. */}
      <View style={[styles.metricIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={17} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.metricTitle}>{title}</Text>
        <Text style={styles.metricSub}>{sub}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  hero: { alignItems: 'center', gap: 7 },
  sdiLabel: { fontFamily: font.sans600, fontSize: 10.5, letterSpacing: 2.2, color: color.textDim45 },
  sdiRing: { height: 172, width: '100%', alignItems: 'center', justifyContent: 'center' },
  sdiValue: { fontFamily: font.sans700, ...displayNumeral(84), color: color.text, letterSpacing: -3.78 }, // 84px/1, -.045em
  headline: { fontFamily: font.sans700, fontSize: 15, color: color.text, textAlign: 'center' },
  confidencePill: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  confidenceText: { fontFamily: font.sans600, fontSize: 11.5, color: color.text },
  metricRow: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metricIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  metricTitle: { fontFamily: font.sans700, fontSize: 13.5, color: color.text },
  metricSub: { marginTop: 1, fontFamily: font.sans500, fontSize: 11.5, color: color.textDim45 },
  chevron: { color: color.textDim35, fontSize: 16 },
  footer: { paddingHorizontal: 24, paddingBottom: 0, paddingTop: 12, gap: 9 },
  primaryCta: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: { fontFamily: font.sans700, fontSize: 16, color: '#0C0A18' },
  doneText: { textAlign: 'center', fontFamily: font.sans500, fontSize: 14, color: color.textDim45 },
});
