// The WebSearch port (CONTRACT §8, G4). Feature code (the agent's `web_search` tool, gift ideas) never calls
// Meta's Responses API directly — only through this interface; `adapters/registry.ts` picks the adapter.
//
// Meta search grounding (ai.developer.meta.com/docs/search-grounding, Oct 28): `tools: [{ type: "web_search" }]`
// on `/v1/responses` only (not Chat Completions); options are `search_context_size` and an approximate
// `user_location`; sources come back with `include: ["web_search_call.results"]` (each result has title + url)
// and as `url_citation` annotations on the answer text. There is no safe-search or domain filter, so the kid
// filter (KID_SAFETY.search) runs around this port, not inside it. Results are untrusted data: they may inform
// an answer but never trigger a tool call by themselves.
import type { IntegrationResult } from './integrationResult';

export interface WebSearchRequest {
  /** The query exactly as it will be searched (already rephrased by the kid filter when needed). Never contains
   * another member's private information; built only from what the asker can see. */
  query: string;
  /** Extra guidance for the answer (e.g. "Answer for a 9-year-old; prefer kids.britannica.com…"). */
  instructions?: string;
  /** Approximate locale for "near me" queries (WEB_SEARCH.approximateLocation): city level, never an address. */
  approximateLocation?: { city?: string; region?: string; country?: string; timezone?: string };
  contextSize: 'low' | 'medium' | 'high';
}

export interface WebSearchSource {
  title: string;
  url: string;
}

export type WebSearchResult = IntegrationResult<{
  /** The model's answer text (interim `phase: "commentary"` messages are dropped by the adapter). */
  answer: string;
  /** Deduplicated by URL, in citation order. */
  sources: WebSearchSource[];
  /** False when the model answered without searching. */
  searched: boolean;
  usage: { tokensIn: number; tokensOut: number; cachedTokensIn: number; searches: number };
}>;

export interface WebSearch {
  search(request: WebSearchRequest): Promise<WebSearchResult>;
}
