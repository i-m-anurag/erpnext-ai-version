import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Vitest with SWC transform (esbuild doesn't emit decorator metadata, which
 * TypeORM entities need). Two projects:
 *   - unit:        pure logic, no infrastructure  (*.spec.ts)
 *   - integration: needs the Docker dev stack up   (*.int.spec.ts)
 *
 * Run `npm run db:up && npm run migration:run && npm run seed` before integration.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
        keepClassNames: true,
      },
    }),
  ],
  test: {
    pool: 'forks',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/**/*.int.spec.ts', '**/node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/**/*.int.spec.ts'],
          fileParallelism: false,
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
