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
    await renderWithTheme(<KidThreadView messages={messages} megaById={megaById} kidName="Twin 1" />);
    const props = queryFlatListProps(screen.root);
    expect(props.inverted).toBe(true);
    expect((props.data as { body: { text: string } }[]).map((m) => m.body.text)).toEqual(['newest', 'middle', 'oldest']);
  });
});

// G4 UX review MEDIUM (Oct 28): the parent's read-only view of a kid's chat showed "No messages yet."
// while the transcript was still loading, and the last card sat flush against the tab bar.
describe('KidThreadView loading and spacing', () => {
  test('while the transcript loads it shows the walking-MEGA loader, never "No messages yet."', async () => {
    await renderWithTheme(<KidThreadView messages={[]} megaById={megaById} loading kidName="Twin 1" />);
    expect(screen.queryByText('No messages yet.')).toBeNull();
    expect(screen.getByTestId('kid-thread-loading')).toBeTruthy();
  });

  test('a loaded, truly empty thread says the kid has not chatted yet (not "No messages yet.")', async () => {
    await renderWithTheme(<KidThreadView messages={[]} megaById={megaById} loading={false} kidName="Twin 1" />);
    expect(screen.queryByText('No messages yet.')).toBeNull();
    expect(screen.getByText('Twin 1 hasn’t chatted with their MEGA yet.')).toBeTruthy();
  });

  test('a modal transcript has no phantom tab-bar padding', async () => {
    await renderWithTheme(<KidThreadView messages={messages} megaById={megaById} kidName="Twin 1" />);
    const style = queryFlatListProps(screen.root).contentContainerStyle as { paddingTop?: number };
    expect(style.paddingTop).toBeLessThan(48);
  });
});
