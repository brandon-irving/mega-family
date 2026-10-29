// G8 UX review finding 4: a widget added before the app has ever run must never be blank. expo-widgets SDK 58:
// "The optional third argument [of createWidget] provides the initial props used before the widget timeline
// is updated." Both widgets start on the signed-out props (nothing personal).
import { createWidget } from 'expo-widgets';
import { G8_COPY } from '@shared/config/copy';
import { WIDGETS } from '@shared/config/widgets';
import './MegaNext';
import './MegaTalk';

jest.mock('expo-widgets', () => ({
  createWidget: jest.fn(() => ({ updateTimeline: jest.fn(), updateSnapshot: jest.fn(), reload: jest.fn() })),
}));

test('MegaNext and MegaTalk are created with the signed-out props as their initial props', () => {
  const calls = (createWidget as unknown as jest.Mock).mock.calls as [string, unknown, unknown][];
  const next = calls.find((c) => c[0] === WIDGETS.next.name)!;
  const talk = calls.find((c) => c[0] === WIDGETS.talk.name)!;
  expect(next[2]).toMatchObject({ state: 'signedOut', copy: { signedOut: G8_COPY.widgetSignedOut } });
  expect(talk[2]).toMatchObject({ signedOut: true });
  expect(JSON.stringify([next[2], talk[2]])).not.toMatch(/Teal|Zap|Dentist|Soccer/);
});
