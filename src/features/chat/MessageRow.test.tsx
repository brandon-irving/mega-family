// Renders one message of every MessageBody type (CONTRACT §3). MEGA/system messages show a badge
// with no bubble; the viewer's own text message is a bubble (PLAN §1).
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { FIXTURE_IDS, MESSAGES_BY_TYPE, TEAL_INFO } from '@/test/fixtures';
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
