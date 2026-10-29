// G8 UX review finding 4: a widget added before the app has ever run must never be blank. expo-widgets SDK 58:
// "The optional third argument [of createWidget] provides the initial props used before the widget timeline
// is updated." Both widgets start on the signed-out props (nothing personal).
import { G8_COPY } from '@shared/config/copy';
import { WIDGETS } from '@shared/config/widgets';

const created: { name: string; initial: unknown }[] = [];
jest.mock('expo-widgets', () => ({
  createWidget: (name: string, _layout: unknown, initial: unknown) => {
    created.push({ name, initial });
    return { updateTimeline: jest.fn(), updateSnapshot: jest.fn(), reload: jest.fn() };
  },
}));

test('MegaNext and MegaTalk are created with the signed-out props as their initial props', () => {
  require('./MegaNext');
  require('./MegaTalk');
  const next = created.find((c) => c.name === WIDGETS.next.name)!;
  const talk = created.find((c) => c.name === WIDGETS.talk.name)!;
  expect(next.initial).toMatchObject({ state: 'signedOut', copy: { signedOut: G8_COPY.widgetSignedOut } });
  expect(talk.initial).toMatchObject({ signedOut: true });
  expect(JSON.stringify([next.initial, talk.initial])).not.toMatch(/Teal|Zap|Dentist|Soccer/);
});
