// CONTRACT §4 "Chat and talk": `talk.transcribe`. G2: a real Transcriber call (behind `adapters/registry.ts`,
// so tests get the Fake adapter and never hit the network), spend-guarded like every other model call, with
// the family's MEGA names passed as vocabulary biasing (PLAN.md smoke test). Mention detection runs the
// same two-pass match `chat.send(via: "voice")` uses: the loose sound-alike match first, then Muse Spark
// only for tokens in the uncertain band (convex/agent/mentionResolver.ts).
//
// Frontend contract (G2, from the frontend track): `expo-audio` can't record WAV cross-platform, so the app
// uploads AAC in `.m4a` (iOS/Android) or `audio/webm` (web) via `files.uploadUrl`, and the storage object's
// content type carries the real format. Meta's batch transcribe endpoint only accepts WAV (Voice API
// reference, checked Oct 26: mono, 16-bit PCM, 16/24 kHz) — see `model/audioFormat.ts`'s docstring. Neither
// AAC/.m4a nor WebM/Opus is on that list, so a non-WAV upload is refused with a clear VALIDATION error
// rather than silently sent as the wrong format (which the endpoint would 400 on anyway) or transcoded
// without a product decision to add that step.
import { v, type Infer } from 'convex/values';
import { LIMITS } from '../shared/config';
import { estimateChatCostCents, transcribeCostCents } from '../shared/config/pricing';
import { API } from '../shared/domain/api';
import { getChatModel, getTranscriber } from './adapters/registry';
import { internal } from './_generated/api';
import { action, type ActionCtx, internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { audioEncodingForContentType } from './model/audioFormat';
import { pick } from './model/define';
import { fail } from './model/errors';
import { resolveSpokenMentions } from './agent/mentionResolver';
import { TranscriberError } from './ports/transcriber';

/** The uploaded recording's content type, read from the `_storage` system table (actions have no `ctx.db`,
 * so this is a small internalQuery the action calls through `ctx.runQuery`). */
export const storageContentType = internalQuery({
  args: { storageId: v.id('_storage') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const meta = await ctx.db.system.get('_storage', args.storageId);
    return meta?.contentType ?? null;
  },
});

// Explicit param/return types here (rather than letting `action(...)` infer them) break a genuine type
// cycle: this file exports a function that's itself part of the generated `internal`/`api` type, so a
// handler body that *uses* `internal` without an annotation makes TS need `transcribe`'s own type to
// finish resolving `transcribe`'s type. Annotating sidesteps it.
async function handler(ctx: ActionCtx, args: { storageId: Id<'_storage'> }): Promise<Infer<typeof API.talk.transcribe.returns>> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail('UNAUTHENTICATED');
  const viewer = await ctx.runQuery(internal.me.requireViewerInternal, { authSubject: identity.subject });
  const blob = await ctx.storage.get(args.storageId);
  if (!blob) fail('NOT_FOUND');

  const contentType = await ctx.runQuery(internal.talk.storageContentType, { storageId: args.storageId });
  const audioEncoding = audioEncodingForContentType(contentType ?? blob.type);
  if (!audioEncoding) {
    fail('VALIDATION', `unsupported recording format "${contentType ?? blob.type ?? 'unknown'}" — Meta's transcribe endpoint only accepts WAV (mono 16-bit PCM, 16/24 kHz)`);
  }
  const audio = await blob.arrayBuffer();

  const megas = await ctx.runQuery(internal.megas.forMentionMatching, {});
  const estimatedCents = transcribeCostCents(0) + estimateChatCostCents(500, LIMITS.agent.maxTokensStructured); // pessimistic floor; the real duration-based cost is recorded after
  await ctx.runMutation(internal.spend.requireBudget, { familyId: viewer.familyId, estimatedCents: Math.max(estimatedCents, 1) });

  let result;
  try {
    result = await getTranscriber().transcribe({ audio, audioEncoding, vocabulary: megas.map((m) => m.name) });
  } catch (e) {
    if (e instanceof TranscriberError) fail('VALIDATION', e.message);
    throw e;
  }
  await ctx.runMutation(internal.spend.recordUsage, { familyId: viewer.familyId, cents: transcribeCostCents(result.audioDurationMs) });

  const mentions = await resolveSpokenMentions(getChatModel(), result.text, megas);
  return { text: result.text, mentions };
}

export const transcribe = action({ ...pick(API.talk.transcribe), handler });
