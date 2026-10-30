import { Blob as NodeBlob } from 'node:buffer';
import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { decodeResampleAndEncodeWav, useVoiceService } from './voice';

const mockPermission = jest.fn();
const mockPrepare = jest.fn();
const mockRecord = jest.fn();
const mockStop = jest.fn();
const mockRecorder = { prepareToRecordAsync: mockPrepare, record: mockRecord, stop: mockStop, uri: null as string | null };
jest.mock('expo-audio', () => ({
  AudioModule: { getRecordingPermissionsAsync: () => mockPermission(), requestRecordingPermissionsAsync: () => mockPermission() },
  AudioQuality: { MAX: 127 },
  IOSOutputFormat: { LINEARPCM: 'lpcm' },
  RecordingPresets: { HIGH_QUALITY: {} },
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioRecorder: () => mockRecorder,
}));

const mockClose = jest.fn();
const mockDecode = jest.fn();
const mockRender = jest.fn();
const mockDisconnect = jest.fn();
const objectUrls = new Map<string, Blob>();
let nextUrl = 0;
const originalOS = Platform.OS;
const originals = { Blob: globalThis.Blob, fetch: globalThis.fetch, AudioContext: globalThis.AudioContext, OfflineAudioContext: globalThis.OfflineAudioContext, create: URL.createObjectURL, revoke: URL.revokeObjectURL };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'web';
  objectUrls.clear();
  nextUrl = 0;
  globalThis.Blob = NodeBlob as unknown as typeof Blob;
  URL.createObjectURL = jest.fn((blob: Blob) => {
    const uri = `blob:recording-${++nextUrl}`;
    objectUrls.set(uri, blob);
    return uri;
  });
  URL.revokeObjectURL = jest.fn((uri: string) => { objectUrls.delete(uri); });
  globalThis.fetch = jest.fn(async (uri: string) => ({ blob: async () => objectUrls.get(uri)! })) as unknown as typeof fetch;
  mockPermission.mockResolvedValue({ granted: true });
  mockPrepare.mockResolvedValue(undefined);
  mockStop.mockImplementation(async () => { mockRecorder.uri = URL.createObjectURL(new Blob([new Uint8Array(16000)])); });
  mockRecorder.uri = null;
  mockClose.mockResolvedValue(undefined);
  mockDecode.mockResolvedValue({ duration: 1 });
  mockRender.mockResolvedValue({ getChannelData: () => new Float32Array(16000) });
  globalThis.AudioContext = jest.fn(() => ({ decodeAudioData: mockDecode, close: mockClose })) as unknown as typeof AudioContext;
  globalThis.OfflineAudioContext = jest.fn(() => ({
    createBufferSource: () => ({ buffer: null, connect: jest.fn(), start: jest.fn(), disconnect: mockDisconnect }),
    destination: {},
    startRendering: mockRender,
  })) as unknown as typeof OfflineAudioContext;
});

afterEach(() => {
  Platform.OS = originalOS;
  globalThis.Blob = originals.Blob;
  globalThis.fetch = originals.fetch;
  globalThis.AudioContext = originals.AudioContext;
  globalThis.OfflineAudioContext = originals.OfflineAudioContext;
  URL.createObjectURL = originals.create;
  URL.revokeObjectURL = originals.revoke;
});

test('repeated recording retains only the current WAV and unmount releases it', async () => {
  const { result, unmount } = await renderHook(useVoiceService);
  for (let i = 0; i < 20; i++) {
    await act(async () => { await result.current.start(); });
    let uri: string | undefined;
    await act(async () => { uri = (await result.current.stop())?.uri; });
    expect(objectUrls.size).toBe(1);
    expect(objectUrls.get(uri!)?.size).toBe(32044);
  }
  await unmount();
  expect(objectUrls.size).toBe(0);
});

test('cancel discards the raw recording URL', async () => {
  const { result } = await renderHook(useVoiceService);
  await act(async () => { await result.current.start(); });
  await act(async () => { await result.current.cancel(); });
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(objectUrls.size).toBe(0);
});

test('decode failures close the audio context and release the raw recording', async () => {
  mockDecode.mockRejectedValueOnce(new Error('Bad recording'));
  const { result } = await renderHook(useVoiceService);
  await act(async () => { await result.current.start(); });
  await expect(result.current.stop()).rejects.toThrow('Bad recording');
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(objectUrls.size).toBe(0);
});

test('reading failures also close the audio context', async () => {
  await expect(decodeResampleAndEncodeWav({ arrayBuffer: async () => { throw new Error('Read failed'); } } as unknown as Blob)).rejects.toThrow('Read failed');
  expect(mockClose).toHaveBeenCalledTimes(1);
});

test('leaving while permission is pending never prepares or starts the microphone', async () => {
  const permission = deferred<{ granted: boolean }>();
  mockPermission.mockReturnValueOnce(permission.promise);
  const { result, unmount } = await renderHook(useVoiceService);
  const starting = result.current.start();
  await unmount();
  permission.resolve({ granted: true });
  await starting;
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(mockRecord).not.toHaveBeenCalled();
});

test('leaving during preparation stops and discards the late recorder', async () => {
  const prepared = deferred<void>();
  mockPrepare.mockReturnValueOnce(prepared.promise);
  const { result, unmount } = await renderHook(useVoiceService);
  const starting = result.current.start();
  await act(async () => {});
  expect(mockPrepare).toHaveBeenCalledTimes(1);
  await unmount();
  prepared.resolve();
  await starting;
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(objectUrls.size).toBe(0);
});

test('leaving during WAV conversion cannot publish an orphaned URL', async () => {
  const rendered = deferred<{ getChannelData: () => Float32Array }>();
  mockRender.mockReturnValueOnce(rendered.promise);
  const { result, unmount } = await renderHook(useVoiceService);
  await act(async () => { await result.current.start(); });
  const stopping = result.current.stop();
  await act(async () => {});
  await unmount();
  rendered.resolve({ getChannelData: () => new Float32Array(16000) });
  expect(await stopping).toBeNull();
  expect(objectUrls.size).toBe(0);
});

test('native recordings keep their file URI and never use browser blob cleanup', async () => {
  Platform.OS = 'ios';
  mockStop.mockImplementation(async () => { mockRecorder.uri = 'file:///cache/recording.wav'; });
  const { result, unmount } = await renderHook(useVoiceService);
  await act(async () => { await result.current.start(); });
  expect(await result.current.stop()).toEqual(expect.objectContaining({ uri: 'file:///cache/recording.wav', mimeType: 'audio/wav' }));
  await unmount();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  expect(mockDecode).not.toHaveBeenCalled();
});

test('overlapping start requests acquire only one microphone', async () => {
  const permission = deferred<{ granted: boolean }>();
  mockPermission.mockReturnValueOnce(permission.promise);
  const { result } = await renderHook(useVoiceService);
  const first = result.current.start();
  const second = result.current.start();
  permission.resolve({ granted: true });
  await Promise.all([first, second]);
  expect(mockPrepare).toHaveBeenCalledTimes(1);
  expect(mockRecord).toHaveBeenCalledTimes(1);
  await result.current.cancel();
});

test('a new start after cancelling a pending attempt waits for its cleanup and then records', async () => {
  const permission = deferred<{ granted: boolean }>();
  mockPermission.mockReturnValueOnce(permission.promise);
  const { result } = await renderHook(useVoiceService);
  const first = result.current.start();
  await result.current.cancel();
  const second = result.current.start();
  permission.resolve({ granted: true });
  await Promise.all([first, second]);
  expect(mockPrepare).toHaveBeenCalledTimes(1);
  expect(mockRecord).toHaveBeenCalledTimes(1);
  await result.current.cancel();
});
