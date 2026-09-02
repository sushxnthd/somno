/**
 * The little bit of Node's API the test scripts use, declared by hand.
 *
 * `@types/node` is deliberately not a dependency: these scripts share a tsconfig with the React
 * Native app, and pulling Node's globals into that graph changes what `setTimeout`, `console` and
 * `Buffer` mean for every app file. Three declarations are cheaper than that.
 */
declare module 'node:child_process' {
  export interface SpawnSyncResult {
    status: number | null;
  }
  export function spawnSync(
    command: string,
    args: readonly string[],
    options: { stdio?: string; env?: Record<string, string | undefined> }
  ): SpawnSyncResult;
  export function execFileSync(command: string, args: readonly string[]): Uint8Array;
  export function execFileSync(command: string, args: readonly string[], options: { encoding: 'utf8' }): string;
}

declare module 'node:fs' {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
  }
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function existsSync(path: string): boolean;
  export function statSync(path: string): { size: number; isDirectory(): boolean };
  // The export tests write a real archive to a temp directory and hand it to the system `unzip`,
  // which is the only way to assert that a hand-rolled ZIP is one other tools actually accept.
  export function writeFileSync(path: string, contents: string | Uint8Array): void;
  export function mkdtempSync(prefix: string): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}
