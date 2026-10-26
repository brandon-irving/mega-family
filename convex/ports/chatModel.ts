// The ChatModel port (CONTRACT §8; PLAN.md → "Our own thin loop instead of @convex-dev/agent"). Feature
// code (the agent loop, the memory writer, the judge) calls only this interface — never an SDK or `fetch`
// directly. `adapters/registry.ts` is the only file that picks which implementation answers it.
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  /** Always a string: structured results (tool output, recall hits) are JSON-stringified by the caller
   * before going in a message, so every adapter deals with one content shape. */
  content: string;
  /** Required on role 'tool': which call this is the result of (OpenAI-style `tool_call_id`). */
  toolCallId?: string;
  /** Required on role 'assistant' when it issued tool calls, so a later 'tool' message can be matched back
   * to one of them on the next turn. */
  toolCalls?: ToolCall[];
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments (OpenAI-style `function.parameters`). */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Arguments as the model returned them: a JSON string (PLAN.md → smoke test results — "arguments arrive
   * as a JSON string"). The caller parses and validates it against a `shared/domain` schema before using it. */
  arguments: string;
}

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface ChatModelRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** Structured output: the reply's `content` is JSON text matching this schema instead of free text. */
  schema?: JsonSchemaSpec;
  /** `"low"` for quick judge/writer calls (PLAN.md smoke test note); omit for the main chat reply. */
  effort?: 'low' | 'medium' | 'high';
  /** Always pass a generous value: Muse Spark's hidden reasoning counts against it (10 tokens → empty reply). */
  maxTokens: number;
}

export interface ChatModelUsage {
  tokensIn: number;
  tokensOut: number;
  /** Cached input tokens, if the provider reports them (billed at PRICING.chat.cachedInputCentsPerMTok). */
  cachedTokensIn?: number;
}

export interface ChatModelResult {
  /** The assistant's text, or `null` when the model only returned tool calls. */
  text: string | null;
  toolCalls: ToolCall[];
  usage: ChatModelUsage;
  finishReason: string;
}

export type ChatModelErrorCode = 'RATE_LIMITED' | 'SERVER_ERROR' | 'INVALID_REQUEST' | 'UNKNOWN';

export class ChatModelError extends Error {
  readonly code: ChatModelErrorCode;
  readonly status?: number;
  constructor(code: ChatModelErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'ChatModelError';
    this.code = code;
    this.status = status;
  }
}

export interface ChatModel {
  chat(req: ChatModelRequest): Promise<ChatModelResult>;
}
