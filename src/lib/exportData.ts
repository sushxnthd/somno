import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSomnoStore } from '../store/useSomnoStore';
import { zipStore, type ZipEntry } from './zip';
// Re-exported so callers and tests keep one import site, while the pure CSV writers stay loadable
// without a React Native runtime.
export { checkInsCsv, sleepLogsCsv } from './exportCsv';
import { checkInsCsv, sleepLogsCsv } from './exportCsv';

/**
 * "Export my data", for real.
 *
 * Both app stores now treat export as table stakes for a health-adjacent app, and the spec puts it
 * in v1 alongside deletion. It writes one archive holding all three files and hands it to the
 * system share sheet, so the destination is the user's choice — mail, Drive, Files — and the app
 * never uploads anything to make it happen.
 *
 * Two formats because they answer different questions: the CSVs open in any spreadsheet, which is
 * what "for my own records" actually means to most people, and the JSON is lossless, which is what
 * you want if you ever move to another tool.
 *
 * What is *not* in here is any image. There is none to export — the face scan keeps numbers only.
 */

export type ExportOutcome =
  | { status: 'ok'; files: number; records: number }
  | { status: 'empty' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

/** The whole local dataset, in the shape the app itself holds it. */
export function exportPayload() {
  const s = useSomnoStore.getState();
  return {
    exportedAt: new Date().toISOString(),
    app: 'Somno',
    schemaVersion: 2,
    note: 'Numeric records only. No photograph was ever stored, so none can be exported.',
    profile: {
      ageYears: s.age,
      gender: s.gender,
      medication: s.medication,
      highStress: s.highStress,
      usualBedtimeMin: s.bedMin,
      usualWakeMin: s.wakeMin,
      naturalWakeMin: s.idealWake,
    },
    baseline: s.baselineProfile,
    facialBaseline: s.faceBaseline,
    checkIns: s.checkIns,
    sleepLogs: s.sleepLogs,
    sleepDebtRecords: s.debtRecords,
    alarms: s.alarms,
    alarmEvents: s.alarmEvents,
    consentLog: s.consentLog,
  };
}

/**
 * The files an export contains, and what goes in each.
 *
 * Separated from the writing so the contents can be tested without a filesystem, and so the count
 * the UI reports is the same list the archive is built from rather than a number kept in step by
 * hand.
 */
export function exportFiles(stamp = new Date().toISOString().slice(0, 10)): ZipEntry[] {
  const s = useSomnoStore.getState();
  return [
    { name: `somno-check-ins-${stamp}.csv`, content: checkInsCsv(s.checkIns) },
    { name: `somno-sleep-${stamp}.csv`, content: sleepLogsCsv(s.sleepLogs) },
    { name: `somno-export-${stamp}.json`, content: JSON.stringify(exportPayload(), null, 2) },
  ];
}

/**
 * Writes one archive and opens the share sheet.
 *
 * It used to write the three files separately and share the last one. `Sharing.shareAsync` takes a
 * single URI, so the two CSVs stayed in the app's cache directory — which on Android no file
 * manager can reach and the system clears whenever it likes. The screen said "a CSV and a JSON
 * file"; the user got the JSON. Bundling them means one share delivers everything the UI promises,
 * which for a portability feature both stores require is the whole point.
 *
 * The archive goes to the cache directory on purpose: it is a hand-off, not a second copy of the
 * user's history left on the device, and the system reclaims that directory on its own.
 */
export async function exportAllData(): Promise<ExportOutcome> {
  const s = useSomnoStore.getState();
  /**
   * Everything the archive would actually contain, not just the two tables.
   *
   * The gate counted check-ins and sleep logs alone, so somebody who had completed onboarding —
   * calibrated a baseline, answered the profile questions, set alarms, granted permissions — and
   * had not yet made a first check-in was told there was "nothing to export yet". The JSON in that
   * archive would have held all of it, including the consent log, which is precisely the record a
   * data-portability request is most likely to be about.
   */
  const records =
    s.checkIns.length +
    s.sleepLogs.length +
    s.debtRecords.length +
    s.alarms.length +
    s.consentLog.length +
    (s.baselineProfile ? 1 : 0) +
    (s.faceBaseline ? 1 : 0);
  if (!records) return { status: 'empty' };

  try {
    if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) return { status: 'unavailable' };

    const stamp = new Date().toISOString().slice(0, 10);
    const entries = exportFiles(stamp);

    const archive = new File(Paths.cache, `somno-export-${stamp}.zip`);
    if (archive.exists) archive.delete();
    archive.create();
    // Bytes, not text: a zip is binary and writing it as a string would corrupt every byte above
    // 0x7f — including the header signatures.
    const handle = archive.open();
    try {
      handle.writeBytes(zipStore(entries));
    } finally {
      handle.close();
    }

    await Sharing.shareAsync(archive.uri, {
      mimeType: 'application/zip',
      dialogTitle: 'Export your Somno data',
      UTI: 'public.zip-archive',
    });

    return { status: 'ok', files: entries.length, records };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Export failed' };
  }
}
