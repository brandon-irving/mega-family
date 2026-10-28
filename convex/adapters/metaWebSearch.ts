// The real WebSearch adapter: Meta search grounding — the `web_search` tool on the Responses API
// (`POST /v1/responses`, ai.developer.meta.com/docs/search-grounding, read Oct 28). The only file that knows
// that shape. Sources come from `url_citation` annotations (what the answer actually cites, in order) and then
// `include: ["web_search_call.results"]` (everything the search retrieved). Interim `phase: "commentary"`
// messages are dropped (STATUS.md lessons). There's no safe-search or domain filter on this API, so the kid
// filter runs around this port (convex/model/kidSearch.ts), never inside it.
import { MODELS } from '../../shared/config/models';
import { WEB_SEARCH } from '../../shared/config/integrations';
import type { WebSearch, WebSearchRequest, WebSearchResult, WebSearchSource } from '../ports/webSearch';
import { fetchJson } from './httpFetch';

type OutputItem = {
  type?: string;
  phase?: string;
  results?: { type?: string; title?: string; url?: string }[];
  content?: { type?: string; text?: string; annotations?: { type?: string; url?: string; title?: string }[] }[];
};

export function buildWebSearchBody(request: WebSearchRequest): Record<string, unknown> {
  const tool: Record<string, unknown> = { type: 'web_search', search_context_size: request.contextSize };
  if (request.approximateLocation) tool.user_location = { type: 'approximate', ...request.approximateLocation };
  return {
    model: MODELS.webSearch.model,
    input: request.query,
    ...(request.instructions ? { instructions: request.instructions } : {}),
    tools: [tool],
    include: ['web_search_call.results'],
  };
}

function isHttpUrl(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

/** Parses a Responses API body into the port's result. Exported for the adapter's fixture tests. */
export function parseWebSearchResponse(json: unknown): WebSearchResult {
  const output = ((json as { output?: OutputItem[] })?.output ?? []) as OutputItem[];
  const cited: WebSearchSource[] = [];
  const retrieved: WebSearchSource[] = [];
  const texts: string[] = [];
  let searches = 0;
  for (const item of output) {
    if (item.type === 'web_search_call') {
      searches++;
      for (const r of item.results ?? []) if (isHttpUrl(r.url)) retrieved.push({ title: r.title?.trim() || r.url, url: r.url });
    } else if (item.type === 'message' && item.phase !== 'commentary') {
      for (const block of item.content ?? []) {
        if (block.type !== 'output_text' || !block.text) continue;
        texts.push(block.text);
        for (const a of block.annotations ?? []) if (a.type === 'url_citation' && isHttpUrl(a.url)) cited.push({ title: a.title?.trim() || a.url, url: a.url });
      }
    }
  }
  const seen = new Set<string>();
  const sources = [...cited, ...retrieved].filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
  const answer = texts.join('\n\n').trim();
  if (!answer) return { ok: false, failure: 'no_result', detail: 'empty answer' };
  const u = (json as { usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } })?.usage ?? {};
  return {
    ok: true,
    answer,
    sources,
    searched: searches > 0,
    usage: { tokensIn: Number(u.input_tokens ?? 0), tokensOut: Number(u.output_tokens ?? 0), cachedTokensIn: Number(u.input_tokens_details?.cached_tokens ?? 0), searches },
  };
}

export const metaWebSearch: WebSearch = {
  async search(request) {
    const key = process.env.META_API_KEY;
    if (!key) return { ok: false, failure: 'not_configured', detail: 'META_API_KEY is not set' };
    const res = await fetchJson(
      `${MODELS.meta.baseUrl}/responses`,
      { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(buildWebSearchBody(request)) },
      WEB_SEARCH.timeoutMs,
    );
    if (!res.ok) return { ok: false, failure: res.failure, detail: res.detail };
    return parseWebSearchResponse(res.json);
  },
};
