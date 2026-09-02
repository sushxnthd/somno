import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

/**
 * The alarm-fire screens' backdrop, ported 1:1 from the prototype's G1/G3 CSS:
 *   G1: radial-gradient(90% 60% at 50% 110%, rgba(255,170,90,.5), transparent 62%)
 *     + radial-gradient(70% 40% at 20% 0%,  rgba(150,110,240,.35), transparent 60%)
 *   G3: the amber one only.
 * These are *radial* gradients anchored off-canvas (the amber one is centred below the bottom
 * edge at 110%), so a LinearGradient can't express them — an earlier version approximated it
 * with a top-anchored linear ramp, which washed the whole screen amber instead of producing a
 * sunrise glow rising from the bottom.
 */
export function AlarmAmbience({ withViolet = true }: { withViolet?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          {/* Gradient coordinates are relative to the painted ellipse's bounding box, so the CSS
              `at 50% 110%` position lives on the <Ellipse> below and the gradient stays centred. */}
          <RadialGradient id="sunrise" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#FFAA5A" stopOpacity={0.5} />
            <Stop offset="0.62" stopColor="#FFAA5A" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="nightfall" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#966EF0" stopOpacity={0.35} />
            <Stop offset="0.6" stopColor="#966EF0" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {withViolet && <Ellipse cx="20" cy="0" rx="70" ry="40" fill="url(#nightfall)" />}
        <Ellipse cx="50" cy="110" rx="90" ry="60" fill="url(#sunrise)" />
      </Svg>
    </View>
  );
}
