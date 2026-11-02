import { type Infer, v } from 'convex/values';
import { literals } from './validators';

export const BRIEF_FIELDS = ['context', 'goal', 'firstTask', 'proactive'] as const;
export const BRIEF_STATUSES = ['pending', 'accepted', 'declined'] as const;
export const BRIEF_STEPS = ['review', 'edit', 'fresh', 'ready', 'done'] as const;
export const assistantBriefContent = v.object({ context: v.string(), goal: v.string(), firstTask: v.string(), proactive: v.string() });
export const assistantBriefStatus = literals(BRIEF_STATUSES);
export const assistantBriefStep = literals(BRIEF_STEPS);
export type AssistantBriefContent = Infer<typeof assistantBriefContent>;
export const emptyAssistantBrief = (): AssistantBriefContent => ({ context: '', goal: '', firstTask: '', proactive: '' });
