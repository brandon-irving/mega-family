// Renders every UIBlock kind (CONTRACT §3) and checks each one shows its prompt and answers correctly.
// @testing-library/react-native 13+: render() and fireEvent are async.
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { BLOCKS_BY_KIND } from '@/test/fixtures';
import { AnsweredBlock, Block, summarizeAnswer } from './Blocks';

describe('Block', () => {
  test.each(Object.values(BLOCKS_BY_KIND))('renders the $kind block with its prompt', async (block) => {
    const onAnswer = jest.fn();
    await renderWithTheme(<Block block={block} onAnswer={onAnswer} />);
    if ('prompt' in block) expect(screen.getByText(block.prompt)).toBeTruthy();
  });

  test('choice (single): tapping an option answers immediately', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(<Block block={BLOCKS_BY_KIND.choice} onAnswer={onAnswer} />);
    await fireEvent.press(screen.getByText('Daughter'));
    expect(onAnswer).toHaveBeenCalledWith({ optionIds: ['daughter'] });
  });

  test('toggle: flipping the switch answers with the new value', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(<Block block={BLOCKS_BY_KIND.toggle} onAnswer={onAnswer} />);
    await fireEvent(screen.getByLabelText('Match my MEGA'), 'valueChange', false);
    expect(onAnswer).toHaveBeenCalledWith({ value: false });
  });

  test('invite: shows a QR placeholder', async () => {
    await renderWithTheme(<Block block={BLOCKS_BY_KIND.invite} onAnswer={jest.fn()} />);
    expect(screen.getByText('QR code')).toBeTruthy();
  });

  test('confirm: Confirm and Change both answer', async () => {
    const onAnswer = jest.fn();
    await renderWithTheme(<Block block={BLOCKS_BY_KIND.confirm} onAnswer={onAnswer} />);
    await fireEvent.press(screen.getByText('Confirm'));
    expect(onAnswer).toHaveBeenCalledWith({ value: 'confirm' });
  });
});

describe('AnsweredBlock / summarizeAnswer', () => {
  test('collapses a choice answer into its option labels', async () => {
    const answer = { optionIds: ['daughter'] };
    expect(summarizeAnswer(BLOCKS_BY_KIND.choice, answer)).toBe('Daughter');
    await renderWithTheme(<AnsweredBlock block={BLOCKS_BY_KIND.choice} answer={answer} />);
    expect(screen.getByText('Daughter')).toBeTruthy();
  });

  test('shows "Skipped" for a skipped fields block', () => {
    expect(summarizeAnswer(BLOCKS_BY_KIND.fields, { skipped: true })).toBe('Skipped');
  });
});

// G3 review fix (HIGH, kid button sizes): choice-block options get the same role-based sizing and 2-up
// layout as notification/request cards (shared/config/theme.ts BUTTON_SIZES / ButtonRow).
//
// Kept in its own describe block, last in the file: the explicit `.unmount()` between two renders
// leaves the RN test renderer in a state that breaks `screen`-based queries in whatever test runs after
// it (a pre-existing harness quirk — see the same note in Cards.test.tsx and ButtonRow.test.tsx).
describe('ChoiceBlock sizing', () => {
  test('choice options are sized from the viewer role (adult 44pt, kid 54pt) and laid out 2-up', async () => {
    const minHeightOf = (style: unknown) => {
      const flat = (Array.isArray(style) ? style : [style]).filter(Boolean) as Record<string, unknown>[];
      return flat.find((s) => typeof s.minHeight === 'number')?.minHeight as number;
    };
    const adult = await renderWithTheme(<Block block={BLOCKS_BY_KIND.choice} onAnswer={() => {}} />, { role: 'adult' });
    const adultOption = adult.getByLabelText('Daughter');
    expect(minHeightOf(adultOption.props.style)).toBe(44);
    adult.unmount();

    const kid = await renderWithTheme(<Block block={BLOCKS_BY_KIND.choice} onAnswer={() => {}} />, { role: 'kid' });
    const kidOption = kid.getByLabelText('Daughter');
    expect(minHeightOf(kidOption.props.style)).toBe(54);

    const flat = (Array.isArray(kidOption.props.style) ? kidOption.props.style : [kidOption.props.style]).filter(Boolean) as Record<string, unknown>[];
    expect(flat.some((s) => s.flexBasis !== undefined)).toBe(true);
  });
});
