import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * A local record of things that went wrong.
 *
 * Play's vitals catch native crashes and ANRs. They do not catch a JavaScript error, which in this
 * app shows the recovery screen and is then gone forever — the one class of fault most likely to
 * exist in a React Native release, and the one nobody would ever hear about.
 *
 * The deliberate choice here is that nothing is sent anywhere. No third-party SDK, no background
 * upload, no identifiers: a sleep app's error log can contain the shape of somebody's night, and
 * shipping a crash reporter would mean a new entry on the Data Safety form and a new company with
 * a copy of it. Instead the last few faults are kept on the device and the user can hand them over
 * from Help & feedback if they choose to. That is a smaller net, and it is one that can be
 * described honestly in a sentence.
 */

const KEY = 'somno-diagnostics';
/** Enough to see a pattern, few enough that the log can never grow into a storage problem. */
const MAX_ENTRIES = 20;

export interface DiagnosticEntry {
  at: number;
  /** Where it came from: a render fault, a rejected promise, or a reported failure. */
  kind: 'render' | 'unhandled' | 'reported';
  message: string;
  /** Trimmed hard — a full React stack is pages long and adds nothing after the first frames. */
  stack?: string;
  screen?: string;
}

let cache: DiagnosticEntry[] = [];
let loaded = false;

/**
 * Where the user was when it happened.
 *
 * Held here rather than read from the store by each caller: the error boundary must not import the
 * store (it renders above it, and a fault inside the store is exactly when the boundary is needed),
 * and a rejected promise has no component to ask.
 */
let screenSource: (() => string) | null = null;

function currentScreen(): string | undefined {
  try {
    return screenSource?.();
  } catch {
    return undefined;
  }
}

async function load(): Promise<DiagnosticEntry[]> {
  if (loaded) return cache;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as DiagnosticEntry[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

/**
 * Records a fault. Never throws and never awaits its caller — an error handler that can itself
 * fail, or that delays the screen it is reporting on, is worse than no error handler.
 */
export function recordDiagnostic(entry: Omit<DiagnosticEntry, 'at'>): void {
  const screen = entry.screen ?? currentScreen();
  void (async () => {
    try {
      const entries = await load();
      cache = [
        ...entries,
        {
          ...entry,
          at: Date.now(),
          message: entry.message.slice(0, 400),
          stack: entry.stack?.split('\n').slice(0, 8).join('\n').slice(0, 1200),
          screen,
        },
      ].slice(-MAX_ENTRIES);
      await AsyncStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      // Losing an error report is acceptable; crashing while writing one is not.
    }
  })();
}

export async function readDiagnostics(): Promise<DiagnosticEntry[]> {
  return [...(await load())].reverse();
}

export async function clearDiagnostics(): Promise<void> {
  cache = [];
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** A plain-text report, in the shape someone can paste into an email. */
export async function diagnosticsReport(appVersion: string): Promise<string> {
  const entries = await readDiagnostics();
  const header = [
    `Somno diagnostics`,
    `version ${appVersion}`,
    `platform ${Platform.OS} ${String(Platform.Version)}`,
    `generated ${new Date().toISOString()}`,
    `entries ${entries.length}`,
    '',
  ].join('\n');
  if (!entries.length) return `${header}No errors have been recorded on this device.`;
  return (
    header +
    entries
      .map(
        (e) =>
          `— ${new Date(e.at).toISOString()} [${e.kind}]${e.screen ? ` on ${e.screen}` : ''}\n${e.message}${
            e.stack ? `\n${e.stack}` : ''
          }`
      )
      .join('\n\n')
  );
}

export type ShareOutcome = { status: 'ok' } | { status: 'empty' } | { status: 'unavailable' } | { status: 'error' };

/**
 * Hands the report to the system share sheet.
 *
 * A file rather than a mail body: twenty stack traces overflow what a mailto: URL can carry on
 * Android, and this way the destination stays the user's choice. Written to the cache directory,
 * which the system reclaims — the log should not become a second permanent copy of itself.
 */
export async function shareDiagnostics(appVersion: string): Promise<ShareOutcome> {
  try {
    const entries = await load();
    if (!entries.length) return { status: 'empty' };
    if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) return { status: 'unavailable' };

    const file = new File(Paths.cache, `somno-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`);
    if (file.exists) file.delete();
    file.create();
    file.write(await diagnosticsReport(appVersion));

    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/plain',
      dialogTitle: 'Send Somno diagnostics',
      UTI: 'public.plain-text',
    });
    return { status: 'ok' };
  } catch {
    return { status: 'error' };
  }
}

/** React Native's global JS exception hook. Not typed by RN, and absent under react-native-web. */
type ErrorUtilsShape = {
  getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (fn: (error: Error, isFatal?: boolean) => void) => void;
};

/**
 * Catches the errors no component sees.
 *
 * Two different mechanisms, because the platforms disagree about what an uncaught error is:
 *
 * - React Native routes uncaught exceptions through ErrorUtils, and that is the one that matters on
 *   a phone. The previous handler is called afterwards, always — it is what shows the red screen in
 *   development and what ends the process on a fatal, and a diagnostics log is not worth breaking
 *   either.
 * - The browser (the web build, and the interaction harness) fires `unhandledrejection` instead.
 *   These are the quiet ones: a failed sync, a camera call that rejected after the screen moved on.
 *   They never reach the error boundary because they never reach render.
 */
export function initDiagnostics(getScreen: () => string): () => void {
  screenSource = getScreen;

  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  const previousHandler = errorUtils?.getGlobalHandler?.();
  if (errorUtils?.setGlobalHandler) {
    errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      recordDiagnostic({
        kind: 'unhandled',
        message: `${isFatal ? 'fatal: ' : ''}${error?.message ?? String(error)}`,
        stack: error?.stack,
      });
      previousHandler?.(error, isFatal);
    });
  }

  const globalAny = globalThis as {
    addEventListener?: (t: string, fn: (e: unknown) => void) => void;
    removeEventListener?: (t: string, fn: (e: unknown) => void) => void;
  };
  const onRejection = (event: unknown) => {
    const reason = (event as { reason?: unknown })?.reason ?? event;
    const message = reason instanceof Error ? reason.message : String(reason);
    recordDiagnostic({
      kind: 'unhandled',
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  };

  globalAny.addEventListener?.('unhandledrejection', onRejection);
  return () => {
    globalAny.removeEventListener?.('unhandledrejection', onRejection);
    if (previousHandler) errorUtils?.setGlobalHandler?.(previousHandler);
    screenSource = null;
  };
}
