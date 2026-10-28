// G1 fix #3: buttons must always render in the order they're given (the order stored on the
// notification, itself copied from BUTTON_SETS in config) — never reversed or re-sorted by a caller.
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ButtonRow } from './ButtonRow';

describe('ButtonRow', () => {
  test('renders buttons in the exact order given', async () => {
    await renderWithTheme(
      <ButtonRow buttons={[{ id: 'yes', label: 'Yes' }, { id: 'cant', label: "I can't" }]} onPress={() => {}} />,
    );
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Yes', "I can't"]);
  });

  test('reversing the input order reverses the rendered order (it never re-sorts on its own)', async () => {
    await renderWithTheme(
      <ButtonRow buttons={[{ id: 'cant', label: "I can't" }, { id: 'yes', label: 'Yes' }]} onPress={() => {}} />,
    );
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(["I can't", 'Yes']);
  });

  test('pressing a button calls onPress with its id', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<ButtonRow buttons={[{ id: 'on_my_way', label: 'On my way' }]} onPress={onPress} />);
    await fireEvent.press(screen.getByText('On my way'));
    expect(onPress).toHaveBeenCalledWith('on_my_way');
  });

  // Owner, Oct 28 (Image 17): stacked buttons came out content-width ("On my way", "Snooze 5 min" each
  // hugging its label). Rows are explicit now: short labels pair up 2-up and split the row evenly; anything
  // stacked (an odd one out, or labels too long to pair) fills the whole width.
  const styleOf = (el: { props: Record<string, unknown> }) => Object.assign({}, ...([el.props.style].flat(3).filter(Boolean) as object[])) as Record<string, unknown>;

  test('two short labels share one row, each taking an even half', async () => {
    await renderWithTheme(<ButtonRow buttons={[{ id: 'yes', label: 'Yes' }, { id: 'cant', label: "I can't" }]} onPress={() => {}} />);
    expect(screen.getAllByTestId('button-row-line')).toHaveLength(1);
    for (const button of screen.getAllByRole('button')) expect(styleOf(button).flex).toBe(1);
  });

  test('an odd one out gets its own full-width row', async () => {
    await renderWithTheme(<ButtonRow buttons={[{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }, { id: 'c', label: 'Later' }]} onPress={() => {}} />);
    const lines = screen.getAllByTestId('button-row-line');
    expect(lines).toHaveLength(2);
    expect(styleOf(lines[1]).width).toBe('100%');
    expect(styleOf(screen.getAllByRole('button')[2]).flex).toBe(1);
  });

  test('labels too long to pair are stacked, every one full width', async () => {
    await renderWithTheme(<ButtonRow buttons={[{ id: 'a', label: 'On my way right now' }, { id: 'b', label: 'Snooze 5 min' }]} onPress={() => {}} />);
    const lines = screen.getAllByTestId('button-row-line');
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(styleOf(line).width).toBe('100%');
    for (const button of screen.getAllByRole('button')) expect(styleOf(button).flex).toBe(1);
  });

  // G3 review fix (HIGH, kid button sizes): shared/config/theme.ts BUTTON_SIZES, from the design board
  // (design/build/Push.template.html SIZES: adult 44pt/15pt, kid 54pt/18pt) — never a per-call magic
  // number, resolved from the viewer's role.
  //
  // Kept last in the file: the explicit `.unmount()` between two renders leaves the RN test renderer in
  // a state that breaks `screen`-based queries in whatever test runs after it (a pre-existing harness
  // quirk — see the same note in Cards.test.tsx, where this pattern already existed before this fix).
  test('sizes buttons from the viewer role (adult 44pt, kid 54pt), not a per-call magic number', async () => {
    const minHeightOf = (style: unknown) => {
      const flat = (Array.isArray(style) ? style : [style]).filter(Boolean) as Record<string, unknown>[];
      return flat.find((s) => typeof s.minHeight === 'number')?.minHeight as number;
    };
    const adult = await renderWithTheme(<ButtonRow buttons={[{ id: 'yes', label: 'Yes' }]} onPress={() => {}} />, { role: 'adult' });
    expect(minHeightOf(adult.getByRole('button').props.style)).toBe(44);
    adult.unmount();
    const kid = await renderWithTheme(<ButtonRow buttons={[{ id: 'yes', label: 'Yes' }]} onPress={() => {}} />, { role: 'kid' });
    expect(minHeightOf(kid.getByRole('button').props.style)).toBe(54);
  });
});
