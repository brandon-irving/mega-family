import { act, screen } from '@testing-library/react-native';
import { AppState, Text, View, type AppStateStatus } from 'react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { FIXTURE_IDS, TEAL_INFO } from '@/test/fixtures';
import { CHAT_UX } from '@shared/config/chat';
import { CHARACTER_EDITOR } from '@shared/config/characterEditor';
import { ChatEntrance, EntranceAnimation } from './ChatEntrance';

let mockReduced = false;
let mockEntrance = { status: 'ok', data: { pending: true } };
const mockFinish = jest.fn().mockResolvedValue(null);
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/data/useChat', () => ({
  useChatEntrance: () => mockEntrance,
  useFinishChatEntrance: () => mockFinish,
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduced,
}));
const geometry = { width: 390, height: 700, targetX: 32, targetY: 30 };
beforeEach(() => { mockReduced = false; mockEntrance = { status: 'ok', data: { pending: true } }; mockFinish.mockClear(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('first-chat messages stay hidden and there is no skip control', async () => {
  jest.useFakeTimers();
  await renderWithTheme(<ChatEntrance memberId={FIXTURE_IDS.admin} mega={TEAL_INFO}>{() => <View><Text>Saved greeting</Text></View>}</ChatEntrance>);
  expect(screen.queryByText('Saved greeting')).toBeNull();
  expect(screen.queryByText('Open chat')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(CHAT_UX.entrance.fallbackMs); });
  expect(screen.getByText('Saved greeting')).toBeTruthy();
  expect(mockFinish).toHaveBeenCalledWith({ profileKey: FIXTURE_IDS.admin });
});

test('returning chats reveal history immediately without an animation', async () => {
  mockEntrance.data.pending = false;
  await renderWithTheme(<ChatEntrance memberId={FIXTURE_IDS.admin} mega={TEAL_INFO}>{() => <Text>History</Text>}</ChatEntrance>);
  expect(screen.getByText('History')).toBeTruthy();
  expect(screen.queryByTestId('chat-entrance')).toBeNull();
  expect(mockFinish).not.toHaveBeenCalled();
});

test('walk and wave dock into the badge, then typing completes once', async () => {
  jest.useFakeTimers();
  const onComplete = jest.fn();
  await renderWithTheme(<EntranceAnimation mega={TEAL_INFO} geometry={geometry} onComplete={onComplete} />);
  const walk = CHARACTER_EDITOR.introduction;
  await act(async () => { jest.advanceTimersByTime(CHAT_UX.entrance.walkMs + walk.waveFrameMs * CHAT_UX.entrance.waveFrames + CHAT_UX.entrance.greetingMs + CHAT_UX.entrance.dockMs); });
  expect(screen.getByText('Teal is typing…')).toBeTruthy();
  expect(onComplete).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(CHAT_UX.entrance.typingMs); });
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('reduced motion uses the short fade/typing path and unmount cancels work', async () => {
  jest.useFakeTimers(); mockReduced = true;
  const onComplete = jest.fn();
  const result = await renderWithTheme(<EntranceAnimation mega={TEAL_INFO} geometry={geometry} onComplete={onComplete} />);
  expect(screen.getByText('Teal is typing…')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(CHAT_UX.entrance.reducedMs + CHAT_UX.entrance.typingMs); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  await result.unmount();
  await act(async () => { jest.advanceTimersByTime(10000); });
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('backgrounding ends the sequence and cancels pending frame work', async () => {
  jest.useFakeTimers();
  let change: ((state: AppStateStatus) => void) | undefined;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => { change = listener; return { remove }; });
  const onComplete = jest.fn();
  const result = await renderWithTheme(<EntranceAnimation mega={TEAL_INFO} geometry={geometry} onComplete={onComplete} />);
  await act(async () => { change?.('background'); jest.advanceTimersByTime(10000); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  await result.unmount();
  expect(remove).toHaveBeenCalled();
});

test('the greeting has its own readable pause before docking reveals chat', async () => {
  jest.useFakeTimers();
  const onReveal = jest.fn();
  await renderWithTheme(<EntranceAnimation mega={TEAL_INFO} geometry={geometry} onComplete={jest.fn()} onReveal={onReveal} />);
  await act(async () => { jest.advanceTimersByTime(CHAT_UX.entrance.walkMs + CHARACTER_EDITOR.introduction.waveFrameMs * CHAT_UX.entrance.waveFrames); });
  expect(screen.getByText('Hi, I’m Teal!')).toBeTruthy();
  expect(onReveal).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(CHAT_UX.entrance.greetingMs); });
  expect(onReveal).toHaveBeenCalledTimes(1);
});
