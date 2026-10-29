// G8 (G8.md invariants 3 and 9): the app's widget writer. Sign-out or an account switch writes the
// signed-out props before anything else; off iOS every write is a no-op; changes are throttled to
// WIDGET_TIMELINE.minRefreshSeconds unless forced (foreground, sign-in).
import { G8_COPY } from '@shared/config/copy';
import { THEMES } from '@shared/config/theme';
import { WIDGET_TIMELINE } from '@shared/config/widgets';
import { WIDGET_ADMIN_AFTERNOON, WIDGET_KID } from '@/test/g8Fixtures';
import { createWidgetWriter, widgetColors } from './widgetSync';

const colors = widgetColors(THEMES.midnight);

function fakeWidgets() {
  const calls: { widget: 'next' | 'talk'; kind: 'timeline' | 'snapshot'; payload: unknown }[] = [];
  return {
    calls,
    next: {
      updateTimeline: jest.fn((entries: unknown) => calls.push({ widget: 'next', kind: 'timeline', payload: entries })),
      updateSnapshot: jest.fn((props: unknown) => calls.push({ widget: 'next', kind: 'snapshot', payload: props })),
    },
    talk: { updateSnapshot: jest.fn((props: unknown) => calls.push({ widget: 'talk', kind: 'snapshot', payload: props })) },
  };
}

const personal = (payload: unknown) => /Teal|Zap|Dentist|Soccer|Recycling|Reading/.test(JSON.stringify(payload));

describe('createWidgetWriter', () => {
  test('writes the timeline (one entry per server entry) and the Talk widget', () => {
    const w = fakeWidgets();
    const writer = createWidgetWriter({ next: w.next, talk: w.talk, os: 'ios', now: () => 0 });
    expect(writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' })).toBe(true);
    expect((w.next.updateTimeline.mock.calls[0][0] as unknown[]).length).toBe(WIDGET_ADMIN_AFTERNOON.entries.length);
    expect(w.talk.updateSnapshot).toHaveBeenCalledTimes(1);
  });

  test('throttles changes to minRefreshSeconds; a forced write (foreground) goes through', () => {
    let t = 0;
    const w = fakeWidgets();
    const writer = createWidgetWriter({ next: w.next, talk: w.talk, os: 'ios', now: () => t });
    writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' });
    t += 1000;
    expect(writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' })).toBe(false);
    expect(writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin', force: true })).toBe(true);
    t += WIDGET_TIMELINE.minRefreshSeconds * 1000;
    expect(writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' })).toBe(true);
  });

  test('sign-out: the last write has nothing personal — just the sign-in line (invariant 3)', () => {
    const w = fakeWidgets();
    const writer = createWidgetWriter({ next: w.next, talk: w.talk, os: 'ios', now: () => 0 });
    writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' });
    writer.signOut(colors);
    const lastNext = [...w.calls].reverse().find((c) => c.widget === 'next')!;
    const lastTalk = [...w.calls].reverse().find((c) => c.widget === 'talk')!;
    expect(personal(lastNext.payload)).toBe(false);
    expect(personal(lastTalk.payload)).toBe(false);
    expect(JSON.stringify(lastNext.payload)).toContain(G8_COPY.widgetSignedOut);
  });

  test('an account switch writes the signed-out props first, then the new person’s timeline, unthrottled', () => {
    const w = fakeWidgets();
    const writer = createWidgetWriter({ next: w.next, talk: w.talk, os: 'ios', now: () => 0 });
    writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' });
    const before = w.calls.length;
    expect(writer.write(WIDGET_KID, colors, { memberId: 'm_twin1' })).toBe(true);
    const after = w.calls.slice(before);
    expect(after[0]).toMatchObject({ widget: 'next', kind: 'snapshot' });
    expect(personal(after[0].payload)).toBe(false);
    expect(after.some((c) => c.kind === 'timeline' && JSON.stringify(c.payload).includes('Zap'))).toBe(true);
    expect(after.some((c) => JSON.stringify(c.payload).includes('Dentist'))).toBe(false);
  });

  test.each(['web', 'android'])('on %s it never touches the widgets (invariant 9)', (os) => {
    const w = fakeWidgets();
    const writer = createWidgetWriter({ next: w.next, talk: w.talk, os, now: () => 0 });
    expect(writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin', force: true })).toBe(false);
    writer.signOut(colors);
    expect(w.calls).toEqual([]);
  });
});
