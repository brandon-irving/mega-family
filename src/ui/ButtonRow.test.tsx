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
});
