import { type Infer, v } from 'convex/values';
import { literals } from './validators';

export const IDEA_SORTS = ['newest', 'oldest'] as const;
export const ideaSort = literals(IDEA_SORTS);
export type IdeaSort = Infer<typeof ideaSort>;

export const IDEA_CATEGORIES = ['activities', 'meals', 'gifts', 'other'] as const;
export const ideaCategory = literals(IDEA_CATEGORIES);
export type IdeaCategory = Infer<typeof ideaCategory>;
export const IDEA_CATEGORY_LABELS: Record<IdeaCategory, string> = { activities: 'Activities', meals: 'Meals', gifts: 'Gifts', other: 'Other' };
export const ideaSource = v.union(
  v.object({ kind: v.literal('message'), messageId: v.id('messages') }),
  v.object({ kind: v.literal('suggestion'), messageId: v.optional(v.id('messages')) }),
  v.object({ kind: v.literal('gift'), giftIdeasId: v.id('giftIdeas'), index: v.number() }),
);
