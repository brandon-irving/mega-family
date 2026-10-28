// G4 (CONTRACT v0.15) document and view types for the Screen 14 views, inferred from the contract (single
// source of truth: shared/domain/api.ts).
import type { Infer } from 'convex/values';
import type { placeDoc, searchLogDoc } from '@shared/domain/api';

export type PlaceDoc = Infer<typeof placeDoc>;
export type SearchLogRow = Infer<typeof searchLogDoc>;
