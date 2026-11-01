// Opt-in live-model check. Synthetic conversations only; never invokes a database or creates a person.
import assert from 'node:assert/strict';
import { metaChatModel } from '../../convex/adapters/metaChatModel';
import { CREATION_TOOLS } from '../../convex/agent/creationToolSpecs';
import { MEGA_CREATION } from '../../shared/config/megaCreation';
import type { ChatMessage } from '../../convex/ports/chatModel';

const cases = [
  { name: 'typed mother', before: 'Who would you like to make a MEGA for?', text: 'This is for my mother', expectedTarget: 'new', relationship: 'parent' },
  { name: 'brainstorm before creating', before: 'How could a MEGA help your mother?', text: 'She is a working mother. What do you think would help? She also lives in Florida.', expectedTarget: undefined, relationship: undefined },
  { name: 'self appearance', before: 'How can I help?', text: 'Let’s create a MEGA just for me. I want a purple one named Orbit with a star.', expectedTarget: 'self', relationship: undefined },
];

async function main() {
  for (const scenario of cases) {
    const messages: ChatMessage[] = [{ role: 'system', content: `You are Teal, talking to Brandon, the family admin. No active draft yet. ${MEGA_CREATION.systemPrompt}` }, { role: 'assistant', content: scenario.before }, { role: 'user', content: scenario.text }];
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    let reply = '';
    for (let step = 0; step < 4; step++) {
      const r = await metaChatModel.chat({ messages, tools: CREATION_TOOLS, maxTokens: 1600, effort: 'low' });
      if (!r.toolCalls.length) { reply = r.text ?? ''; break; }
      messages.push({ role: 'assistant', content: r.text ?? '', toolCalls: r.toolCalls });
      for (const call of r.toolCalls) {
        const args = JSON.parse(call.arguments);
        calls.push({ name: call.name, args });
        messages.push({ role: 'tool', toolCallId: call.id, content: call.name === 'mega_draft_get' ? JSON.stringify({ text: 'No active draft.' }) : JSON.stringify({ draftId: 'synthetic-draft', revision: 1, status: 'draft', data: args, text: 'Draft saved. Keep discussing, offer appearance and review only when ready.' }) });
      }
    }
    if (scenario.expectedTarget) assert(calls.some(c => c.name === 'mega_draft_update' && c.args.target === scenario.expectedTarget), `${scenario.name}: expected a draft for ${scenario.expectedTarget}`);
    if (scenario.relationship) assert(calls.some(c => c.args.relationship === scenario.relationship), 'Mother relationship was not extracted');
    if (scenario.name === 'brainstorm before creating') {
      assert(!calls.some(c => c.name === 'mega_draft_review'), 'Brainstorming prematurely went to confirmation');
      assert(reply.length > 30, 'Expected conversational suggestions');
    }
    console.log(JSON.stringify({ scenario: scenario.name, calls, reply }));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Live model check failed'); process.exitCode = 1; });
