// Opt-in real-model regression; synthetic text only, no database or family changes.
import assert from 'node:assert/strict';
import { metaChatModel } from '../../convex/adapters/metaChatModel';
import { NAME_REPLY_SCHEMA } from '../../convex/onboardingConversation';
import { ONBOARDING } from '../../shared/config/onboarding';
import { LIMITS } from '../../shared/config';

async function main() {
  for (const scenario of [
    { text: "Hi Teal! I'm Brandon and I'd like to make an assistant for my mother Lovie.", name: 'Brandon' },
    { text: 'My mother is Lovie. She is a working mother. What could an assistant do for her?', name: null },
    { text: 'Hello, can you tell me what you can help with before we start?', name: null },
  ]) {
    const result = await metaChatModel.chat({
      messages: [{ role: 'system', content: ONBOARDING.nameConversationPrompt }, { role: 'user', content: scenario.text }],
      schema: { name: 'onboarding_name_reply', schema: NAME_REPLY_SCHEMA, strict: true },
      maxTokens: LIMITS.agent.maxTokensStructured, effort: LIMITS.agent.effort,
    });
    const answer = JSON.parse(result.text ?? '{}');
    assert.equal(answer.name, scenario.name);
    assert.equal(typeof answer.reply, 'string');
    assert(answer.reply.length > 10);
    console.log(JSON.stringify({ scenario: scenario.text, name: answer.name, reply: answer.reply }));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Onboarding smoke check failed'); process.exitCode = 1; });
