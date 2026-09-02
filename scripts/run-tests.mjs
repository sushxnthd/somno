import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// Flags come from the shared launcher, so `npm test` and every other TypeScript script agree about
// what the running Node needs. This logic used to live only here, which is exactly why
// check:release and the individual test:* scripts did not benefit from it.
import { nodeFlags, SUPPORTED_NODE } from './run-ts.mjs';

/**
 * The test runner. `npm test` and nothing else.
 *
 * It replaces a fourteen-link `&&` chain in package.json, which had two faults that only show up
 * when something is wrong — which is the only time a test runner matters:
 *
 *  1. **The first failure hid the other thirteen suites.** `&&` stops at the first non-zero exit, so
 *     one broken assertion in the first suite meant no information at all about the rest. Fixing a
 *     change that touched several areas became a serial hunt, one run per suite.
 *  2. **A new suite had to be remembered into the chain.** Every `scripts/test-*.ts` had to be added
 *     to `test` by hand, and nothing checked that it had been. A suite that was written but never
 *     wired in passes silently forever, which is worse than not having written it.
 *
 * This discovers every `scripts/test-*.ts`, runs all of them regardless of failures, and prints one
 * summary at the end. Discovery is the point: adding a file is the whole of adding a suite.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const loader = join(here, 'resolve-ts.mjs');

// Fail loudly rather than run every suite into the same unreadable module error. Without the
// loader, node cannot import a .ts file at all, and fifteen identical stack traces are a worse
// diagnosis than one sentence.
if (!existsSync(loader)) {
  console.error(`Missing ${loader}. Every suite imports TypeScript directly and needs it.`);
  process.exit(1);
}

const suites = readdirSync(here)
  .filter((f) => /^test-.+\.ts$/.test(f))
  .sort();

if (!suites.length) {
  console.error('No test suites found in scripts/. Expected files named test-*.ts.');
  process.exit(1);
}

const FLAGS = nodeFlags();
if (!FLAGS) {
  console.error(`Node ${process.versions.node} is not supported. Somno needs Node ${SUPPORTED_NODE}.`);
  process.exit(1);
}

const results = [];

/**
 * Typecheck first, and count it as a suite.
 *
 * Every suite here imports pure modules — engines, lib, geometry — so all fifteen can pass while a
 * screen fails to compile, which is most of the app. `npm test` reporting green in that state is
 * exactly the unreliability worth removing, and at ~6 seconds it is cheaper than finding out from a
 * build. `--skip-typecheck` exists for the inner loop where the same error is already known.
 */
if (!process.argv.includes('--skip-typecheck')) {
  const started = Date.now();
  console.log('typecheck\n');
  const tsc = spawnSync('npx', ['tsc', '--noEmit'], { cwd: root, stdio: 'inherit', shell: true });
  results.push({ name: 'typecheck', ok: tsc.status === 0, code: tsc.status ?? `signal ${tsc.signal}`, ms: Date.now() - started });
}
for (const file of suites) {
  const name = file.replace(/^test-|\.ts$/g, '');
  const started = Date.now();
  const run = spawnSync(
    process.execPath,
    [...FLAGS, '--import', loader, join(here, file)],
    { cwd: root, stdio: 'inherit' }
  );
  results.push({
    name,
    // A suite killed by a signal has no exit code; treat that as a failure rather than as a pass,
    // which `status === 0` alone would not.
    ok: run.status === 0,
    code: run.status ?? `signal ${run.signal}`,
    ms: Date.now() - started,
  });
}

const failed = results.filter((r) => !r.ok);
const totalMs = results.reduce((a, r) => a + r.ms, 0);

console.log(`\n${'='.repeat(60)}`);
for (const r of results) {
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(22)} ${String(r.ms).padStart(6)}ms${r.ok ? '' : `  (exit ${r.code})`}`);
}
console.log(
  `\n${results.length} suite(s), ${results.length - failed.length} passed, ${failed.length} failed, ${totalMs}ms total.`
);
if (failed.length) console.log(`Failed: ${failed.map((f) => f.name).join(', ')}`);

process.exit(failed.length ? 1 : 0);
