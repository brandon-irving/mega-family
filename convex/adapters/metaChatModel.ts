// The real ChatModel adapter: Meta Model API's OpenAI-compatible `/v1/chat/completions` (PLAN.md → Backend
// "Meta Model API", smoke test results). This is the only file that knows that shape; everything else goes
// through `ports/chatModel.ts`. Convex's default (non-"use node") runtime has global `fetch`, so this needs
// no Node builtins and no `"use node"` directive.
import { MODELS } from '../../shared/config/models';
import type { ChatMessage, ChatModel, ChatModelRequest, ChatModelResult, ChatModelUsage, ModelRole, ToolCall } from '../ports/chatModel';
import { ChatModelError } from '../ports/chatModel';

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 300;

function toOpenAiMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } })),
    };
  }
  if (m.images?.length) {
    // Meta image-understanding guide (Oct 28), Chat Completions shape: images only in 'user' messages, as
    // `image_url` parts whose `image_url` is an object with a `url` (https or a base64 data URL).
    if (m.role !== 'user') throw new ChatModelError('INVALID_REQUEST', 'images are only allowed on user messages');
    return {
      role: 'user',
      content: [{ type: 'text', text: m.content }, ...m.images.map((url) => ({ type: 'image_url', image_url: { url } }))],
    };
  }
  return { role: m.role, content: m.content };
}

/** The model id for a role (shared/config/models.ts). The one place a role becomes a vendor model id. */
function modelIdFor(role: ModelRole | undefined): string {
  return MODELS[role ?? 'chat'].model;
}

function usageFrom(json: unknown): ChatModelUsage {
  const u = (json as { usage?: Record<string, unknown> })?.usage ?? {};
  const cached = (u as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details?.cached_tokens;
  return {
    tokensIn: Number(u.prompt_tokens ?? 0),
    tokensOut: Number(u.completion_tokens ?? 0),
    cachedTokensIn: typeof cached === 'number' ? cached : undefined,
  };
}

function toolCallsFrom(json: unknown): ToolCall[] {
  const calls = (json as { choices?: { message?: { tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] })?.choices?.[0]?.message
    ?.tool_calls;
  if (!calls) return [];
  return calls.map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments }));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function requireApiKey(): string {
  const key = process.env.META_API_KEY;
  if (!key) throw new ChatModelError('INVALID_REQUEST', 'META_API_KEY is not set');
  return key;
}

export const metaChatModel: ChatModel = {
  async chat(req: ChatModelRequest): Promise<ChatModelResult> {
    const key = requireApiKey();
    const body: Record<string, unknown> = {
      model: modelIdFor(req.model),
      messages: req.messages.map(toOpenAiMessage),
      max_tokens: req.maxTokens,
    };
    if (req.effort) body.reasoning_effort = req.effort;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
      body.tool_choice = 'auto';
    }
    if (req.schema) body.response_format = { type: 'json_schema', json_schema: { name: req.schema.name, schema: req.schema.schema, strict: req.schema.strict ?? true } };

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${MODELS.meta.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (e) {
        lastError = e;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }
        throw new ChatModelError('UNKNOWN', `network error calling Meta Model API: ${String(e)}`);
      }

      if (res.ok) {
        const json = await res.json();
        const choice = (json as { choices?: { message?: { content?: string | null }; finish_reason?: string }[] }).choices?.[0];
        return { text: choice?.message?.content ?? null, toolCalls: toolCallsFrom(json), usage: usageFrom(json), finishReason: choice?.finish_reason ?? 'stop' };
      }

      if (RETRY_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
        lastError = new ChatModelError(res.status === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR', `Meta Model API ${res.status}`, res.status);
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }

      const text = await res.text().catch(() => '');
      const code = res.status === 429 ? 'RATE_LIMITED' : res.status >= 500 ? 'SERVER_ERROR' : 'INVALID_REQUEST';
      throw new ChatModelError(code, `Meta Model API ${res.status}: ${text.slice(0, 500)}`, res.status);
    }
    throw lastError instanceof ChatModelError ? lastError : new ChatModelError('UNKNOWN', String(lastError));
  },
};
