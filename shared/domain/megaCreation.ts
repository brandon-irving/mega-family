import { v, type Infer } from 'convex/values';
import { relationship, personality } from './enums';
import { assistantBriefContent } from './assistantBrief';
import { literals } from './validators';
import { STICKERS } from '../config/ids';

export const megaDraftData = v.object({
  target: v.union(v.literal('self'), v.literal('new'), v.literal('existing')),
  memberId: v.optional(v.id('members')),
  name: v.optional(v.string()),
  role: v.optional(v.union(v.literal('adult'), v.literal('kid'))),
  ageGroup: v.optional(v.union(v.literal('child'), v.literal('teen'), v.literal('adult'))),
  accountConnections: v.optional(v.union(v.literal('allow'), v.literal('ask'))),
  relationship: v.optional(relationship),
  brief: v.optional(assistantBriefContent),
  megaName: v.string(), hex: v.string(), sticker: literals(STICKERS), personality,
});
export type MegaDraftData = Infer<typeof megaDraftData>;
