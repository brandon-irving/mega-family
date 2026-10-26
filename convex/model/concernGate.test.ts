// Pure unit tests for the concern gate (G2 security review BLOCKER): the keyword backstop and the
// LearningOp override, with no model call and no convex-test needed.
import { describe, expect, test } from 'vitest';
import { gateByServerConcern, keywordBackstopCategory } from './concernGate';
import type { LearningOp } from './learningPolicy';

function baseOp(overrides: Partial<LearningOp> = {}): LearningOp {
  return { trigger: 'explicit', kind: 'note', text: 'placeholder', suggestedScope: 'family', confidence: 1, sensitive: false, about: [], ...overrides };
}

describe('keywordBackstopCategory', () => {
  test('matches a health keyword case-insensitively', () => {
    expect(keywordBackstopCategory('Twin 1 is probably being bullied at school')).toBe('health');
    expect(keywordBackstopCategory('Twin 2 has been having panic attacks lately')).toBe('health');
    expect(keywordBackstopCategory('BULLIED again today')).toBe('health');
  });

  test('matches a school-trouble keyword', () => {
    expect(keywordBackstopCategory('He is failing math this semester')).toBe('school_trouble');
  });

  test('ordinary logistics text matches nothing', () => {
    expect(keywordBackstopCategory('Twins have soccer Monday at 6')).toBeNull();
    expect(keywordBackstopCategory('Add eggs to the groceries list')).toBeNull();
  });
});

describe('gateByServerConcern', () => {
  test("'ok' passes the op through unchanged", () => {
    const op = baseOp({ sensitive: false });
    expect(gateByServerConcern(op, 'ok')).toEqual(op);
  });

  test("a non-'ok' category forces personal-sensitive regardless of what the source said", () => {
    const op = baseOp({ sensitive: false, suggestedScope: 'family' });
    const gated = gateByServerConcern(op, 'health');
    expect(gated.sensitive).toBe(true);
    expect(gated.concernCategory).toBe('health');
    // suggestedScope itself isn't touched here — decideLearning's existing `sensitive` branch is what
    // collapses it to 'personal'; the gate's job is just to make sure `sensitive` is really true.
  });

  test('school_trouble / feelings / kid_trait map onto the LearningOp concern union', () => {
    expect(gateByServerConcern(baseOp(), 'school_trouble').concernCategory).toBe('schoolTrouble');
    expect(gateByServerConcern(baseOp(), 'feelings').concernCategory).toBe('feelings');
    expect(gateByServerConcern(baseOp(), 'kid_trait').concernCategory).toBe('kidTrait');
  });

  test("'web_content' sets derivedFromWebSearch instead of a concernCategory", () => {
    const gated = gateByServerConcern(baseOp({ concernCategory: 'health' }), 'web_content');
    expect(gated.derivedFromWebSearch).toBe(true);
    expect(gated.concernCategory).toBeUndefined();
  });
});
