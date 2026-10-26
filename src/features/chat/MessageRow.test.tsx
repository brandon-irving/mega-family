// Renders one message of every MessageBody type (CONTRACT §3). MEGA/system messages show a badge
// with no bubble; the viewer's own text message is a bubble (PLAN §1).
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { FIXTURE_IDS, MESSAGES_BY_TYPE, SAMPLE_SAVE_CHIP, TEAL_INFO } from '@/test/fixtures';
import { ThemeProvider } from '@/ui/theme';
import { MessageRow } from './MessageRow';

const noop = () => {};
const megaById = { [FIXTURE_IDS.teal]: TEAL_INFO };

describe('MessageRow', () => {
  test("text: the viewer's own message renders its text", async () => {
    await renderWithTheme(
      <MessageRow message={MESSAGES_BY_TYPE.text} isMine mega={null} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />,
    );
    expect(screen.getByText('We are out of milk.')).toBeTruthy();
  });

  test('block: an unanswered block shows the MEGA badge and its prompt', async () => {
    await renderWithTheme(
      <MessageRow message={MESSAGES_BY_TYPE.block} isMine={false} mega={TEAL_INFO} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />,
    );
    expect(screen.getByText('Teal')).toBeTruthy();
    expect(screen.getByText('Who should I add first?')).toBeTruthy();
  });

  test('answer: shows the collapsed answer label', async () => {
    await renderWithTheme(
      <MessageRow message={MESSAGES_BY_TYPE.answer} isMine mega={null} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />,
    );
    expect(screen.getByText('Partner')).toBeTruthy();
  });

  test('card: renders the card kind (weather)', async () => {
    await renderWithTheme(
      <MessageRow message={MESSAGES_BY_TYPE.card} isMine={false} mega={TEAL_INFO} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />,
    );
    expect(screen.getByText('Clear, 68°F')).toBeTruthy();
  });

  test('image: uses the caption as the accessibility label', async () => {
    await renderWithTheme(
      <MessageRow message={MESSAGES_BY_TYPE.image} isMine={false} mega={TEAL_INFO} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />,
    );
    expect(screen.getByLabelText('Grocery receipt')).toBeTruthy();
  });

  test('notice: renders the system text', async () => {
    await renderWithTheme(
      <MessageRow message={MESSAGES_BY_TYPE.notice} isMine={false} mega={null} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />,
    );
    expect(screen.getByText('From a notification · 2m ago')).toBeTruthy();
  });

  test('answering a block end to end: tapping an option calls onAnswerBlock, and the answered message collapses into the answer bubble (G2 §3)', async () => {
    const onAnswerBlock = jest.fn();
    const { rerender } = await renderWithTheme(
      <MessageRow message={MESSAGES_BY_TYPE.block} isMine={false} mega={TEAL_INFO} onAnswerBlock={onAnswerBlock} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />,
    );
    expect(screen.getByText('Who should I add first?')).toBeTruthy();

    await fireEvent.press(screen.getByText('Partner'));
    expect(onAnswerBlock).toHaveBeenCalledWith({ optionIds: ['a'] });

    // The real flow shape: the block message gets `answeredWith` set in place (same _id), re-rendering
    // the same row — it collapses from the interactive block into the plain answer line.
    const answered = { ...MESSAGES_BY_TYPE.block, body: { ...MESSAGES_BY_TYPE.block.body, answeredWith: { optionIds: ['a'] } } };
    // renderWithTheme wraps the tree in ThemeProvider itself, so a rerender needs the same wrapper —
    // rerender() replaces the whole root, not just the element renderWithTheme was originally given.
    await rerender(
      <ThemeProvider initialRole="adult">
        <MessageRow message={answered} isMine={false} mega={TEAL_INFO} onAnswerBlock={onAnswerBlock} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Who should I add first?')).toBeNull(); // the interactive block prompt is gone
    expect(screen.getByLabelText('Answered: Partner')).toBeTruthy(); // collapsed into the plain answer line
  });

  test('a save chip under a message is read-only for a kid viewer', async () => {
    const withChip = { ...MESSAGES_BY_TYPE.text, chips: [SAMPLE_SAVE_CHIP] };
    await renderWithTheme(
      <MessageRow message={withChip} isMine mega={null} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} chipsReadOnly />,
    );
    expect(screen.getByLabelText('Saved, Family')).toBeTruthy(); // no "Tap to change" affordance in the label
  });

  test('renders every MessageBody type without throwing', async () => {
    for (const message of Object.values(MESSAGES_BY_TYPE)) {
      const mega = message.author.kind === 'mega' ? megaById[message.author.id] ?? null : null;
      await expect(
        renderWithTheme(
          <MessageRow message={message} isMine={message.author.kind === 'member'} mega={mega} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />,
        ),
      ).resolves.toBeTruthy();
    }
  });
});
