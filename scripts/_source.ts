import { readFileSync } from 'node:fs';

/**
 * Source with its comments removed, for the suites that check invariants against the code.
 *
 * Every file in this repo carries long comments explaining the defect each line fixes, and those
 * comments quote the code they are about — so a check that greps the raw file passes on the
 * *explanation* of a bug as happily as on the fix. Stripping first is what makes those checks mean
 * anything.
 *
 * Shared because getting it wrong is subtle and it was wrong. The first version tried to remove JSX
 * comments — `{/* … *\/}` — with a single pattern anchored on the braces, and a `{` that opened a
 * block a line above an ordinary doc comment matched it: the lazy middle then ran on to the next
 * `*\/}` anywhere in the file, deleting seventy lines of real code along the way. Three checks
 * "passed" against a file with the code they were checking removed, which is the exact failure this
 * whole approach exists to avoid.
 *
 * Removing block comments first sidesteps it. The braces of a JSX comment survive as a bare `{}`,
 * which no check cares about.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Not `://`, so a URL keeps its path.
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Reads a repo file and strips its comments. */
export function code(path: string): string {
  return stripComments(readFileSync(path, 'utf8'));
}
