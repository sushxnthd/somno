import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from '../theme/tokens';

export type IconName =
  | 'home' | 'checkin' | 'recovery' | 'trends' | 'settings' | 'flame' | 'bell' | 'camera'
  | 'moon' | 'sun' | 'chevronLeft' | 'chevronRight' | 'close' | 'clock' | 'heart' | 'phone'
  | 'coffee' | 'calendar' | 'shield' | 'export' | 'trash' | 'info' | 'help' | 'plus' | 'minus'
  | 'chevronDown' | 'chevronUp' | 'mail' | 'apple' | 'google' | 'lock' | 'refresh' | 'send'
  | 'sparkle' | 'sound' | 'vibrate' | 'gauge' | 'check' | 'pulse' | 'bar-chart' | 'sparkle-alt' | 'nap' | 'book' | 'warning' | 'bed' | 'bulb' | 'arrowUp' | 'chat' | 'plug' | 'user';

const paths: Record<IconName, React.ReactNode> = {
  // Tab-bar icon paths below are copied verbatim from the prototype's inline SVGs (G-block,
  // lines 1210-1213 of Somno Prototype.dc.html) so the nav reads identically.
  home: <Path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  checkin: <><Path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2L9 5h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" /><Circle cx={12} cy={13} r={3.2} /></>,
  recovery: <Path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  trends: <Path d="M3 20h18M7 20v-6M12 20V6M17 20v-9" />,
  settings: <><Circle cx={12} cy={12} r={3} /><Path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6" /></>,
  flame: <Path d="M12 3s4.5 3.6 4.5 8a4.5 4.5 0 0 1-9 0c0-1.4.6-2.6 1.4-3.5.2 1.6 1 2.4 1.8 2.4 1 0 1.6-1 1.3-2.7-.2-1.6 0-3 0-4.2zM7 13.5A5 5 0 0 0 12 21a5 5 0 0 0 5-5" />,
  bell: <><Path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9z" /><Path d="M10 18a2 2 0 0 0 4 0" /></>,
  camera: <><Path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" /><Circle cx={12} cy={13} r={3.2} /></>,
  moon: <Path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  // Stands in for an avatar when an account exists but has no picture, which is every email signup.
  user: <><Circle cx={12} cy={8.5} r={3.5} /><Path d="M5 20c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" /></>,
  sun: <><Circle cx={12} cy={12} r={4} /><Path d="M12 2.4v2.2M12 19.4v2.2M21.6 12h-2.2M4.6 12H2.4M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4" /></>,
  chevronLeft: <Path d="m15 5-7 7 7 7" />,
  chevronRight: <Path d="m9 5 7 7-7 7" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  clock: <><Circle cx={12} cy={13} r={7} /><Path d="M12 9.5V13l2.2 1.6M5 4.5 8 2.5M19 4.5 16 2.5" /></>,
  heart: <Path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20z" />,
  phone: <><Rect x={7} y={2.5} width={10} height={19} rx={2.5} /><Path d="M11 18.5h2" /></>,
  coffee: <><Path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><Path d="M17 9.5h1.8a2.2 2.2 0 0 1 0 4.4H17" /></>,
  calendar: <><Rect x={3.5} y={5} width={17} height={15.5} rx={3} /><Path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  shield: <Path d="M12 3l7 3v6c0 4.2-3 7.5-7 9-4-1.5-7-4.8-7-9V6z" />,
  export: <Path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />,
  trash: <><Path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></>,
  info: <><Circle cx={12} cy={12} r={9} /><Path d="M12 11v5.5M12 8v.01" /></>,
  help: <><Circle cx={12} cy={12} r={9} /><Path d="M9.5 9.3a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.3 1-1.3 1.9v.3M12 16.5v.01" /></>,
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  chevronDown: <Path d="m6 9 6 6 6-6" />,
  chevronUp: <Path d="m6 15 6-6 6 6" />,
  mail: <><Rect x={3} y={5.5} width={18} height={13} rx={2.5} /><Path d="m3.8 7.5 8.2 6 8.2-6" /></>,
  apple: <><Rect x={4.5} y={10} width={15} height={10.5} rx={3} /><Path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>,
  google: <><Circle cx={12} cy={8.5} r={3.5} /><Path d="M5 20c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" /></>,
  lock: <><Rect x={4.5} y={10} width={15} height={10.5} rx={3} /><Path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>,
  refresh: <Path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4" />,
  send: <Path d="m4 12 16-7-6.5 16-2.5-6.5L4 12z" />,
  sparkle: <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  sound: <><Path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z" /><Path d="M17 9a4 4 0 0 1 0 6" /></>,
  vibrate: <><Rect x={8} y={4} width={8} height={16} rx={2} /><Path d="M4 9v6M20 9v6" /></>,
  gauge: <><Path d="M4 15a8 8 0 1 1 16 0" /><Path d="M12 15l4-4" /></>,
  check: <Path d="M5 12.5 10 17 19 7" />,
  pulse: <Path d="M3 12h4l2.5-7 4 14L16 12h5" />,
  'bar-chart': <Path d="M3 20h18M7 20v-6M12 20V6M17 20v-9" />,
  'sparkle-alt': <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  nap: <><Rect x={4} y={5.5} width={16} height={13} rx={2.5} /><Path d="M4 11h16" /></>,
  book: <><Path d="M4 5.5A2 2 0 0 1 6 4h5v16H6a2 2 0 0 1-2-2z" /><Path d="M20 5.5A2 2 0 0 0 18 4h-5v16h5a2 2 0 0 0 2-2z" /></>,
  warning: <><Path d="M12 4.5 21 19.5H3z" /><Path d="M12 10v4M12 17h.01" /></>,
  // Bed / "your usual night" glyph, verbatim from the prototype's A4 + F1 + F4 section headers.
  bed: <Path d="M3 19v-9M3 14h18v5M6.5 11h3.5M13 14V9.5h4A4 4 0 0 1 21 13.5V14" />,
  bulb: <Path d="M9.5 17h5M10 20.5h4M12 3a6 6 0 0 1 3.5 10.9c-.6.5-.9 1.2-.9 1.9h-5.2c0-.7-.3-1.4-.9-1.9A6 6 0 0 1 12 3z" />,
  arrowUp: <Path d="M12 19V5m0 0-6 6m6-6 6 6" />,
  chat: <Path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.15-2.9-.42L4 20l1.3-3.2C4.5 15.6 4 14.1 4 12.5 4 8.9 7.6 6 12 6s8 2.9 8 6.5z" />,
  plug: <Path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6zM12 17v4" />,
};

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 19, color: c = color.text, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </Svg>
  );
}
