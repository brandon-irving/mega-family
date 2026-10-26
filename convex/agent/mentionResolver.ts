// The second pass of spoken-MEGA-name detection (CONTRACT §4 "Spoken MEGA names": "a loose sound-alike
// match against the family's MEGA names first, then Muse Spark only when the match is uncertain"). Takes a
// `ChatModel` explicitly (not the registry) so it's trivially testable with a scripted fake — this is pure
// orchestration, no `ctx.db`.
import { LIMITS } from '../../shared/config';
import type { SpokenMention } from '../../shared/domain/messages';
import { candidateTokens, detectSpokenMentions } from '../model/mentions';
import type { ChatModel } from '../ports/chatModel';
import { ChatModelError } from '../ports/chatModel';

const CONFIRM_SCHEMA = {
  type: 'object',
  properties: { isMegaName: { type: 'boolean' } },
  required: ['isMegaName'],
  additionalProperties: false,
} as const;

/** Confident matches run through with no model call. Tokens in the "uncertain" band
 * (`LIMITS.mention.escalateFloor` .. `minSimilarity`) each get one small structured call asking whether the
 * word was likely meant to address that MEGA; below the floor is dropped outright (too weak to bother the
 * model with). A model failure for one token just drops that token — it never blocks the confident ones. */
export async function resolveSpokenMentions(model: ChatModel, text: string, megas: { megaId: string; name: string }[]): Promise<SpokenMention[]> {
  const typedMegas = megas as unknown as Parameters<typeof detectSpokenMentions>[1];
  const confident = detectSpokenMentions(text, typedMegas);
  const confidentTokenStarts = new Set(confident.map((m) => m.start));

  const uncertain = candidateTokens(text, typedMegas).filter(
    (c) => c.best && c.best.score >= LIMITS.mention.escalateFloor && c.best.score < LIMITS.mention.minSimilarity && !confidentTokenStarts.has(c.start),
  );

  const escalated: SpokenMention[] = [];
  for (const c of uncertain) {
    const megaName = megas.find((m) => m.megaId === c.best!.megaId)?.name ?? '';
    try {
      const result = await model.chat({
        messages: [
          {
            role: 'system',
            content: 'A family member was talking to their house full of AI assistants (MEGAs). Decide whether a word they said was likely them addressing one of the MEGAs by name, or just a coincidentally similar word.',
          },
          { role: 'user', content: `Transcript: "${text}"\nWord said: "${c.token}"\nClosest MEGA name: "${megaName}"\nWas "${c.token}" likely meant as the name "${megaName}"?` },
        ],
        schema: { name: 'mention_check', schema: CONFIRM_SCHEMA, strict: true },
        maxTokens: LIMITS.agent.maxTokensStructured,
        effort: LIMITS.agent.effort,
      });
      const parsed = result.text ? JSON.parse(result.text) : null;
      if (parsed?.isMegaName) escalated.push({ megaId: c.best!.megaId, heard: c.token, start: c.start, end: c.end, confidence: c.best!.score });
    } catch (e) {
      if (!(e instanceof ChatModelError)) throw e; // a real bug should still surface; a down model just skips this token
    }
  }

  return [...confident, ...escalated].sort((a, b) => a.start - b.start);
}
