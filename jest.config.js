// jest-expo config for component tests under src/. Scoped away from vitest (convex/shared/tests),
// see AGENTS.md and vitest.config.mts — the two runners must not pick up each other's files.
module.exports = {
  preset: 'jest-expo',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  // react-native-reanimated's testing guide: resolves its web implementation under Jest instead of the
  // native one (which has no native worklets module to load in this environment), and setUpTests() wires
  // up its mocked clock/frame callbacks.
  resolver: 'react-native-reanimated/jest/resolver',
  setupFilesAfterEnv: ['<rootDir>/src/test/jestSetup.ts'],
  transformIgnorePatterns: [
    // expo-router/testing-library (AuthGate.test.tsx) pulls in react-navigation's forked native-stack/
    // bottom-tabs navigators, which depend on these ESM-only packages.
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|standard-navigation|query-string|split-on-first|filter-obj|escape-string-regexp)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
};
