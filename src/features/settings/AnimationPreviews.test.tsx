import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { TEAL_INFO } from '@/test/fixtures';
import { AnimationPreviews } from './AnimationPreviews';
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/data/useChat', () => ({ useChatEntrance: jest.fn(() => { throw new Error('Preview must not read real entrance progress'); }), useFinishChatEntrance: jest.fn(() => { throw new Error('Preview must not change real entrance progress'); }) }));
test('gallery can open, select a sprite animation, replay and close without touching onboarding', async () => {
  jest.useFakeTimers();
  const clearFrames = jest.spyOn(global, 'clearInterval');
  try {
    const result = await renderWithTheme(<AnimationPreviews mega={TEAL_INFO} />);
    await fireEvent.press(screen.getByText('Animation previews'));
    expect(screen.getByText('First chat entrance')).toBeTruthy();
    await fireEvent(screen.getByTestId('animation-preview-stage'), 'layout', { nativeEvent: { layout: { width: 350 } } });
    await fireEvent.press(screen.getByText('Greeting wave'));
    await fireEvent.press(screen.getByText('Replay animation'));
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByTestId('animation-preview-stage')).toBeNull();
    await result.unmount();
    expect(clearFrames).toHaveBeenCalled();
  } finally { clearFrames.mockRestore(); jest.useRealTimers(); }
});
