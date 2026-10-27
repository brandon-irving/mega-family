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

  test('lays buttons out 2-up (flexBasis ~half), like the design board', async () => {
    await renderWithTheme(<ButtonRow buttons={[{ id: 'yes', label: 'Yes' }, { id: 'cant', label: "I can't" }]} onPress={() => {}} />);
    for (const button of screen.getAllByRole('button')) {
      const flat = (Array.isArray(button.props.style) ? button.props.style : [button.props.style]).filter(Boolean) as Record<string, unknown>[];
      expect(flat.some((s) => s.flexBasis !== undefined)).toBe(true);
    }
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
