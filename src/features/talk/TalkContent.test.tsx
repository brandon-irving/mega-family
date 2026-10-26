// G2 scope: mention chips are removable before sending, streaming captions, and friendly error lines.
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { TEAL_INFO } from '@/test/fixtures';
import { TalkContent } from './TalkContent';

const noop = () => {};
const MENTIONS = [
  { megaId: 'megas_zap' as never, heard: 'Zap', start: 0, end: 3, confidence: 0.9 },
  { megaId: 'megas_sunny' as never, heard: 'Sunny', start: 8, end: 13, confidence: 0.8 },
];

describe('TalkContent', () => {
  test('review phase shows the transcript and a removable @ chip per mention', async () => {
    const onRemoveMention = jest.fn();
    await renderWithTheme(
      <TalkContent
        mega={TEAL_INFO}
        phase="review"
        caption="Ask Zap and Sunny about homework"
        mentions={MENTIONS}
        reply=""
        error={null}
        onHoldStart={noop}
        onSlideLock={noop}
        onRelease={noop}
        onRemoveMention={onRemoveMention}
        onSend={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText('Ask Zap and Sunny about homework')).toBeTruthy();
    expect(screen.getByLabelText('Remove @Zap mention')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Remove @Zap mention'));
    expect(onRemoveMention).toHaveBeenCalledWith(0);
  });

  test('speaking phase shows the streamed reply as captions', async () => {
    await renderWithTheme(
      <TalkContent mega={TEAL_INFO} phase="speaking" caption="" mentions={[]} reply="Sure, I can help with that" error={null} onHoldStart={noop} onSlideLock={noop} onRelease={noop} onRemoveMention={noop} onSend={noop} onClose={noop} />,
    );
    expect(screen.getByText('Sure, I can help with that')).toBeTruthy();
  });

  test('idle phase with an error shows the friendly retry line', async () => {
    await renderWithTheme(
      <TalkContent mega={TEAL_INFO} phase="idle" caption="" mentions={[]} reply="" error="I didn't catch that — try again?" onHoldStart={noop} onSlideLock={noop} onRelease={noop} onRemoveMention={noop} onSend={noop} onClose={noop} />,
    );
    expect(screen.getByText("I didn't catch that — try again?")).toBeTruthy();
  });

  test('✕ closes talk mode', async () => {
    const onClose = jest.fn();
    await renderWithTheme(
      <TalkContent mega={TEAL_INFO} phase="idle" caption="" mentions={[]} reply="" error={null} onHoldStart={noop} onSlideLock={noop} onRelease={noop} onRemoveMention={noop} onSend={noop} onClose={onClose} />,
    );
    await fireEvent.press(screen.getByLabelText('Close talk mode'));
    expect(onClose).toHaveBeenCalled();
  });
});
