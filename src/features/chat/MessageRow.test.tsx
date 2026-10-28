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

  // Owner's Oct 28 walkthrough: a long own message was clipped off the left edge on web, and a short one
  // ("Answered") wrapped mid-word. Both came from the bubble's maxWidth: '82%' resolving against a parent
  // with no width of its own, so the row column itself must carry the width limit and be allowed to shrink.
  test.each([
    ['text', MESSAGES_BY_TYPE.text],
    ['answer', MESSAGES_BY_TYPE.answer],
  ])("%s: the viewer's own message column carries the width limit (no clipping, no mid-word wrap)", async (_kind, message) => {
    await renderWithTheme(<MessageRow message={message} isMine mega={null} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />);
    const column = screen.getByTestId('message-column');
    const style = Object.assign({}, ...[column.props.style].flat());
    expect(style.maxWidth).toBe('82%');
    expect(style.flexShrink).toBe(1);
    const bubble = screen.getByTestId('bubble');
    expect(Object.assign({}, ...[bubble.props.style].flat()).maxWidth).toBe('100%');
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

  // G3 review fix (BLOCKER, "From a notification" notice — CONTRACT §6).
  test('noticeSentAt renders the "From a notification" pill above the row', async () => {
    await renderWithTheme(
      <MessageRow message={MESSAGES_BY_TYPE.text} isMine mega={null} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} noticeSentAt={Date.now() - 2 * 60_000} />,
    );
    expect(screen.getByText('From a notification · 2m ago')).toBeTruthy();
  });

  test('no noticeSentAt renders no pill', async () => {
    await renderWithTheme(
      <MessageRow message={MESSAGES_BY_TYPE.text} isMine mega={null} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />,
    );
    expect(screen.queryByText(/From a notification/)).toBeNull();
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

  // A MEGA reply still being written is an empty text message with a streamId; its words show in the chat
  // screen's streaming line (typing dots, then the text), so the row itself renders nothing until it lands.
  test('a MEGA reply still being written renders nothing (no bare name line under the badge)', async () => {
    const writing = { ...MESSAGES_BY_TYPE.text, author: { kind: 'mega' as const, id: FIXTURE_IDS.teal }, body: { type: 'text' as const, text: '' }, streamId: 's1' };
    await renderWithTheme(<MessageRow message={writing} isMine={false} mega={TEAL_INFO} onAnswerBlock={noop} onReact={noop} onChangeMemoryScope={noop} onForgetMemory={noop} />);
    expect(screen.queryByText('Teal')).toBeNull();
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
