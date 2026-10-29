// G8 review fixes for the widget writer (correctness review, findings 1 and 2).
// 1. WidgetKit picks the current entry by the PHONE's real clock, but `widgets.next` plans on the family Clock
//    (the demo clock can be days off). Every server time is shifted onto the device clock by
//    deviceNow − timeline.generatedAt, so the right entry shows and "in N min" stays right.
// 2. A changed timeline that arrives inside the throttle window is deferred to the end of the window, never
//    dropped; sign-out cancels it.
import { THEMES } from '@shared/config/theme';
import { WIDGET_TIMELINE } from '@shared/config/widgets';
import { WIDGET_ADMIN_AFTERNOON, WIDGET_ADMIN_EVENING } from '@/test/g8Fixtures';
import { createWidgetWriter, nextEntries, widgetColors } from './widgetSync';

const colors = widgetColors(THEMES.midnight);

function fakeWidgets() {
  return {
    next: { updateTimeline: jest.fn(), updateSnapshot: jest.fn() },
    talk: { updateSnapshot: jest.fn() },
  };
}

describe('clock skew: server times are moved onto the device clock (finding 1)', () => {
  const DAY = 86_400_000;
  // The family clock (the timeline) is 3 days AHEAD of the phone's real clock, as after a demo clock jump.
  const deviceNow = WIDGET_ADMIN_AFTERNOON.generatedAt - 3 * DAY;

  test('each entry date = device now + (entry.at − generatedAt)', () => {
    const entries = nextEntries(WIDGET_ADMIN_AFTERNOON, colors, deviceNow);
    expect(entries.map((e) => e.date.getTime())).toEqual(WIDGET_ADMIN_AFTERNOON.entries.map((e) => deviceNow + (e.at - WIDGET_ADMIN_AFTERNOON.generatedAt)));
  });

  test('event start times and the entry times in the props move by the same amount, so relative labels hold', () => {
    const [first] = nextEntries(WIDGET_ADMIN_AFTERNOON, colors, deviceNow);
    const serverFirst = WIDGET_ADMIN_AFTERNOON.entries[0];
    expect(first.props.at).toBe(deviceNow);
    expect(first.props.generatedAt).toBe(deviceNow);
    expect(first.props.soon[0].startsAt - first.props.at).toBe(serverFirst.soon![0].startsAt - serverFirst.at);
    expect(first.props.soon[0].timeLabel).toBe(serverFirst.soon![0].timeLabel); // the family's own clock label
  });

  test('the writer uses its device clock for the shift', () => {
    const w = fakeWidgets();
    const writer = createWidgetWriter({ next: w.next, talk: w.talk, os: 'ios', now: () => deviceNow });
    writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' });
    const written = w.next.updateTimeline.mock.calls[0][0] as { date: Date }[];
    expect(written[0].date.getTime()).toBe(deviceNow);
  });
});

describe('throttle defers, never drops (finding 2)', () => {
  function writerWithClock() {
    let t = 1_000_000;
    const timers: { at: number; fn: () => void; id: number }[] = [];
    let nextId = 1;
    const w = fakeWidgets();
    const writer = createWidgetWriter({
      next: w.next,
      talk: w.talk,
      os: 'ios',
      now: () => t,
      schedule: (fn, ms) => {
        const id = nextId++;
        timers.push({ at: t + ms, fn, id });
        return id;
      },
      cancel: (id) => {
        const i = timers.findIndex((x) => x.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
    });
    const advance = (ms: number) => {
      t += ms;
      for (const timer of timers.filter((x) => x.at <= t)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.fn();
      }
    };
    return { w, writer, advance, pending: () => timers.length };
  }

  test('a different timeline inside the window is written when the window ends', () => {
    const { w, writer, advance } = writerWithClock();
    writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' });
    advance(1000);
    expect(writer.write(WIDGET_ADMIN_EVENING, colors, { memberId: 'm_admin' })).toBe(false);
    expect(w.next.updateTimeline).toHaveBeenCalledTimes(1);
    advance(WIDGET_TIMELINE.minRefreshSeconds * 1000);
    expect(w.next.updateTimeline).toHaveBeenCalledTimes(2);
    const last = w.next.updateTimeline.mock.calls[1][0] as { props: { state: string } }[];
    expect(last[0].props.state).toBe('statement'); // the evening timeline, not the afternoon one again
  });

  test('only the latest of several deferred timelines is written, once', () => {
    const { w, writer, advance } = writerWithClock();
    writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' });
    advance(1000);
    writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' });
    advance(1000);
    writer.write(WIDGET_ADMIN_EVENING, colors, { memberId: 'm_admin' });
    advance(WIDGET_TIMELINE.minRefreshSeconds * 1000);
    expect(w.next.updateTimeline).toHaveBeenCalledTimes(2);
    expect((w.next.updateTimeline.mock.calls[1][0] as { props: { state: string } }[])[0].props.state).toBe('statement');
  });

  test('sign-out cancels a deferred write, so nothing personal lands after it', () => {
    const { w, writer, advance, pending } = writerWithClock();
    writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' });
    advance(1000);
    writer.write(WIDGET_ADMIN_EVENING, colors, { memberId: 'm_admin' });
    writer.signOut(colors);
    expect(pending()).toBe(0);
    advance(WIDGET_TIMELINE.minRefreshSeconds * 1000);
    expect(w.next.updateTimeline).toHaveBeenCalledTimes(1);
  });

  test('dispose cancels a deferred write (unmount)', () => {
    const { w, writer, advance, pending } = writerWithClock();
    writer.write(WIDGET_ADMIN_AFTERNOON, colors, { memberId: 'm_admin' });
    advance(1000);
    writer.write(WIDGET_ADMIN_EVENING, colors, { memberId: 'm_admin' });
    writer.dispose();
    expect(pending()).toBe(0);
    advance(WIDGET_TIMELINE.minRefreshSeconds * 1000);
    expect(w.next.updateTimeline).toHaveBeenCalledTimes(1);
  });
});
