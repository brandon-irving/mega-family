// Pure unit tests for `decideLearning` (PLAN.md → Learnings: "the policy is the single place that
// decides"). No convex-test needed — this module takes no `ctx`.
import { describe, expect, test } from 'vitest';
import { LEARNING_POLICY } from '../../shared/config/learning';
import { LEARNING_TRIGGERS, MEMORY_KINDS } from '../../shared/domain/enums';
import type { Id } from '../_generated/dataModel';
import { clampScopeForRole, decideLearning, type LearningOp } from './learningPolicy';

const SELF = 'member:self' as Id<'members'>;
const OTHER = 'member:other' as Id<'members'>;
const COPARENT = 'member:coparent' as Id<'members'>;

function op(overrides: Partial<LearningOp> = {}): LearningOp {
  return {
    trigger: 'stated',
    kind: 'fact',
    text: 'something',
    suggestedScope: 'family',
    confidence: 0.9,
    sensitive: false,
    about: [SELF],
    ...overrides,
  };
}

describe('decideLearning: the trigger × kind policy table', () => {
  // byTrigger per shared/config/learning.ts: explicit/correction -> saveConfirmed; stated -> saveUnconfirmed;
  // pattern/reaction -> queueForProfiler. Every kind behaves the same way for a given trigger (kind only
  // changes the *default scope*, not the action), so this exercises the full cross product.
  for (const trigger of LEARNING_TRIGGERS) {
    for (const kind of MEMORY_KINDS) {
      test(`${trigger} × ${kind}`, () => {
        const decision = decideLearning(op({ trigger, kind, suggestedScope: LEARNING_POLICY.defaultScope[kind], confidence: 0.95 }), SELF);
        switch (trigger) {
          case 'explicit':
          case 'correction':
            expect(decision.action).toBe('saveConfirmed');
            break;
          case 'stated':
            expect(decision.action).toBe('saveUnconfirmed');
            break;
          case 'pattern':
          case 'reaction':
            expect(decision.action).toBe('queueForProfiler');
            break;
        }
      });
    }
  }
});

describe('never-save rules (enforced in code, not config)', () => {
  test('web-search-derived content is always dropped, even if explicit', () => {
    const decision = decideLearning(op({ trigger: 'explicit', derivedFromWebSearch: true }), SELF);
    expect(decision.action).toBe('drop');
  });

  test('a guess about health/feelings/school trouble is dropped when not self-reported', () => {
    for (const trigger of LEARNING_TRIGGERS) {
      if (trigger === 'explicit') continue;
      const decision = decideLearning(op({ trigger, concernCategory: 'health', about: [OTHER] }), SELF);
      expect(decision.action, `trigger=${trigger}`).toBe('drop');
    }
  });

  test('an inferred kid trait is dropped even when "about" is the self member, unless trigger is explicit', () => {
    const decision = decideLearning(op({ trigger: 'stated', concernCategory: 'kidTrait', about: [SELF] }), SELF);
    expect(decision.action).toBe('drop');
  });

  test('a health/feelings concern IS allowed through when the member explicitly says it about themselves', () => {
    const decision = decideLearning(op({ trigger: 'explicit', concernCategory: 'feelings', about: [SELF] }), SELF);
    expect(decision.action).toBe('saveConfirmed');
  });

  test('a concern about someone else is still dropped even if "explicit" (not self-reported)', () => {
    const decision = decideLearning(op({ trigger: 'explicit', concernCategory: 'schoolTrouble', about: [OTHER] }), SELF);
    expect(decision.action).toBe('drop');
  });

  test('a sensitive guess (not explicitly stated) is dropped', () => {
    const decision = decideLearning(op({ trigger: 'stated', sensitive: true }), SELF);
    expect(decision.action).toBe('drop');
  });

  test('a sensitive fact IS saved, forced to personal scope, when explicitly stated', () => {
    const decision = decideLearning(op({ trigger: 'explicit', sensitive: true, suggestedScope: 'family' }), SELF);
    expect(decision).toMatchObject({ action: 'saveConfirmed', scope: 'personal' });
  });

  test('a sensitive correction is also allowed (the member is confirming/correcting it themselves)', () => {
    const decision = decideLearning(op({ trigger: 'correction', sensitive: true }), SELF);
    expect(decision).toMatchObject({ action: 'saveConfirmed', scope: 'personal' });
  });
});

describe('ask-before-sharing', () => {
  test('a passing ("stated") mention that would share personal info produces askBeforeSharing, not an immediate save', () => {
    const decision = decideLearning(op({ trigger: 'stated', suggestedScope: 'shared', shareWithMemberIds: [COPARENT], confidence: 0.95 }), SELF);
    expect(decision).toMatchObject({ action: 'askBeforeSharing', scope: 'shared', shareWithMemberIds: [COPARENT] });
  });

  test('an explicit ask to share ("tell Coral...") shares immediately, no asking', () => {
    const decision = decideLearning(op({ trigger: 'explicit', suggestedScope: 'shared', shareWithMemberIds: [COPARENT] }), SELF);
    expect(decision).toMatchObject({ action: 'saveConfirmed', scope: 'shared', shareWithMemberIds: [COPARENT] });
  });

  test('a low-confidence "stated" fact is queued for the profiler rather than saved unconfirmed outright', () => {
    const decision = decideLearning(op({ trigger: 'stated', confidence: 0.1, suggestedScope: 'personal' }), SELF);
    expect(decision.action).toBe('queueForProfiler');
  });
});

describe('supersede on correction', () => {
  test('a correction is saveConfirmed (convex/model/applyLearning.ts patches the prior memory\'s validUntil)', () => {
    const decision = decideLearning(op({ trigger: 'correction', suggestedScope: 'family' }), SELF);
    expect(decision).toMatchObject({ action: 'saveConfirmed', scope: 'family' });
  });
});

describe('clampScopeForRole: kids never get an out-of-bounds scope from this policy', () => {
  test.each([
    ['adults', 'personal'],
    ['shared', 'personal'],
    ['family', 'family'],
    ['personal', 'personal'],
  ] as const)('kid: %s -> %s', (input, expected) => {
    expect(clampScopeForRole(input, 'kid')).toBe(expected);
  });

  test.each(['family', 'adults', 'personal', 'shared'] as const)('adult: %s is unchanged', (scope) => {
    expect(clampScopeForRole(scope, 'adult')).toBe(scope);
  });
});
