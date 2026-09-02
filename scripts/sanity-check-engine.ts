import { recoveryTrajectory, simulateNight } from '../src/engine/recovery';
import { stageLoss } from '../src/engine/stages';
import { accumulatedDebt } from '../src/engine/debt';
import { fuseSDI, kssToZ, debtToZ } from '../src/engine/sdi';
import { computePVTMetrics } from '../src/engine/pvt';

console.log('--- simulateNight(sdi=85 alert) ---', simulateNight(85));
console.log('--- simulateNight(sdi=30 sleepy) ---', simulateNight(30));
const night = (date: string, durationMin: number) => ({
  id: `sl_${date}`, date, bedMin: 1380, wakeMin: (1380 + durationMin) % 1440,
  durationMin, quality: 'Okay' as const, restPct: 60, source: 'manual' as const,
});
// Dates relative to today: the ledger deliberately discards anything older than three weeks.
const dayKey = (back: number) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const run = (h: number, n = 7) => Array.from({ length: n }, (_, i) => night(dayKey(n - i), h * 60));
console.log('--- one 7.5h night ---', accumulatedDebt([night(dayKey(1), 450)], 30).hours);
console.log('--- a week of 5h nights ---', accumulatedDebt(run(5), 30).hours);
console.log('--- a fortnight of 5h nights ---', accumulatedDebt(run(5, 14), 30).hours);
console.log('--- a month of 4h nights (Van Dongen) ---', accumulatedDebt(run(4, 28), 30).hours);
console.log('--- a week at need ---', accumulatedDebt(run(8), 30).hours);
console.log('--- a bad week then a good one ---', accumulatedDebt([...run(5, 14).slice(0, 7), ...run(9, 7)], 30).hours);
console.log('--- what a 6h night costs against an 8h need ---', stageLoss(8, 6));
console.log('--- recoveryTrajectory(6h debt, 8 nights) ---', recoveryTrajectory(6, 8));

console.log('--- fuseSDI full signals, all good ---', fuseSDI({ zPvt: 0.5, zFace: 0.3, zKss: kssToZ(2), zDebt: debtToZ(0.5) }));
console.log('--- fuseSDI full signals, all bad ---', fuseSDI({ zPvt: -1.5, zFace: -1.2, zKss: kssToZ(8), zDebt: debtToZ(6) }));
console.log('--- fuseSDI partial (no face) ---', fuseSDI({ zPvt: -0.5, zKss: kssToZ(6), zDebt: debtToZ(2) }));
console.log('--- fuseSDI none ---', fuseSDI({}));

console.log('--- PVT alert-ish ---', computePVTMetrics([310, 305, 320, 300, 315, 298, 308, 312, 301, 306, 299, 310], 0, 312, 25));
console.log('--- PVT fatigued ---', computePVTMetrics([420, 610, 380, 700, 390, 650, 410, 800, 395, 620, 405, 590], 2, 312, 25));
