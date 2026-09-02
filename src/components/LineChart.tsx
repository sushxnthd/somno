import React, { useState } from 'react';
import { GestureResponderEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Polyline, Stop } from 'react-native-svg';
import { buildChart, ChartPoint } from '../utils/chart';
import { color, font } from '../theme/tokens';

interface Props {
  points: ChartPoint[];
  height?: number;
  min?: number;
  max?: number;
  strokeColors?: [string, string] | [string, string, string];
  unit?: string;
  /**
   * Index of the point that is "now", drawn as a dashed vertical rule.
   *
   * The recovery chart shows nights already lived and nights the model projects; without this the
   * two halves of the line look equally like measurements. The design draws the same marker.
   */
  markerIndex?: number;
}

/** Time-series line chart with tap/drag scrub tooltip, matching the prototype's chart() geometry helper. */
export function LineChart({ points, height = 108, min, max, strokeColors = [color.mint, color.sky], unit = '', markerIndex }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [layoutWidth, setLayoutWidth] = useState(300);
  const geo = buildChart(points, { width: 300, height, min, max });

  const setFromX = (x: number) => {
    const pct = Math.max(0, Math.min(1, x / layoutWidth));
    const idx = Math.min(points.length - 1, Math.round(pct * (points.length - 1)));
    setHoverIdx(idx);
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e: GestureResponderEvent) => setFromX(e.nativeEvent.locationX),
      onPanResponderRelease: () => setHoverIdx(null),
    })
  ).current;

  const cur = hoverIdx != null ? geo.points[hoverIdx] : null;
  const gradId = 'lc' + strokeColors.join('').replace(/[^a-zA-Z0-9]/g, '');

  return (
    <View
      onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}
      style={{ height }}
      {...panResponder.panHandlers}
    >
      <Svg width="100%" height={height} viewBox={`0 0 300 ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            {strokeColors.map((c, i) => (
              <Stop key={i} offset={i / (strokeColors.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        {markerIndex != null && geo.points[markerIndex] && (
          <Line
            x1={geo.points[markerIndex].x}
            x2={geo.points[markerIndex].x}
            y1={4}
            y2={height - 4}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
        )}
        <Polyline points={geo.line} fill="none" stroke={`url(#${gradId})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {cur && <Line x1={cur.x} x2={cur.x} y1={0} y2={height} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />}
        {cur && <Circle cx={cur.x} cy={cur.y} r={4.5} fill="#fff" />}
      </Svg>
      {cur && (
        <View style={[styles.tooltip, { left: Math.max(4, Math.min(layoutWidth - 120, (cur.x / 300) * layoutWidth - 50)) }]}>
          <Text style={styles.tooltipVal}>{cur.v}{unit}</Text>
          {!!cur.l && <Text style={styles.tooltipLabel}>{cur.s ? cur.s : cur.l}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    top: -6,
    backgroundColor: 'rgba(18,15,32,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 13,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  tooltipVal: { fontFamily: font.sans700, fontSize: 12.5, color: color.text },
  tooltipLabel: { fontFamily: font.sans500, fontSize: 10.5, color: color.textDim50 },
});
