import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'edge-runtime', // matches the Convex runtime (convex-test docs)
    include: ['convex/**/*.test.ts', 'shared/**/*.test.ts', 'tests/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
    // convex-test imports every module (`import.meta.glob`) on a file's first call, and many tests seed the
    // whole sample family; under the full parallel run that alone can pass the 5s default (seen in G3).
    testTimeout: 20_000,
  },
});
