import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';
import { speaker } from './speaker';
jest.mock('expo-speech', () => ({ stop: jest.fn(async () => {}), speak: jest.fn() }));
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(async () => {}) }));
beforeEach(() => { jest.clearAllMocks(); });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
test('leaves recording mode and waits for playback callbacks', async () => {
  const onStart = jest.fn(), onDone = jest.fn();
  speaker.speak('Hello', { onStart, onDone }); await flush();
  expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false }));
  const options = (Speech.speak as jest.Mock).mock.calls[0][1];
  expect(onDone).not.toHaveBeenCalled();
  options.onStart(); expect(onStart).toHaveBeenCalledTimes(1);
  options.onDone(); expect(onDone).toHaveBeenCalledTimes(1);
});
test('interrupt cancels preparation and ignores old completion callbacks', async () => {
  const onDone = jest.fn();
  speaker.speak('First', { onDone }); await flush();
  const options = (Speech.speak as jest.Mock).mock.calls[0][1];
  speaker.stop(); options.onDone(); expect(onDone).not.toHaveBeenCalled();
  (Speech.speak as jest.Mock).mockClear();
  speaker.speak('Second'); speaker.stop(); await flush();
  expect(Speech.speak).not.toHaveBeenCalled();
});
test('audio setup failures reach the visible error callback', async () => {
  (setAudioModeAsync as jest.Mock).mockRejectedValueOnce(new Error('audio session'));
  const onError = jest.fn(); speaker.speak('Hello', { onError }); await flush();
  expect(onError).toHaveBeenCalled(); expect(Speech.speak).not.toHaveBeenCalled();
});
