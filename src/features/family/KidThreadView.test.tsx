// Same ordering contract as ChatThread (family.kidThread also returns newest-first) — shares the same
// renderer (DRY), so this just proves KidThreadView wires it the same way: an inverted FlatList fed the
// newest-first page unchanged.
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { queryFlatListProps } from '@/test/queryFlatList';
import { MESSAGES_BY_TYPE } from '@/test/fixtures';
import { KidThreadView } from './KidThreadView';

const megaById = {};

function msg(id: string, text: string) {
  return { ...MESSAGES_BY_TYPE.text, _id: id as never, body: { type: 'text' as const, text } };
}

const messages = [msg('m3', 'newest'), msg('m2', 'middle'), msg('m1', 'oldest')];

describe('KidThreadView message order', () => {
  test('renders through an inverted FlatList, fed the newest-first page unchanged', async () => {
    await renderWithTheme(<KidThreadView messages={messages} megaById={megaById} />);
    const props = queryFlatListProps(screen.root);
    expect(props.inverted).toBe(true);
    expect((props.data as { body: { text: string } }[]).map((m) => m.body.text)).toEqual(['newest', 'middle', 'oldest']);
  });
});
