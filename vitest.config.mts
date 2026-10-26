import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'edge-runtime', // matches the Convex runtime (convex-test docs)
    include: ['convex/**/*.test.ts', 'shared/**/*.test.ts', 'tests/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
  },
});
