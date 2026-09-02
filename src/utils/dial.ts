// 24-hour circular clock-face geometry, ported from Somno Prototype.dc.html
// (Component.faceTicks / faceLabels / posOn / dialSet-style angle math).

export interface Tick {
  rot: number;
  len: number;
  w: number;
  active: boolean;
}

/** 72 tick marks (every 20 min) around a 24h dial; `active` = whether inside the [from,to) arc. */
export function faceTicks(from: number | null, to: number): Tick[] {
  return Array.from({ length: 72 }, (_, i) => {
    const m = i * 20;
    const rot = i * 5;
    const inArc =
      from == null ? false : mod(m - from, 1440) <= mod(to - from, 1440);
    return {
      rot,
      len: i % 3 === 0 ? 11 : 6,
      w: i % 3 === 0 ? 2 : 1.5,
      active: inArc,
    };
  });
}

export interface FaceLabel {
  lab: string;
  xPct: number;
  yPct: number;
  big: boolean;
}

/** Hour labels (12AM/6AM/12PM/6PM + numerals) placed around the dial at radius R (percent). */
export function faceLabels(R = 33): FaceLabel[] {
  return [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((h) => {
    const a = ((h / 24) * 360 - 90) * (Math.PI / 180);
    const big = h % 6 === 0;
    const lab = h === 0 ? '12AM' : h === 12 ? '12PM' : h === 6 ? '6AM' : h === 18 ? '6PM' : String(h > 12 ? h - 12 : h);
    return {
      lab,
      xPct: 50 + R * Math.cos(a),
      yPct: 50 + R * Math.sin(a),
      big,
    };
  });
}

/** Position (percent x/y) of a given minute-of-day on a circle of radius R (percent). */
export function posOn(min: number, R: number): { xPct: number; yPct: number } {
  const a = ((min / 1440) * 360 - 90) * (Math.PI / 180);
  return { xPct: 50 + R * Math.cos(a), yPct: 50 + R * Math.sin(a) };
}

/** Convert a touch point (relative to dial center, +y down) into minute-of-day, snapped to `step` min. */
export function angleToMinutes(dx: number, dy: number, step = 5): number {
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return mod(Math.round(((deg / 360) * 1440) / step) * step, 1440);
}

export function angGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
