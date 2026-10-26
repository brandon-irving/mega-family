// react-native-reanimated's own testing guide (docs.swmansion.com/react-native-reanimated/docs/guides/testing):
// without this, any file that imports reanimated throws trying to load its native worklets module under
// Jest. First needed in G2 (MessageRow/TalkContent/SaveChip animations) — no prior test imported reanimated.
import 'react-native-reanimated';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- reanimated's own setup helper, not a vendor import feature code would use
require('react-native-reanimated').setUpTests();
