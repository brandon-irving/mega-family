// "Voice can answer a block" (PLAN "Thread UI blocks" / G2 scope): if the latest MEGA message in the
// thread is an unanswered block when talk mode sends, the transcript answers it instead of becoming a
// plain chat message. Pure mapping, so it's testable without the rest of talk mode: choice loosely
// matches option labels, text is used as is, everything else falls back to a normal message (`null`).
import type { BlockAnswer, UIBlock } from '@shared/domain/messages';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Loose match: a spoken option counts if the option's label and the transcript each contain the
 * other's normalized words (handles "daughter" matching "she's my daughter" and vice versa). */
function looselyMatches(spoken: string, label: string): boolean {
  const a = normalize(spoken);
  const b = normalize(label);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/** @returns the block answer the transcript maps to, or `null` to fall back to a normal `chat.send`. */
export function mapVoiceBlockAnswer(block: UIBlock, text: string): BlockAnswer | null {
  const spoken = text.trim();
  if (!spoken) return null;

  if (block.kind === 'text') return { value: spoken };

  if (block.kind === 'choice') {
    const matches = block.options.filter((o) => looselyMatches(spoken, o.label));
    if (matches.length > 0) {
      const optionIds = block.multi ? matches.map((m) => m.id) : [matches[0].id];
      return { optionIds };
    }
    if (block.allowOther) return { optionIds: [], other: spoken };
    return null;
  }

  // toggle/number/date/fields/look/questions/invite/confirm: no reliable voice mapping, so the
  // transcript is sent as a normal message instead of guessing at a block answer.
  return null;
}
