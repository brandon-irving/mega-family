// Which adapter and model fills each port. Swapping a provider = new adapter + an edit here.
// Model ids confirmed from GET /v1/models on Oct 26.
export const MODELS = {
  meta: { baseUrl: 'https://api.meta.ai/v1' },
  chat: { adapter: 'metaModelApi', model: 'muse-spark-1.3' },
  judge: { adapter: 'metaModelApi', model: 'muse-spark-1.3' },
  // GD (CONTRACT v0.13): homework photos go to Muse Spark as image input (Meta docs, Oct 27: Muse Spark takes
  // text, image, video, audio and PDF). Verify the request shape against ai.developer.meta.com/docs before coding.
  vision: { adapter: 'metaModelApi', model: 'muse-spark-1.3' },
  // GD: Muse Wonder words the one clash fix and nothing else (brief: "wording: Muse Wonder; everything else: Muse Spark").
  wording: { adapter: 'metaModelApi', model: 'muse-wonder-1.0' },
  image: { adapter: 'metaModelApi', model: 'muse-image-1.0', enabled: false }, // spend needs the owner's go-ahead
  transcribe: { adapter: 'metaModelApi', model: 'muse-voice-transcribe-1.0' },
  // G4: Meta's `web_search` tool runs only on the Responses API (`/v1/responses`, not Chat Completions), so it has
  // its own adapter (convex/adapters/metaWebSearch.ts). Sources: `include: ['web_search_call.results']`.
  webSearch: { adapter: 'metaWebSearch', model: 'muse-spark-1.3', api: 'responses' as const, fallback: null as null | 'tavily' }, // all-Meta for now
  segment: { adapter: 'metaModelApi', model: 'sam-3.1' },
  memoryIndex: { adapter: 'convexSearch' },
} as const;
