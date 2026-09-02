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
 * default: type stripping, and `module.registerHooks` for the resolver in resolve-ts.mjs. On 22.18+
 * and 24+ both are on. Between 22.13 and 22.17 stripping is behind `--experimental-strip-types`, and
 * that flag cannot simply always be passed — Node exits on an unrecognised flag, so a version that
 * does not know it would fail to start at all.
 *
 * The logic lived only inside the test runner, so `npm test` was self-configuring and every other
 * TypeScript script — `check:release` and the individual `test:*` entries — was not. They worked
 * on a machine whose Node happened to match and needed a hand-typed NODE_OPTIONS on one that did
 * not. One launcher, used by all of them, is the whole fix.
 */

const here = dirname(fileURLToPath(import.meta.url));
const loader = join(here, 'resolve-ts.mjs');

/**
 * The Node versions this repo actually runs on, as one statement.
 *
 * Two requirements meet here and the stricter one wins. React Native 0.86 and Metro both declare
 * `^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25`, so nothing below 22.13 can bundle the app — and these
 * scripts need type stripping, which does not exist on Node 20 at all. The Node 20 branch React
 * Native allows is therefore not a branch this project has: the supported floor is 22.13.
 *
 * `engines` in package.json and .nvmrc say the same thing. It used to say `>=22.6`, a number that
 * came from the type-stripping requirement alone and quietly claimed support for versions Metro
 * refuses to start on.
 */
export const SUPPORTED_NODE = '^22.13.0 || ^24.3.0 || >=25.0.0';

/** Whether `version` is inside [SUPPORTED_NODE]. */
export function nodeSupported(version = process.versions.node) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (major === 22) return minor > 13 || (minor === 13 && patch >= 0);
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
