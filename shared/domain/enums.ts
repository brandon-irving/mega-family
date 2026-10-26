// CONTRACT §1. Fixed value lists. Each list is defined once; the validator and the type derive from it.
import type { Infer } from 'convex/values';
import { literals } from './validators';

export const ROLES = ['admin', 'adult', 'kid'] as const;
export const role = literals(ROLES);
export type Role = Infer<typeof role>;

export const RELATIONSHIPS = ['partner', 'daughter', 'son', 'child', 'parent', 'sibling', 'grandparent', 'other'] as const;
export const relationship = literals(RELATIONSHIPS);
export type Relationship = Infer<typeof relationship>;

export const MEGA_KINDS = ['family', 'member', 'care'] as const;
export const megaKind = literals(MEGA_KINDS);
export type MegaKind = Infer<typeof megaKind>;

export const PERSONALITIES = ['calm', 'cheerful', 'funny', 'brief'] as const;
export const personality = literals(PERSONALITIES);
export type Personality = Infer<typeof personality>;

export const SCOPES = ['family', 'adults', 'personal', 'shared'] as const;
export const scope = literals(SCOPES);
export type Scope = Infer<typeof scope>;

export const MEMORY_KINDS = ['fact', 'preference', 'routine', 'plan', 'relationship', 'place', 'note', 'style'] as const;
export const memoryKind = literals(MEMORY_KINDS);
export type MemoryKind = Infer<typeof memoryKind>;

export const LEARNING_TRIGGERS = ['explicit', 'correction', 'stated', 'pattern', 'reaction'] as const;
export const learningTrigger = literals(LEARNING_TRIGGERS);
export type LearningTrigger = Infer<typeof learningTrigger>;

export const NOTIFICATION_KINDS = ['reminder', 'request', 'tip', 'update'] as const;
export const notificationKind = literals(NOTIFICATION_KINDS);
export type NotificationKind = Infer<typeof notificationKind>;

export const DELIVERIES = ['push', 'statement', 'drop'] as const;
export const delivery = literals(DELIVERIES);
export type Delivery = Infer<typeof delivery>;

export const LOUDNESS = ['timeSensitive', 'active', 'passive'] as const;
export const loudness = literals(LOUDNESS);
export type Loudness = Infer<typeof loudness>;

export const THEME_NAMES = ['midnight', 'light'] as const;
export const themeName = literals(THEME_NAMES);
export type ThemeName = Infer<typeof themeName>;

export const STATIONS = ['desk', 'calendar', 'fridge', 'mailbox', 'bookshelf', 'rug', 'charger', 'door'] as const;
export const station = literals(STATIONS);
export type Station = Infer<typeof station>;

export const VIAS = ['text', 'voice', 'block', 'push', 'widget'] as const;
export const via = literals(VIAS);
export type Via = Infer<typeof via>;

export const PLATFORMS = ['ios', 'android', 'web'] as const;
export const platform = literals(PLATFORMS);
export type Platform = Infer<typeof platform>;

export const REACTIONS = ['up', 'down'] as const;
export const reaction = literals(REACTIONS);
export type Reaction = Infer<typeof reaction>;

/** Who can see a sharing-controlled thing (MEGA profile → What it shares). */
export const SHARE_LEVELS = ['me', 'partner', 'family'] as const;
export const shareLevel = literals(SHARE_LEVELS);
export type ShareLevel = Infer<typeof shareLevel>;

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'NOT_A_MEMBER',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_INVITE',
  'WRONG_PARENT_CODE',
  'RATE_LIMITED',
  'BUDGET_EXCEEDED',
  'KID_BLOCKED',
  'VALIDATION',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
