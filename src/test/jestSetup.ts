// react-native-reanimated's own testing guide (docs.swmansion.com/react-native-reanimated/docs/guides/testing):
// without this, any file that imports reanimated throws trying to load its native worklets module under
// Jest. First needed in G2 (MessageRow/TalkContent/SaveChip animations) — no prior test imported reanimated.
import 'react-native-reanimated';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- reanimated's own setup helper, not a vendor import feature code would use
require('react-native-reanimated').setUpTests();

// RNTL's waitFor/findBy poll gives up after its own default 1s, independent of jest's testTimeout (20s in
// jest.config.js). Under the full parallel run that 1s was too short and suites flaked (G8 correctness review),
// so RNTL waits as long as jest does. Guarded by src/test/jestSetup.test.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.config.js is CommonJS
require('@testing-library/react-native').configure({ asyncUtilTimeout: require('../../jest.config').testTimeout });

// react-native-keyboard-controller ships its own Jest mock (its docs: "Testing" → `react-native-keyboard-controller/jest`);
// without it, any component using its KeyboardAvoidingView (G4's ModalSheet) throws "doesn't seem to be linked".
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the library's own test mock
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
