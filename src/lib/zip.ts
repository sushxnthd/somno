/**
 * A minimal ZIP writer, so an export can be one file.
 *
 * ## Why this exists
 *
 * "Export my data" wrote three files — two CSVs and a JSON — and then shared exactly one of them.
 * `Sharing.shareAsync` takes a single URI, so the CSVs stayed in the app's cache directory, which
 * on Android is not reachable by the user through any file manager and is reclaimed by the system
 * without warning. The screen promised "a CSV and a JSON file"; the user received a JSON file. For
 * a data-portability feature that both stores require, promising the export and delivering part of
 * it is worse than not offering it.
 *
 * One archive fixes it with one share: every mail client, Drive and Files app on both platforms
 * opens a zip, and the user gets everything that was promised in a single action.
 *
 * ## Why hand-rolled
 *
 * The alternative was a compression dependency in a release-candidate build for the sake of three
 * small text files. The ZIP container is specified in APPNOTE.TXT and permits compression method 0
 * — "stored", meaning the bytes go in as they are — which removes the only genuinely hard part.
 * What remains is CRC-32 and two header layouts, both fixed and both exercised by the tests in
 * scripts/test-export.ts against the system `unzip`.
 *
 * No compression is a fair trade here: a year of check-ins is a few hundred kilobytes of CSV.
 */

/** Reversed-polynomial CRC-32 (0xEDB88320), the one ZIP specifies. Table built once, lazily. */
let crcTable: Uint32Array | null = null;
function table(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  crcTable = t;
  return t;
}

export function crc32(bytes: Uint8Array): number {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Path inside the archive. Forward slashes only, as the format requires. */
  name: string;
  content: string;
}

/**
 * UTF-8 bytes for a string.
 *
 * `TextEncoder` is present in Hermes and in Node, but this runs in a React Native bundle where the
 * global is easy to lose to a polyfill order change, so the fallback is spelled out rather than
 * assumed. Both paths produce identical bytes; the tests check a non-ASCII case.
 */
function utf8(s: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    let code = s.charCodeAt(i);
    // Surrogate pair -> one code point.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return new Uint8Array(out);
}

/** Little-endian writers. Every multi-byte field in a ZIP is little-endian. */
const u16 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

/**
 * Packs the entries into a ZIP archive, uncompressed.
 *
 * Timestamps are deliberately fixed rather than taken from the clock: a deterministic archive is
 * one the tests can assert on byte for byte, and the modification time of a file that was created
 * a moment ago to be handed straight to a share sheet carries no information anyone wants. The
 * export's real date is in the filename and in the JSON's `exportedAt`.
 */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;

  // 1980-01-01 00:00:00 in MS-DOS date/time, the format's epoch and its lowest legal value.
  const DOS_TIME = 0;
  const DOS_DATE = 0x0021;

  for (const entry of entries) {
    const name = utf8(entry.name);
    const data = utf8(entry.content);
    const crc = crc32(data);

    const header = [
      ...u32(0x04034b50), // local file header signature
      ...u16(20), // version needed: 2.0
      ...u16(0x0800), // flags: bit 11, filename is UTF-8
      ...u16(0), // method 0 = stored
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(data.length), // compressed size == uncompressed, stored
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0), // extra field length
    ];
    local.push(...header, ...name, ...data);

    central.push(
      ...u32(0x02014b50), // central directory header signature
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0x0800),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0), // extra
      ...u16(0), // comment
      ...u16(0), // disk number
      ...u16(0), // internal attributes
      ...u32(0), // external attributes
      ...u32(offset), // where this entry's local header starts
      ...name
    );

    offset += header.length + name.length + data.length;
  }

  const end = [
    ...u32(0x06054b50), // end of central directory signature
    ...u16(0), // this disk
    ...u16(0), // disk with central directory
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(offset), // central directory offset
    ...u16(0), // comment length
  ];

  return Uint8Array.from([...local, ...central, ...end]);
}
