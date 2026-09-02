import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Lets `node scripts/*.ts` follow the imports inside src/.
 *
 * Node strips TypeScript types natively, but its ESM resolver still wants a real filename on a
 * relative import, while Metro — which is what actually bundles this app — wants them extensionless.
 * Rather than contort the app's source to suit the test runner, this hook does what Metro does:
 * try the TypeScript extensions before giving up.
 *
 * Used as: node --import ./scripts/resolve-ts.mjs scripts/test-face.ts
 */
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.(m|c)?(j|t)sx?$/.test(specifier) && context.parentURL) {
      const base = new URL(specifier, context.parentURL);
      for (const candidate of ['.ts', '.tsx', '/index.ts']) {
        if (existsSync(fileURLToPath(new URL(base.href + candidate)))) {
          return next(specifier + candidate, context);
        }
      }
    }
    return next(specifier, context);
  },
});
