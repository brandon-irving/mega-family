// G8 (G8.md invariant 9 and the widget-runtime rules): the two layouts are serialized source the widget
// extension evaluates on its own, so they must not reference anything babel would leave outside them — no
// module bindings (`_swiftUi.`, `_modifiers.`, `require(`), no helpers (`_objectSpread`, `_interopRequire…`,
// `_toConsumableArray`, `_createForOfIteratorHelper…`) and no app constants.
import { MegaNextLayout } from './MegaNext';
import { MegaTalkLayout } from './MegaTalk';

jest.mock('expo-widgets', () => ({ createWidget: () => ({ updateTimeline: jest.fn(), updateSnapshot: jest.fn() }) }));

test.each([
  ['MegaNext', MegaNextLayout],
  ['MegaTalk', MegaTalkLayout],
])('%s is self-contained source', (_name, layout) => {
  expect(typeof layout).toBe('string');
  const src = String(layout);
  expect(src).not.toMatch(/require\(|_swiftUi\b|_modifiers\b|_expoWidgets\b|_objectSpread|_interopRequire|_toConsumableArray|_createForOfIterator|_slicedToArray|WIDGET|COPY|THEMES/);
});
