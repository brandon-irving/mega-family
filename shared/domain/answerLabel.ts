// The one place that turns a block answer into the words the member picked ("9:00 PM", "Daughter"). The
// server writes it as the `answer` message's label (convex/chat.ts `answerBlock`) and the app shows it on a
// collapsed block (src/features/chat/Blocks.tsx `AnsweredBlock`), so both always say the same thing.
import type { BlockAnswer, UIBlock } from './messages';

export function summarizeAnswer(block: UIBlock, answer: BlockAnswer): string {
  if (answer.skipped) return 'Skipped';
  if (block.kind === 'choice' && answer.optionIds) {
    const labels = block.options.filter((o) => answer.optionIds!.includes(o.id)).map((o) => o.label);
    return [...labels, answer.other].filter(Boolean).join(', ') || 'No answer';
  }
  if (answer.fields) return Object.values(answer.fields).filter(Boolean).join(' · ') || 'No answer';
  if (answer.value !== undefined) return String(answer.value);
  return 'Answered';
}
