// A scripted ChatModel for tests (and the safe default outside an explicit `MEGA_MODEL_ADAPTER=real`): no
// network, deterministic. Tests build one with `makeFakeChatModel(script)` and install it via
// `adapters/registry.ts`'s `__setChatModelForTests`.
import type { ChatModel, ChatModelRequest, ChatModelResult } from '../ports/chatModel';

export type ChatScript = (req: ChatModelRequest, callIndex: number) => ChatModelResult | Promise<ChatModelResult>;

export function makeFakeChatModel(script: ChatScript): ChatModel {
  let callIndex = 0;
  return {
    async chat(req: ChatModelRequest): Promise<ChatModelResult> {
      const result = await script(req, callIndex);
      callIndex += 1;
      return result;
    },
  };
}

/** A plain text reply, no tool calls — the common case for a scripted conversational turn. */
export function textReply(text: string): ChatModelResult {
  return { text, toolCalls: [], usage: { tokensIn: 10, tokensOut: 10 }, finishReason: 'stop' };
}

/** One or more tool calls, no text yet — the model asking the loop to run tools before it answers. */
export function toolCallReply(calls: { id: string; name: string; arguments: unknown }[]): ChatModelResult {
  return {
    text: null,
    toolCalls: calls.map((c) => ({ id: c.id, name: c.name, arguments: JSON.stringify(c.arguments) })),
    usage: { tokensIn: 10, tokensOut: 10 },
    finishReason: 'tool_calls',
  };
}

/** Structured (`schema`) output: `content` is the JSON-stringified value. */
export function jsonReply(value: unknown): ChatModelResult {
  return { text: JSON.stringify(value), toolCalls: [], usage: { tokensIn: 10, tokensOut: 10 }, finishReason: 'stop' };
}

/** The registry's fallback when nothing overrides it and `MEGA_MODEL_ADAPTER` isn't "real": a harmless,
 * generic reply so code paths that exercise the agent loop incidentally (not the point of the test) still
 * get a plausible, non-empty response instead of silently depending on the network. */
export const defaultFakeChatModel: ChatModel = makeFakeChatModel((req) => {
  if (req.schema) return jsonReply(defaultForSchema(req.schema.schema));
  return textReply("Got it — I'm not sure how to help with that yet, but I've made a note of it.");
});

/** A conservative "empty-ish" default for a JSON-schema call whose test didn't bother scripting one —
 * good enough so, e.g., an un-scripted memory-writer pass proposes no operations rather than crashing. */
function defaultForSchema(schema: Record<string, unknown>): unknown {
  const props = schema.properties as Record<string, { type?: string }> | undefined;
  if (!props) return {};
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(props)) {
    switch (def.type) {
      case 'array':
        out[key] = [];
        break;
      case 'number':
        out[key] = 0;
        break;
      case 'boolean':
        out[key] = false;
        break;
      case 'string':
        out[key] = '';
        break;
      default:
        out[key] = null;
    }
  }
  return out;
}
