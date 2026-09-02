import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, zipStore } from '../src/lib/zip.ts';
import { checkInsCsv, sleepLogsCsv } from '../src/lib/exportCsv.ts';
import type { CheckInRecord, SleepLogRecord } from '../src/store/types.ts';

/**
 * The export, checked against a real unzip rather than against itself.
 *
 * "Export my data" is the one feature whose output leaves the app entirely, so a bug here is not
 * something the user can notice and work around — they get a file, it fails to open in whatever
 * they take it to, and the app has already told them it succeeded. The archive writer is
 * hand-rolled (see src/lib/zip.ts for why), which makes "does a real implementation accept this"
 * the only assertion worth making, so these tests shell out to the system `unzip`.
 *
 * The CSV checks are here for the same reason: a quoting bug in a spreadsheet export is invisible
 * until a column silently shifts by one in somebody else's tool.
 */

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

const dir = mkdtempSync(join(tmpdir(), 'somno-export-'));

/** Writes an archive and returns the directory it extracts into. */
function roundTrip(entries: { name: string; content: string }[], label: string): string {
  const zipPath = join(dir, `${label}.zip`);
  writeFileSync(zipPath, zipStore(entries));
  const out = join(dir, label);
  execFileSync('unzip', ['-q', '-o', zipPath, '-d', out]);
  return out;
}

{
  console.log('CRC-32 matches the published vectors');
  // The standard check values for the polynomial ZIP uses. A wrong table produces an archive that
  // looks right and fails integrity checks in whatever the user opens it with.
  const bytes = (s: string) => new TextEncoder().encode(s);
  check('the empty string is 0', crc32(bytes('')) === 0, crc32(bytes('')));
  check('"123456789" is 0xCBF43926', crc32(bytes('123456789')) === 0xcbf43926, crc32(bytes('123456789')).toString(16));
  check('"a" is 0xE8B7BE43', crc32(bytes('a')) === 0xe8b7be43, crc32(bytes('a')).toString(16));
}

{
  console.log('\nthe archive is one a real unzip accepts');
  const entries = [
    { name: 'somno-check-ins-2026-08-18.csv', content: 'a,b\n1,2' },
    { name: 'somno-sleep-2026-08-18.csv', content: 'date,hours\n2026-08-17,7' },
    { name: 'somno-export-2026-08-18.json', content: JSON.stringify({ app: 'Somno', n: 1 }, null, 2) },
  ];

  const zipPath = join(dir, 'basic.zip');
  writeFileSync(zipPath, zipStore(entries));

  // `unzip -t` is the integrity check: it inflates every entry and compares each CRC.
  let tested = '';
  try {
    tested = execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
  } catch (e) {
    tested = String(e);
  }
  check('every entry passes its CRC check', /No errors detected/.test(tested), tested.slice(0, 300));

  const out = roundTrip(entries, 'basic');
  const names = readdirSync(out).sort();
  check('all three files come out', names.length === 3, names);
  check('with the names they went in under', names.join(',') === entries.map((e) => e.name).sort().join(','), names);

  for (const entry of entries) {
    const got = readFileSync(join(out, entry.name), 'utf8');
    check(`${entry.name.split('-').pop()} survives the round trip byte for byte`, got === entry.content, got.slice(0, 80));
  }
}

{
  console.log('\nand it survives the content real exports contain');
  /**
   * Non-ASCII in particular. The filename flag says UTF-8 and the bytes have to actually be UTF-8,
   * and a user's alarm label or a locale-formatted date is the most likely place a multi-byte
   * character enters an export.
   */
  const entries = [
    { name: 'unicode.txt', content: 'Ana — 7½ h · naïve café 🌙' },
    { name: 'empty.csv', content: '' },
    { name: 'large.csv', content: Array.from({ length: 5000 }, (_, i) => `${i},${i * 2}`).join('\n') },
  ];
  const out = roundTrip(entries, 'content');
  for (const entry of entries) {
    check(`${entry.name} round-trips`, readFileSync(join(out, entry.name), 'utf8') === entry.content);
  }
}

{
  console.log('\nthe CSVs are RFC 4180');
  // A comma or a quote inside a field shifts every column after it if it is not escaped, and the
  // damage shows up in the user's spreadsheet rather than here.
  const checkIn = (over: Partial<CheckInRecord> = {}): CheckInRecord => ({
    id: 'ci_1',
    timestamp: Date.parse('2026-08-18T07:30:00Z'),
    triggerType: 'manual',
    pvt: null,
    face: null,
    kss: 4,
    sdi: 61,
    confidence: 'medium',
    signalsUsed: 2,
    ...over,
  });

  const csv = checkInsCsv([checkIn()]);
  const header = csv.split('\n')[0].split(',');
  const row = csv.split('\n')[1].split(',');
  check('the header and the row have the same column count', header.length === row.length, `${header.length} vs ${row.length}`);
  check('the timestamp is ISO 8601', /^\d{4}-\d{2}-\d{2}T/.test(row[0]), row[0]);
  check('a missing signal is an empty cell, not a zero', csv.split('\n')[1].includes(',,'), csv.split('\n')[1]);

  const log: SleepLogRecord = {
    id: 'sl_1',
    date: '2026-08-17',
    bedMin: 1380,
    wakeMin: 420,
    durationMin: 480,
    quality: 'Solid',
    restPct: 88,
    source: 'manual',
  };
  const sleep = sleepLogsCsv([log]);
  check('sleep logs carry a header and a row', sleep.split('\n').length === 2, sleep);
  check('and the date is the natural key', sleep.split('\n')[1].startsWith('2026-08-17'), sleep.split('\n')[1]);

  // The escaping itself, on the writer rather than through a record shape that cannot express it.
  const nasty = zipStore([{ name: 'q.csv', content: 'plain,"has,comma","has""quote"\n' }]);
  const qPath = join(dir, 'quote.zip');
  writeFileSync(qPath, nasty);
  const qOut = join(dir, 'quote');
  execFileSync('unzip', ['-q', '-o', qPath, '-d', qOut]);
  check('quoted fields survive the archive', readFileSync(join(qOut, 'q.csv'), 'utf8').includes('"has,comma"'));
}

{
  console.log('\nthe export contains what the screen promises');
  /**
   * The screen says "two CSV files and a JSON file". `exportFiles` is what the archive is built
   * from and what the count reported back to the UI comes from, so the promise and the payload
   * cannot drift — this asserts the shape without needing a store.
   */
  const source = readFileSync('src/lib/exportData.ts', 'utf8');
  check('there is one list of files', /export function exportFiles/.test(source));
  check('it holds the check-ins CSV', /somno-check-ins-\$\{stamp\}\.csv/.test(source));
  check('the sleep CSV', /somno-sleep-\$\{stamp\}\.csv/.test(source));
  check('and the JSON', /somno-export-\$\{stamp\}\.json/.test(source));

  /**
   * And that all of them are shared. The old code wrote three files and called `shareAsync` on one,
   * so two of the three stayed in a cache directory Android gives the user no way to reach.
   */
  check('the archive is what gets shared', /Sharing\.shareAsync\(archive\.uri/.test(source), source.match(/.*shareAsync\(.*/)?.[0]);
  check('built from the same list', /zipStore\(entries\)/.test(source));
  check('as a zip', /mimeType: 'application\/zip'/.test(source));
  check(
    'and nothing shares a single file any more',
    !/shareAsync\(written/.test(source),
    source.match(/.*shareAsync\(written.*/)?.[0]
  );

  // The bytes have to be written as bytes; writing a zip as a string corrupts everything above 0x7f.
  check('the archive is written as bytes', /writeBytes\(zipStore\(entries\)\)/.test(source));
}

console.log(failures === 0 ? '\nAll export checks passed.' : `\n${failures} export check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
