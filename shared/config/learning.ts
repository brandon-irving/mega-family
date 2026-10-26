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

/** Categories the server-side concern classifier (convex/agent/concernClassifier.ts) can assign to a
 * single proposed memory fact, independent of whatever the conversation model itself claims about it (G2
 * security review BLOCKER: a hijacked or simply mistaken conversation model can't be trusted to self-report
 * "this is just logistics" for its own `remember` tool calls or the memory writer's proposals — a never-
 * save rule that only checks the model's own label isn't a gate at all). `'ok'` is ordinary household
 * logistics/preferences/facts; everything else is gated by `convex/model/concernGate.ts`. */
export const CONCERN_CATEGORIES = ['ok', 'health', 'feelings', 'school_trouble', 'kid_trait', 'web_content'] as const;
export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];

/** A keyword backstop: if the memory text itself names one of these, the classifier's "ok" is overridden
 * to the matching category regardless of what the (possibly hijacked) classifier model said — belt and
 * suspenders against a classifier call that also gets it wrong. Matched case-insensitively as a plain
 * substring, deliberately over-inclusive (a false positive here just means an ordinary fact gets asked
 * about or queued instead of saved immediately; a false negative is the thing this backstop exists for). */
export const CONCERN_KEYWORD_BACKSTOP: Record<'health' | 'school_trouble', readonly string[]> = {
  health: [
    'bullied', 'bully', 'bullying', 'panic attack', 'panic attacks', 'self-harm', 'self harm', 'suicide', 'suicidal',
    'diagnosis', 'diagnosed', 'medication', 'therapy', 'therapist', 'depressed', 'depression', 'anxiety',
  ],
  school_trouble: ['failing', 'suspended', 'expelled', 'detention'],
};
