import type { IdeaSort } from '../domain/ideas';

/** Shared query/UI policy: initial fetch, subsequent pages and server bounds stay in step. */
export const IDEAS = {
  pageSize: 20,
  maxPageSize: 40,
  maximumRowsRead: 160,
  searchMaxLength: 120,
  searchDebounceMs: 250,
  defaultSort: 'newest' satisfies IdeaSort,
} as const;
