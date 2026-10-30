// G2 fix item 4 (MessageList.tsx:76-96): "stabilize renderItem and per-row callbacks ... so memo'd
// MessageRow doesn't re-render on each streamed token". Mocks MessageRow with a render counter — still
// wrapped in the *same* React.memo default (shallow prop) comparison the real export uses, via
// `jest.requireActual` — so this measures exactly what matters: does a row whose own `message` is
// unchanged bail out of re-rendering when a *different* row's text updates in a fresh `messages` array
// (the same shape a streamed reply produces via `chat.thread`'s paginated query updating).
import type { ReactElement } from 'react';
import { act, screen } from '@testing-library/react-native';
import type { Id } from '@shared/domain/validators';
import { LIMITS } from '@shared/config/limits';
import { ThemeProvider } from '@/ui/theme';
import { MESSAGES_BY_TYPE, FIXTURE_IDS, NOTIFICATION_FIXTURE, TEAL_INFO } from '@/test/fixtures';
import { renderWithTheme } from '@/test/renderWithTheme';
import { MessageList, type MessageDoc } from './MessageList';

// G4: the search/weather/travel cards read the viewer's timezone and role (src/features/integrations).
jest.mock('@/data/useViewer', () => ({ useViewer: () => ({ member: { role: 'adult' }, family: { timezone: 'America/New_York' } }) }));

// jest's babel-plugin-jest-hoist moves this `jest.mock` call above every import above, including
// `./MessageList`'s — so MessageList picks up the mocked `./MessageRow` even though this call reads
// textually after the real imports (the repo's established pattern; see AuthGate.test.tsx). The hoist
// plugin only allows a factory to close over out-of-scope identifiers named `mock*`, hence `mockRenderCounts`.
const mockRenderCounts: Record<string, number> = {};
const mockLastProps: Record<string, Record<string, unknown>> = {};

jest.mock('./MessageRow', () => {
  // babel-plugin-jest-hoist only allow-lists `require` (plus `mock*`-prefixed identifiers) inside a
  // `jest.mock()` factory — a real `import` of `react` up top would be an "out-of-scope variable"
  // reference and fail at mock-registration time, hence `require` here specifically.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const React = require('react');
  const actual = jest.requireActual('./MessageRow');
  const Inner = actual.MessageRow.type; // the unmemoized function React.memo(...) wraps
  const MessageRow = React.memo(function MessageRowSpy(props: Record<string, unknown> & { message: { _id: string } }) {
    mockRenderCounts[props.message._id] = (mockRenderCounts[props.message._id] ?? 0) + 1;
    mockLastProps[props.message._id] = props;
    return React.createElement(Inner, props);
  });
  return { ...actual, MessageRow };
});

const noop = () => {};
const isMine = () => false;
const megaById = { [FIXTURE_IDS.teal]: TEAL_INFO };

describe('MessageList row stability', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockRenderCounts)) delete mockRenderCounts[key];
  });

  test("a row whose message hasn't changed does not re-render when another row's text updates", async () => {
    const streaming = MESSAGES_BY_TYPE.notice; // { type: 'notice', text: '...' } — simplest body to mutate
    const stable = MESSAGES_BY_TYPE.text;
    const firstSave = jest.fn().mockResolvedValue('idea-1');
    const latestSave = jest.fn().mockResolvedValue('idea-1');

    const { rerender } = await renderWithTheme(
      <MessageList messages={[streaming, stable]} isMine={isMine} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} onSaveIdea={(id) => firstSave(id)} />,
    );
    expect(mockRenderCounts[streaming._id]).toBe(1);
    expect(mockRenderCounts[stable._id]).toBe(1);

    // A streamed token arriving: only `streaming`'s text changes, in a brand-new `messages` array — the
    // same shape a real `chat.thread` update hands MessageList (a fresh array, most items unchanged).
    const streamingUpdated = { ...streaming, body: { ...streaming.body, text: `${(streaming.body as { text: string }).text}more` } };
    await act(async () => {
      await rerender(
        <ThemeProvider initialRole="adult">
          <MessageList messages={[streamingUpdated, stable]} isMine={isMine} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} onSaveIdea={(id) => latestSave(id)} />
        </ThemeProvider>,
      );
    });

    expect(mockRenderCounts[streaming._id]).toBe(2); // the row that actually changed re-renders — expected
    expect(mockRenderCounts[stable._id]).toBe(1); // the untouched row must NOT re-render
    await (mockLastProps[stable._id].onSaveIdea as () => Promise<unknown>)();
    expect(latestSave).toHaveBeenCalledWith(stable._id);
    expect(firstSave).not.toHaveBeenCalled();
  });
});

// CONTRACT §6: "mega://chat/<messageId> (scrolls to the message, adds a notice)" — scrollToMessageId
// drives MessageRow's `highlighted` prop, which fades out on its own timer (MessageList.tsx's
// HIGHLIGHT_DURATION_MS).
describe('MessageList scroll-to-message highlight', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockRenderCounts)) delete mockRenderCounts[key];
    for (const key of Object.keys(mockLastProps)) delete mockLastProps[key];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('the target message is highlighted, others are not', async () => {
    const target = MESSAGES_BY_TYPE.notice;
    const other = MESSAGES_BY_TYPE.text;
    await renderWithTheme(
      <MessageList
        messages={[other, target]}
        isMine={isMine}
        megaById={megaById}
        onAnswerBlock={noop}
        onReact={noop}
        onChangeMemoryScope={noop}
        onForgetMemory={noop}
        scrollToMessageId={target._id}
      />,
    );
    expect(mockLastProps[target._id]?.highlighted).toBe(true);
    expect(mockLastProps[other._id]?.highlighted).toBe(false);
  });

  test('the highlight clears on its own after HIGHLIGHT_DURATION_MS', async () => {
    const target = MESSAGES_BY_TYPE.notice;
    await renderWithTheme(
      <MessageList messages={[target]} isMine={isMine} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} scrollToMessageId={target._id} />,
    );
    expect(mockLastProps[target._id]?.highlighted).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockLastProps[target._id]?.highlighted).toBe(false);
  });

  test('incoming messages do not keep extending the highlight timer', async () => {
    const target = MESSAGES_BY_TYPE.notice;
    const { rerender } = await renderWithTheme(
      <MessageList messages={[target]} isMine={isMine} megaById={megaById} scrollToMessageId={target._id} />,
    );
    await act(async () => jest.advanceTimersByTime(1500));
    await rerender(
      <ThemeProvider initialRole="adult">
        <MessageList messages={[MESSAGES_BY_TYPE.text, target]} isMine={isMine} megaById={megaById} scrollToMessageId={target._id} />
      </ThemeProvider>,
    );
    await act(async () => jest.advanceTimersByTime(1000));
    expect(mockLastProps[target._id]?.highlighted).toBe(false);
  });

  test('no scrollToMessageId means nothing is highlighted', async () => {
    const target = MESSAGES_BY_TYPE.notice;
    await renderWithTheme(<MessageList messages={[target]} isMine={isMine} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />);
    expect(mockLastProps[target._id]?.highlighted).toBe(false);
  });
});

// G3 review fix (BLOCKER, deep link to an older message): MessageList.tsx used to return silently
// (MessageList.tsx ~122-134) when `scrollToMessageId` wasn't in the first loaded page. It must instead
// call `onLoadMore` repeatedly — bounded by LIMITS.chat.deepLinkMaxLoadMorePages — until the target
// turns up or pagination is exhausted, then show a small notice if it's never found.
describe('MessageList deep-link load-more search', () => {
  const other = MESSAGES_BY_TYPE.text;
  const target = MESSAGES_BY_TYPE.notice;

  /** One decoy message per "older page" so each render passes a messages array with a different
   * identity/content than the last — the same shape a real `onLoadMore` resolving another page of
   * `chat.thread` produces, and what the search effect actually keys its re-run off of. */
  function pageWithDecoys(count: number): MessageDoc[] {
    const decoys = Array.from({ length: count }, (_, i) => ({ ...other, _id: `decoy_${i}` as Id<'messages'> }));
    return [other, ...decoys];
  }

  beforeEach(() => {
    for (const key of Object.keys(mockRenderCounts)) delete mockRenderCounts[key];
    for (const key of Object.keys(mockLastProps)) delete mockLastProps[key];
  });

  async function rerenderWith(rerender: (ui: ReactElement) => Promise<void> | void, messages: MessageDoc[], onLoadMore: () => void, paginationExhausted = false) {
    await act(async () => {
      await rerender(
        <ThemeProvider initialRole="adult">
          <MessageList messages={messages} isMine={isMine} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} scrollToMessageId={target._id} onLoadMore={onLoadMore} paginationExhausted={paginationExhausted} />
        </ThemeProvider>,
      );
    });
  }

  test('target absent: calls onLoadMore, and once a later page includes it, scrolls and highlights — without ever showing the not-found notice', async () => {
    const onLoadMore = jest.fn();
    const { rerender } = await renderWithTheme(
      <MessageList messages={pageWithDecoys(1)} isMine={isMine} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} scrollToMessageId={target._id} onLoadMore={onLoadMore} />,
    );
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(mockLastProps[target._id]).toBeUndefined(); // not loaded yet — nothing to highlight

    // A second page arrives, still without the target — onLoadMore is called again.
    await rerenderWith(rerender, pageWithDecoys(2), onLoadMore);
    expect(onLoadMore).toHaveBeenCalledTimes(2);

    // A third page finally includes the target.
    await rerenderWith(rerender, [...pageWithDecoys(2), target], onLoadMore);
    expect(onLoadMore).toHaveBeenCalledTimes(2); // found — no further calls
    expect(mockLastProps[target._id]?.highlighted).toBe(true);
    expect(screen.queryByText("Couldn’t find that message")).toBeNull();
  });

  test('pagination exhausted before the target ever appears shows a "couldn\'t find" notice instead of nothing', async () => {
    const onLoadMore = jest.fn();
    await renderWithTheme(
      <MessageList messages={pageWithDecoys(1)} isMine={isMine} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} scrollToMessageId={target._id} onLoadMore={onLoadMore} paginationExhausted />,
    );

    expect(onLoadMore).not.toHaveBeenCalled(); // already exhausted — nothing left to load
    expect(screen.getByText("Couldn’t find that message")).toBeTruthy();
  });

  test('the search is bounded even if pagination never reports exhausted', async () => {
    const onLoadMore = jest.fn();
    const { rerender } = await renderWithTheme(
      <MessageList messages={pageWithDecoys(1)} isMine={isMine} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} scrollToMessageId={target._id} onLoadMore={onLoadMore} />,
    );

    for (let page = 2; page <= LIMITS.chat.deepLinkMaxLoadMorePages + 3; page++) {
      await rerenderWith(rerender, pageWithDecoys(page), onLoadMore);
    }

    expect(onLoadMore).toHaveBeenCalledTimes(LIMITS.chat.deepLinkMaxLoadMorePages);
    expect(screen.getByText("Couldn’t find that message")).toBeTruthy();
  });
});

// G3 review fix (BLOCKER, "From a notification" notice — CONTRACT §6): integration through the real
// MessageList -> MessageRow -> NotificationNotice path (not just the pill component in isolation),
// confirming the pill only shows above the one message the deep link was actually for.
describe('MessageList "From a notification" notice', () => {
  test('the deep-linked message carrying fromNotificationId shows the pill; an unrelated message does not', async () => {
    const target = { ...MESSAGES_BY_TYPE.text, _id: 'messages_target' as Id<'messages'>, fromNotificationId: NOTIFICATION_FIXTURE._id };
    const other = MESSAGES_BY_TYPE.card;

    await renderWithTheme(
      <MessageList
        messages={[other, target]}
        isMine={isMine}
        megaById={megaById}
        onAnswerBlock={noop}
        onReact={noop}
        onChangeMemoryScope={noop}
        onForgetMemory={noop}
        scrollToMessageId={target._id}
        notificationsById={{ [NOTIFICATION_FIXTURE._id]: NOTIFICATION_FIXTURE }}
      />,
    );

    expect(screen.getByText(/From a notification/)).toBeTruthy();
  });

  test('a message with fromNotificationId that is NOT the deep-link target shows no pill', async () => {
    const notTarget = { ...MESSAGES_BY_TYPE.text, _id: 'messages_other' as Id<'messages'>, fromNotificationId: NOTIFICATION_FIXTURE._id };

    await renderWithTheme(
      <MessageList
        messages={[notTarget]}
        isMine={isMine}
        megaById={megaById}
        onAnswerBlock={noop}
        onReact={noop}
        onChangeMemoryScope={noop}
        onForgetMemory={noop}
        notificationsById={{ [NOTIFICATION_FIXTURE._id]: NOTIFICATION_FIXTURE }}
      />,
    );

    expect(screen.queryByText(/From a notification/)).toBeNull();
  });
});
