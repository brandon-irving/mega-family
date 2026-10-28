// A scripted WebSearch for tests and the safe default outside `MEGA_MODEL_ADAPTER=real`: no network, records
// every request so a test can assert exactly what was searched (e.g. that a kid's query was rephrased first,
// or that no other member's private text reached the query).
import type { WebSearch, WebSearchRequest, WebSearchResult } from '../ports/webSearch';

export function makeFakeWebSearch(script?: (request: WebSearchRequest) => WebSearchResult): WebSearch & { requests: WebSearchRequest[] } {
  const requests: WebSearchRequest[] = [];
  return {
    requests,
    async search(request) {
      requests.push(request);
      if (script) return script(request);
      return {
        ok: true,
        answer: `Here's what I found about ${request.query}.`,
        sources: [{ title: 'National Geographic Kids', url: 'https://kids.nationalgeographic.com/' }],
        searched: true,
        usage: { tokensIn: 0, tokensOut: 0, cachedTokensIn: 0, searches: 1 },
      };
    },
  };
}

export const defaultFakeWebSearch: WebSearch = makeFakeWebSearch();
