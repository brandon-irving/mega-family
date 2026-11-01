// Opt-in real-model check using synthetic briefs only; no database writes or connected accounts.
import assert from 'node:assert/strict';
import { metaChatModel } from '../../convex/adapters/metaChatModel';
import { KICKOFF_SCHEMA } from '../../convex/briefKickoff';
import { ASSISTANT_BRIEF } from '../../shared/config/assistantBrief';
import { LIMITS } from '../../shared/config';

async function main() {
  for (const scenario of [
    { name: 'Lovie', approved: { context: 'A working mother publicizing her children’s book', goal: 'Reach more parents and grow a following', firstTask: '', proactive: '' }, offerGoogle: true },
    { name: 'Anela', approved: { context: 'A 16-year-old who enjoys piano and is balancing homework with practice', goal: '', firstTask: '', proactive: '' }, offerGoogle: false },
  ]) {
    const result = await metaChatModel.chat({
      messages: [{ role: 'system', content: ASSISTANT_BRIEF.kickoff.prompt }, { role: 'user', content: JSON.stringify(scenario) }],
      schema: { name: 'brief_first_suggestion', schema: KICKOFF_SCHEMA, strict: true },
      maxTokens: LIMITS.agent.maxTokensStructured, effort: LIMITS.agent.effort,
    });
    const answer = JSON.parse(result.text ?? '{}');
    assert.equal(typeof answer.prompt, 'string');
    assert(answer.prompt.length > 20 && answer.prompt.length <= ASSISTANT_BRIEF.kickoff.maxPrompt);
    assert.equal(typeof answer.task, 'string');
    assert(answer.task.length > 15 && answer.task.length <= ASSISTANT_BRIEF.kickoff.maxTask);
    assert(!/what should we do first/i.test(answer.prompt));
    assert.equal(typeof answer.emailReason, 'string');
    if (!scenario.offerGoogle) assert.equal(answer.emailReason, '');
    console.log(JSON.stringify({ name: scenario.name, ...answer }));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'First-suggestion smoke check failed'); process.exitCode = 1; });
