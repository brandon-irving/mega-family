/// <reference types="vite/client" />
// G3 UX review C6 (MEDIUM) + UX7 (HIGH, voice): a draft+judge result must be sanitized before it's ever
// shown — length-capped (truncated cleanly, never mid-word), emoji stripped (default off for every kind),
// and calmed to at most one "!" — regardless of how long or emoji-heavy the model's raw reply is.
import { describe, expect, test } from 'vitest';
import { DRAFT_SANITIZE } from '../shared/config/proactive';
import { parseDraftJudgeResult, sanitizeDraftText } from './model/proactive';

describe('C6/UX7: sanitizing a draft+judge result', () => {
  test('a long, emoji-heavy, multi-exclamation reply is cleanly truncated, de-emoji\'d, and calmed', () => {
    const rawText = '🎉🎉 Soccer practice starts in 10 minutes!!! Bring your cleats and water bottle and shin guards and do not forget your jersey this time please!!! 🚀';
    const rawTitle = '🚨🚨 SOCCER TIME RIGHT NOW!!! 🚨🚨';
    const result = parseDraftJudgeResult(
      JSON.stringify({ kind: 'reminder', title: rawTitle, text: rawText, score: 0.9, reason: 'due' }),
      'reminder',
      ['reminder'],
      'Soccer practice',
    );

    expect(result.text.length).toBeLessThanOrEqual(DRAFT_SANITIZE.maxTextLength);
    expect(result.title.length).toBeLessThanOrEqual(DRAFT_SANITIZE.maxTitleLength);
    expect(result.text).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u); // no emoji left
    expect(result.title).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect((result.text.match(/!/g) ?? []).length).toBeLessThanOrEqual(1); // calm: at most one "!"
    expect(result.text).not.toBe(''); // never collapses to nothing
    expect(result.title).not.toBe('');
  });

  test('truncation cuts at a word boundary, never mid-word', () => {
    const longText = 'word '.repeat(60).trim(); // well past maxTextLength, made entirely of whole words
    const truncated = sanitizeDraftText(longText, 'tip', DRAFT_SANITIZE.maxTextLength);
    expect(truncated.length).toBeLessThanOrEqual(DRAFT_SANITIZE.maxTextLength + 1); // +1 for the ellipsis char
    expect(truncated.endsWith('…')).toBe(true);
    expect(truncated.replace('…', '')).not.toMatch(/\bwor$|\bwo$|\bw$/); // not cut inside the word "word"
  });

  test('a missing title falls back to the sensible fallback (the reminder/trigger\'s own seed text), sanitized the same way', () => {
    const result = parseDraftJudgeResult(JSON.stringify({ kind: 'reminder', text: 'Return it', score: 0.9, reason: 'due' }), 'reminder', ['reminder'], 'Return the library book 📚!!!');
    expect(result.title.startsWith('Return the library book')).toBe(true);
    expect(result.title).not.toMatch(/📚/);
    expect((result.title.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  test('emoji allowance is config-driven and defaults to false for every kind', () => {
    expect(DRAFT_SANITIZE.allowEmoji.reminder).toBe(false);
    expect(DRAFT_SANITIZE.allowEmoji.request).toBe(false);
    expect(DRAFT_SANITIZE.allowEmoji.tip).toBe(false);
    expect(DRAFT_SANITIZE.allowEmoji.update).toBe(false);
  });
});

describe('GD review: emoji stripping keeps text symbols that are not emoji', () => {
  test('©, ® and ™ survive while real emoji are removed', () => {
    expect(sanitizeDraftText('Visit Disney™ today 🎢', 'reminder', 80)).toBe('Visit Disney™ today');
    expect(sanitizeDraftText('Lego® set and © notice', 'reminder', 80)).toBe('Lego® set and © notice');
  });
});
