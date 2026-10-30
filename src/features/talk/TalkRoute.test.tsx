import type { ReactNode } from 'react';
import { act, render } from '@testing-library/react-native';
import TalkRoute from '@/app/talk';
import { TalkContent, type TalkContentProps } from './TalkContent';
import { speaker } from '@/services/speaker';

const mockStop = jest.fn();
const mockUpload = jest.fn();
const mockSend = jest.fn();
let mockStream: { status: string; text: string } | null = null;
const mockVoice = { start: jest.fn(async () => {}), stop: mockStop, cancel: jest.fn(async () => {}) };
jest.mock('@/services/voice', () => ({ useVoiceService: () => mockVoice, VOICE_UNSUPPORTED_MESSAGE: 'Unsupported' }));
jest.mock('@/services/speaker', () => ({ speaker: { stop: jest.fn(), speak: jest.fn() } }));
jest.mock('@/services/talkIntroduction', () => ({ hasSeenTalkIntroduction: async () => true, rememberTalkIntroduction: jest.fn() }));
jest.mock('@/services/talkFeedback', () => ({ turnStart: jest.fn(), turnEnd: jest.fn() }));
jest.mock('@/data/useViewer', () => ({ useViewer: () => ({ mega: {} }) }));
jest.mock('@/data/useChat', () => ({
  useAnswerBlock: () => jest.fn(),
  useChatThread: () => ({ results: [] }),
  useSendMessage: () => mockSend,
  useStreamBody: () => mockStream,
}));
jest.mock('@/data/useTalk', () => ({ useUploadAndTranscribe: () => mockUpload }));
jest.mock('@/data/errorCopy', () => ({ errorCopyFor: () => 'Please try again.', streamStatusCopy: () => 'Reply failed.' }));
jest.mock('@/features/shell/megaInfo', () => ({ megaInfo: () => ({ name: 'Teal' }) }));
jest.mock('@/features/talk/TalkContent', () => ({ TalkContent: jest.fn(() => null) }));
jest.mock('@/ui/LoadingScreen', () => ({ LoadingScreen: () => null }));
jest.mock('@/ui/ModalSheet', () => ({ ModalSheet: () => null }));
jest.mock('@/ui/Screen', () => ({ Screen: ({ children }: { children: ReactNode }) => children }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true } }));
const props = () => (TalkContent as jest.Mock).mock.calls.at(-1)![0] as TalkContentProps;
beforeEach(() => {
  jest.clearAllMocks(); mockStream = null;
  mockStop.mockResolvedValue({ uri: 'file://voice.wav', mimeType: 'audio/wav' });
  mockUpload.mockResolvedValue({ text: 'What is next?', mentions: [] });
  mockSend.mockResolvedValue({ streamId: 'stream1' });
});
const hold = async () => { await act(async () => { props().onHoldStart(); }); };
const release = async () => { await act(async () => { props().onRelease(); }); };

test('opening does not start the microphone; hold and release transcribes and sends automatically', async () => {
  await render(<TalkRoute />);
  expect(mockVoice.start).not.toHaveBeenCalled();
  await hold(); await release();
  expect(mockSend).toHaveBeenCalledWith({ text: 'What is next?', mentions: [], via: 'voice' });
  expect(props().phase).toBe('speaking');
  expect(props().caption).toBe('What is next?');
});
test('a recording or decode failure offers another attempt', async () => {
  mockStop.mockRejectedValueOnce(new Error('Audio decoding failed'));
  await render(<TalkRoute />); await hold(); await release();
  expect(props().phase).toBe('idle');
  expect(props().error).toBe('Please try again.');
  expect(mockUpload).not.toHaveBeenCalled();
});
test('playback finishes through its callback and preserves both captions', async () => {
  const view = await render(<TalkRoute />); await hold(); await release();
  mockStream = { status: 'done', text: 'Your next event is lunch.' };
  await view.rerender(<TalkRoute />);
  expect(speaker.speak).toHaveBeenCalledTimes(1);
  expect(props().phase).toBe('speaking');
  const callbacks = (speaker.speak as jest.Mock).mock.calls[0][1];
  await act(async () => { callbacks.onStart(); });
  expect(props().playing).toBe(true);
  await act(async () => { callbacks.onDone(); });
  expect(props()).toMatchObject({ phase: 'idle', caption: 'What is next?', reply: 'Your next event is lunch.', playing: false });
});
test('closing during transcription does not send a late result', async () => {
  let resolve!: (value: unknown) => void;
  mockUpload.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await render(<TalkRoute />); await hold(); await release();
  await act(async () => { props().onClose(); resolve({ text: 'Late words', mentions: [] }); });
  expect(mockSend).not.toHaveBeenCalled();
  expect(mockVoice.cancel).toHaveBeenCalled();
});
test('duplicate release sends only one turn', async () => {
  await render(<TalkRoute />); await hold();
  await act(async () => { props().onRelease(); props().onRelease(); });
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(mockSend).toHaveBeenCalledTimes(1);
});
