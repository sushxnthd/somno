// Time/duration formatting helpers, ported from Somno Prototype.dc.html (Component.fmt / dur / dayLabelOf).

export function fmt(min: number, is24h: boolean): string {
  const h = Math.floor(min / 60);
  const mm = String(min % 60).padStart(2, '0');
  if (is24h) return String(h).padStart(2, '0') + ':' + mm;
  const ap = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return hh + ':' + mm + ' ' + ap;
}

export function fmtHM(min: number, is24h = false): string {
  // hour:minute without am/pm suffix, for the big dial readout. On a 24-hour device the hour is
  // written in full, because a dial reading "7:00" next to a system clock reading 19:00 is the
  // whole of what "the app's time doesn't sync with my device" describes.
  const h = Math.floor(min / 60);
  const mm = String(min % 60).padStart(2, '0');
  if (is24h) return String(h).padStart(2, '0') + ':' + mm;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return hh + ':' + mm;
}

export function fmtAP(min: number, is24h: boolean): string {
  if (is24h) return '';
  return min >= 720 ? 'PM' : 'AM';
}

export function dur(a: number, b: number): string {
  const m = (((b - a) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h + ' h ' + (rem ? rem + ' m' : '00');
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function dayLabelOf(days: boolean[]): string {
  const on = days.map((v, i) => (v ? DAY_NAMES[i] : null)).filter(Boolean) as string[];
  if (on.length === 7) return 'Every day';
  if (on.length === 5 && !days[5] && !days[6]) return 'Mon – Fri';
  if (on.length === 2 && days[5] && days[6]) return 'Sat, Sun';
  return on.length === 0 ? 'Once' : on.join(', ');
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** A time range that drops the shared meridiem from the start, the way the design writes its nap
 * window: "1:30-2:00 pm", not "1:30 pm-2:00 pm". */
export function napRange(startMin: number, endMin: number, is24h = false): string {
  const a = fmt(startMin, is24h);
  const b = fmt(endMin, is24h);
  // A 24-hour clock has no meridiem to share, so there is nothing to elide.
  if (is24h) return `${a}\u2013${b}`;
  const meridiem = (t: string) => t.slice(-2);
  return meridiem(a) === meridiem(b) ? `${a.slice(0, -3)}\u2013${b}` : `${a}\u2013${b}`;
}
