// The real ChatModel adapter's request shape and retry/error behavior, against a fake `fetch` — never the
// network (task brief: "A Fake adapter for every port... selectable via config/env so tests never hit the
// network" — this test fakes fetch itself specifically to verify what the REAL adapter sends).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ChatModelError } from '../ports/chatModel';
import { metaChatModel } from './metaChatModel';

const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('metaChatModel', () => {
  beforeEach(() => {
    vi.stubEnv('META_API_KEY', 'test-key');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('sends OpenAI-shaped chat/completions request with tools and reasoning_effort', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await metaChatModel.chat({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 'lists_add', description: 'add', parameters: { type: 'object', properties: {} } }],
      effort: 'low',
      maxTokens: 500,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(body.max_tokens).toBe(500);
    expect(body.reasoning_effort).toBe('low');
    expect(body.tools[0]).toMatchObject({ type: 'function', function: { name: 'lists_add' } });
    expect(body.tool_choice).toBe('auto');

    expect(result).toMatchObject({ text: 'hi', toolCalls: [], usage: { tokensIn: 5, tokensOut: 2 }, finishReason: 'stop' });
  });

  test('parses tool_calls with JSON-string arguments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse({
          choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', function: { name: 'lists_add', arguments: '{"listName":"Groceries","text":"milk"}' } }] }, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 20, completion_tokens: 8 },
        }),
      ),
    );
    const result = await metaChatModel.chat({ messages: [{ role: 'user', content: 'add milk' }], maxTokens: 500 });
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'lists_add', arguments: '{"listName":"Groceries","text":"milk"}' }]);
  });

  test('retries on 429 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(okResponse({ choices: [{ message: { content: 'ok now' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await metaChatModel.chat({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('ok now');
  });

  test('a non-retryable 400 throws ChatModelError without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(metaChatModel.chat({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 })).rejects.toThrow(ChatModelError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('throws INVALID_REQUEST when META_API_KEY is unset', async () => {
    vi.stubEnv('META_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn());
    const err = await metaChatModel.chat({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 }).catch((e) => e);
    expect(err).toBeInstanceOf(ChatModelError);
    expect((err as ChatModelError).code).toBe('INVALID_REQUEST');
  });

  // GD: homework photos (Meta image-understanding guide, Chat Completions shape) and per-role model ids.
  test('sends images as image_url content parts on the user message, with the vision model id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1500, completion_tokens: 20 } }));
    vi.stubGlobal('fetch', fetchMock);

    await metaChatModel.chat({ messages: [{ role: 'user', content: 'Read this worksheet', images: ['data:image/png;base64,AAAA'] }], maxTokens: 800, model: 'vision' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('muse-spark-1.3');
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Read this worksheet' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      ],
    });
  });

  test("uses Muse Wonder for model: 'wording' and Muse Spark by default", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => okResponse({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }], usage: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await metaChatModel.chat({ messages: [{ role: 'user', content: 'word it' }], maxTokens: 300, model: 'wording' });
    await metaChatModel.chat({ messages: [{ role: 'user', content: 'plain' }], maxTokens: 300 });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe('muse-wonder-1.0');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).model).toBe('muse-spark-1.3');
  });

  test('refuses images on a non-user message', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const err = await metaChatModel.chat({ messages: [{ role: 'system', content: 's', images: ['data:image/png;base64,AA'] }], maxTokens: 10 }).catch((e) => e);
    expect((err as ChatModelError).code).toBe('INVALID_REQUEST');
  });
});
