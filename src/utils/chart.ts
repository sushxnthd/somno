// Line-chart geometry helper, ported from Somno Prototype.dc.html (Component.chart).
// Produces SVG polyline points + per-sample hit-zone percentages for a scrub/hover interaction.

export interface ChartPoint {
  v: number;
  l?: string; // x label (e.g. date / time)
  s?: string; // sub label (e.g. stage name)
}

export interface PlottedPoint {
  x: number;
  y: number;
  v: number;
  l?: string;
  s?: string;
}

export interface ChartGeometry {
  points: PlottedPoint[];
  line: string; // "x,y x,y ..." for <Polyline>
  area: string; // closed polygon for area fill
  width: number;
  height: number;
  hitWidthPct: number; // width of each per-sample touch zone, in %
}

export function buildChart(
  pts: ChartPoint[],
  opts: { width?: number; height?: number; min?: number; max?: number } = {}
): ChartGeometry {
  const W = opts.width ?? 300;
  const H = opts.height ?? 104;
  const top = 12;
  const bot = H - 14;
  const vals = pts.map((p) => p.v);
  const mx = opts.max ?? Math.max(...vals);
  const mn = opts.min ?? Math.min(...vals);
  const sp = mx - mn || 1;

  const points: PlottedPoint[] = pts.map((p, i) => ({
    x: 8 + i * ((W - 16) / Math.max(1, pts.length - 1)),
    y: bot - ((p.v - mn) / sp) * (bot - top),
    v: p.v,
    l: p.l,
    s: p.s,
  }));

  return {
    points,
    line: points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    area:
      `8,${H} ` + points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ` ${W - 8},${H}`,
    width: W,
    height: H,
    hitWidthPct: 100 / pts.length,
  };
}
