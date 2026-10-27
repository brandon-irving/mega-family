// G2 fix item 4 (MessageList.tsx:76-96): "stabilize renderItem and per-row callbacks ... so memo'd
// MessageRow doesn't re-render on each streamed token". Mocks MessageRow with a render counter — still
// wrapped in the *same* React.memo default (shallow prop) comparison the real export uses, via
// `jest.requireActual` — so this measures exactly what matters: does a row whose own `message` is
// unchanged bail out of re-rendering when a *different* row's text updates in a fresh `messages` array
// (the same shape a streamed reply produces via `chat.thread`'s paginated query updating).
import { act } from '@testing-library/react-native';
import { ThemeProvider } from '@/ui/theme';
import { MESSAGES_BY_TYPE, FIXTURE_IDS, TEAL_INFO } from '@/test/fixtures';
import { renderWithTheme } from '@/test/renderWithTheme';
import { MessageList } from './MessageList';

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

    const { rerender } = await renderWithTheme(
      <MessageList messages={[streaming, stable]} isMine={isMine} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />,
    );
    expect(mockRenderCounts[streaming._id]).toBe(1);
    expect(mockRenderCounts[stable._id]).toBe(1);

    // A streamed token arriving: only `streaming`'s text changes, in a brand-new `messages` array — the
    // same shape a real `chat.thread` update hands MessageList (a fresh array, most items unchanged).
    const streamingUpdated = { ...streaming, body: { ...streaming.body, text: `${(streaming.body as { text: string }).text}more` } };
    await act(async () => {
      await rerender(
        <ThemeProvider initialRole="adult">
          <MessageList messages={[streamingUpdated, stable]} isMine={isMine} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />
        </ThemeProvider>,
      );
    });

    expect(mockRenderCounts[streaming._id]).toBe(2); // the row that actually changed re-renders — expected
    expect(mockRenderCounts[stable._id]).toBe(1); // the untouched row must NOT re-render
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

  test('no scrollToMessageId means nothing is highlighted', async () => {
    const target = MESSAGES_BY_TYPE.notice;
    await renderWithTheme(<MessageList messages={[target]} isMine={isMine} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />);
    expect(mockLastProps[target._id]?.highlighted).toBe(false);
  });
});
