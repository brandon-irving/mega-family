// Which adapter and model fills each port. Swapping a provider = new adapter + an edit here.
// Model ids confirmed from GET /v1/models on Oct 26.
export const MODELS = {
  meta: { baseUrl: 'https://api.meta.ai/v1' },
  chat: { adapter: 'metaModelApi', model: 'muse-spark-1.3' },
  judge: { adapter: 'metaModelApi', model: 'muse-spark-1.3' },
  image: { adapter: 'metaModelApi', model: 'muse-image-1.0', enabled: false }, // spend needs the owner's go-ahead
  transcribe: { adapter: 'metaModelApi', model: 'muse-voice-transcribe-1.0' },
  webSearch: { adapter: 'metaWebSearch', fallback: null as null | 'tavily' }, // all-Meta for now
  segment: { adapter: 'metaModelApi', model: 'sam-3.1' },
  memoryIndex: { adapter: 'convexSearch' },
} as const;
