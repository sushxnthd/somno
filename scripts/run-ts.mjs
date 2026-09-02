import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/**
 * Runs one of this repo's TypeScript scripts, with whatever flags the running Node needs.
 *
 * Used as: `node scripts/run-ts.mjs scripts/check-release.ts [args...]`
 *
 * Every script here imports `.ts` directly, which needs two things Node has only recently made
 * available together: type stripping, and `module.registerHooks` for the resolver in resolve-ts.mjs.
 * `module.registerHooks` arrives in Node 22.15.0, so that is the real Node 22 floor for this repo.
 * On 22.18+ and 24+ type stripping is available without the experimental strip-types flag; on
 * 22.15-22.17 it still needs `--experimental-strip-types`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const loader = join(here, 'resolve-ts.mjs');

/**
 * The Node versions this repo actually runs on, as one statement.
 *
 * React Native/Metro permit a wider Node 22 range, but Somno's TypeScript script resolver uses
 * `module.registerHooks`, introduced in Node 22.15.0. The project therefore supports Node 22.15+
 * within the 22.x branch, Node 24.3+, and Node 25+.
 */
export const SUPPORTED_NODE = '^22.15.0 || ^24.3.0 || >=25.0.0';

/** Whether `version` is inside [SUPPORTED_NODE]. */
export function nodeSupported(version = process.versions.node) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (major === 22) return minor > 15 || (minor === 15 && patch >= 0);
  if (major === 24) return minor > 3 || (minor === 3 && patch >= 0);
  return major >= 25;
}

export function nodeFlags(version = process.versions.node) {
  if (!nodeSupported(version)) return null;
  const [major, minor] = version.split('.').map(Number);
  // Strip types explicitly only where it is still experimental. `--no-warnings` keeps a passing run
  // from printing an ExperimentalWarning that reads like a failure.
  return major === 22 && minor < 18 ? ['--experimental-strip-types', '--no-warnings'] : ['--no-warnings'];
}

// Importable for the tests without running anything.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const [target, ...rest] = process.argv.slice(2);
  if (!target) {
    console.error('Usage: node scripts/run-ts.mjs <script.ts> [args...]');
    process.exit(1);
  }
  if (!existsSync(loader)) {
    console.error(`Missing ${loader}. Every script here imports TypeScript directly and needs it.`);
    process.exit(1);
  }
  const flags = nodeFlags();
  if (!flags) {
    console.error(`Node ${process.versions.node} is not supported. Somno needs Node ${SUPPORTED_NODE}.`);
    process.exit(1);
  }
  const run = spawnSync(process.execPath, [...flags, '--import', loader, target, ...rest], {
    stdio: 'inherit',
    cwd: join(here, '..'),
  });
  process.exit(run.status ?? 1);
}
