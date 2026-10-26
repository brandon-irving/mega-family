// When MEGA keeps something, at what scope, and how sure it must be (PLAN.md → Learnings).
// The memory writer proposes; applyLearningPolicy decides using this table.
import type { LearningTrigger, MemoryKind, Scope } from '../domain/enums';

export type LearningAction = 'saveConfirmed' | 'saveUnconfirmed' | 'queueForProfiler' | 'askBeforeSharing' | 'drop';

export const LEARNING_POLICY: {
  byTrigger: Record<LearningTrigger, LearningAction>;
  defaultScope: Record<MemoryKind, Scope>;
  pattern: { minSightings: number; windowDays: number };
  fade: { halfLifeDays: number; floor: number };
  confidence: { saveUnconfirmedMin: number };
  neverSave: readonly string[];
} = {
  byTrigger: {
    explicit: 'saveConfirmed',
    correction: 'saveConfirmed',
    stated: 'saveUnconfirmed',
    pattern: 'queueForProfiler',
    reaction: 'queueForProfiler',
  },
  defaultScope: {
    fact: 'family',
    preference: 'personal',
    routine: 'personal',
    plan: 'family',
    relationship: 'family',
    place: 'personal',
    note: 'personal',
    style: 'personal',
  },
  pattern: { minSightings: 3, windowDays: 21 },
  fade: { halfLifeDays: 30, floor: 0.2 },
  confidence: { saveUnconfirmedMin: 0.7 },
  neverSave: ['web results', "another member's private chat", 'guesses about health, feelings or school trouble', 'traits inferred about kids'],
};
