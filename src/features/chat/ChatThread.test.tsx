// PLAN §1 + CONTRACT §4 `chat.thread`: pages come back newest-first. The thread must still *read*
// oldest-to-newest top-to-bottom, with the newest message pinned to the bottom and "Load earlier"
// anchored at the visual top — done with an *inverted* FlatList (RN docs: inverted flips both the scroll
// direction and where ListHeaderComponent/ListFooterComponent render), not scrollToEnd on a plain list.
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { queryFlatListProps } from '@/test/queryFlatList';
import { FIXTURE_IDS, MESSAGES_BY_TYPE } from '@/test/fixtures';
import { ChatThread } from './ChatThread';

const noop = () => {};
const megaById = {};

function msg(id: string, text: string) {
  return { ...MESSAGES_BY_TYPE.text, _id: id as never, body: { type: 'text' as const, text } };
}

// newest-first, exactly as chat.thread's pagination returns it.
const messages = [msg('m3', 'newest'), msg('m2', 'middle'), msg('m1', 'oldest')];

describe('ChatThread message order', () => {
  test('renders through an inverted FlatList, fed the newest-first page unchanged', async () => {
    await renderWithTheme(
      <ChatThread messages={messages} viewerMemberId={FIXTURE_IDS.admin} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />,
    );
    const props = queryFlatListProps(screen.root);
    expect(props.inverted).toBe(true);
    // The array itself must stay newest-first — RN's inverted FlatList does the visual flip (index 0,
    // the newest, renders at the bottom), so reversing it here would put the newest at the top instead.
    expect((props.data as { body: { text: string } }[]).map((m) => m.body.text)).toEqual(['newest', 'middle', 'oldest']);
  });

  test('"Load earlier messages" sits in the ListFooterComponent — the visual top of an inverted list — not the header', async () => {
    await renderWithTheme(
      <ChatThread
        messages={messages}
        viewerMemberId={FIXTURE_IDS.admin}
        megaById={megaById}
        onLoadMore={noop}
        onAnswerBlock={noop}
        onReact={noop}
        onChangeMemoryScope={noop}
        onForgetMemory={noop}
      />,
    );
    const props = queryFlatListProps(screen.root);
    expect(props.ListFooterComponent).toBeTruthy();
    expect(props.ListHeaderComponent).toBeUndefined();
  });
});

// Owner, Oct 28: "There should never be 'No messages yet, say hello'." An empty thread means the MEGA's
// starter (chat.start) is on its way, so the thread shows the loading state, never an empty-state line.
describe('ChatThread with no messages yet', () => {
  test('shows the loading state, not "No messages yet"', async () => {
    await renderWithTheme(<ChatThread messages={[]} viewerMemberId={FIXTURE_IDS.admin} megaById={megaById} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />);
    expect(screen.queryByText(/No messages yet/)).toBeNull();
    expect(screen.getByText('Opening chat…')).toBeTruthy();
  });
});
