// The one file that picks which adapter fills each port (convex/adapters/registry.ts). Tests never hit the
// network by default; `MEGA_MODEL_ADAPTER=real` must be set explicitly to opt into the live adapters.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { makeFakeChatModel, textReply } from './fakeChatModel';
import { makeFakeTranscriber } from './fakeTranscriber';
import { metaChatModel } from './metaChatModel';
import { metaTranscriber } from './metaTranscriber';
import { mapboxDirections, mapboxGeocoder } from './mapbox';
import { metaWebSearch } from './metaWebSearch';
import { openMeteoNwsWeather } from './openMeteoNwsWeather';
import { __setChatModelForTests, __setTranscriberForTests, getChatModel, getDirections, getGeocoder, getTranscriber, getWeather, getWebSearch } from './registry';

describe('adapters/registry', () => {
  afterEach(() => {
    __setChatModelForTests(null);
    __setTranscriberForTests(null);
    vi.unstubAllEnvs();
  });

  test('defaults to a Fake ChatModel/Transcriber (never the network) when nothing overrides it', () => {
    expect(getChatModel()).not.toBe(metaChatModel);
    expect(getTranscriber()).not.toBe(metaTranscriber);
  });

  test('MEGA_MODEL_ADAPTER=real selects the live adapters', () => {
    vi.stubEnv('MEGA_MODEL_ADAPTER', 'real');
    expect(getChatModel()).toBe(metaChatModel);
    expect(getTranscriber()).toBe(metaTranscriber);
  });

  test('G4: real mode uses the real integration adapters (they fail closed by themselves), else fakes', () => {
    expect(getWebSearch()).not.toBe(metaWebSearch);
    expect(getDirections()).not.toBe(mapboxDirections);
    vi.stubEnv('MEGA_MODEL_ADAPTER', 'real');
    expect(getWebSearch()).toBe(metaWebSearch);
    expect(getWeather()).toBe(openMeteoNwsWeather);
    expect(getDirections()).toBe(mapboxDirections);
    expect(getGeocoder()).toBe(mapboxGeocoder);
  });

  test('a test override always wins, even with MEGA_MODEL_ADAPTER=real set', async () => {
    vi.stubEnv('MEGA_MODEL_ADAPTER', 'real');
    const scripted = makeFakeChatModel(() => textReply('scripted'));
    __setChatModelForTests(scripted);
    expect(getChatModel()).toBe(scripted);
    expect((await getChatModel().chat({ messages: [], maxTokens: 10 })).text).toBe('scripted');

    const scriptedTranscriber = makeFakeTranscriber(() => ({ text: 'scripted transcript', audioDurationMs: 1, turns: [] }));
    __setTranscriberForTests(scriptedTranscriber);
    expect(getTranscriber()).toBe(scriptedTranscriber);
  });
});
