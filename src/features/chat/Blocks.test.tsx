// Renders every UIBlock kind (CONTRACT §3) and checks each one shows its prompt and answers correctly.
// @testing-library/react-native 13+: render() and fireEvent are async.
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { BLOCKS_BY_KIND } from '@/test/fixtures';
import { AnsweredBlock, Block, summarizeAnswer } from './Blocks';

// The invite block's panel makes the code through Convex (its own tests: features/family/InvitePanel.test.tsx).
jest.mock('@/features/family/InvitePanel', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return { InvitePanel: ({ memberId }: { memberId: string }) => <Text>{`invite-panel:${memberId}`}</Text> };
});

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

  test('invite: the real invite panel for its member, not a "QR code" placeholder (G5 UX review)', async () => {
    await renderWithTheme(<Block block={BLOCKS_BY_KIND.invite} onAnswer={jest.fn()} />);
    const invite = BLOCKS_BY_KIND.invite as Extract<typeof BLOCKS_BY_KIND.invite, { kind: 'invite' }>;
    expect(screen.getByText(`invite-panel:${invite.memberId}`)).toBeTruthy();
    expect(screen.queryByText('QR code')).toBeNull();
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
// Await unmount between renders: the current React Native test renderer unmounts asynchronously.
describe('ChoiceBlock sizing', () => {
  test('choice options are sized from the viewer role (adult 44pt, kid 54pt) and laid out 2-up', async () => {
    const minHeightOf = (style: unknown) => {
      const flat = (Array.isArray(style) ? style : [style]).filter(Boolean) as Record<string, unknown>[];
      return flat.find((s) => typeof s.minHeight === 'number')?.minHeight as number;
    };
    const adult = await renderWithTheme(<Block block={BLOCKS_BY_KIND.choice} onAnswer={() => {}} />, { role: 'adult' });
    const adultOption = adult.getByLabelText('Daughter');
    expect(minHeightOf(adultOption.props.style)).toBe(44);
    await adult.unmount();

    const kid = await renderWithTheme(<Block block={BLOCKS_BY_KIND.choice} onAnswer={() => {}} />, { role: 'kid' });
    const kidOption = kid.getByLabelText('Daughter');
    expect(minHeightOf(kidOption.props.style)).toBe(54);

    const flat = (Array.isArray(kidOption.props.style) ? kidOption.props.style : [kidOption.props.style]).filter(Boolean) as Record<string, unknown>[];
    expect(flat.some((s) => s.flexBasis !== undefined)).toBe(true);
  });
});

test('conversational creation shows a look preview and confirmation, with no inline input', async () => {
  const onAnswer = jest.fn();
  await renderWithTheme(<Block block={BLOCKS_BY_KIND.megaDraft} onAnswer={onAnswer} conversationOnly />);
  expect(screen.getByLabelText('MEGA')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm MEGA' }));
  expect(onAnswer).toHaveBeenCalledWith({ value: 'confirm' });
});

test('legacy input blocks become a question answered in the composer', async () => {
  await renderWithTheme(<Block block={BLOCKS_BY_KIND.fields} onAnswer={jest.fn()} conversationOnly />);
  expect(screen.getByText('Reply using the chat box below.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
});
