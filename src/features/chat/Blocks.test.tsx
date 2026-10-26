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
