// CONTRACT §4 "Chat and talk": `talk.transcribe` — day-1 stub. No Transcriber adapter is wired yet (PLAN.md
// → Backend "Meta Model API... (verify)"), so this ignores `storageId` and returns a canned transcript —
// but it runs the real spoken-mention detector against it, the same one `chat.send(via: "voice")` uses.
import type { Infer } from 'convex/values';
import { API } from '../shared/domain/api';
import { internal } from './_generated/api';
import { action, type ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { pick } from './model/define';
import { detectSpokenMentions } from './model/mentions';

const CANNED_TRANSCRIPT = 'Hey, can you remind me about soccer practice?';

// Explicit param/return types here (rather than letting `action(...)` infer them) break a genuine type
// cycle: this file exports a function that's itself part of the generated `internal`/`api` type, so a
// handler body that *uses* `internal` without an annotation makes TS need `transcribe`'s own type to
// finish resolving `transcribe`'s type. Annotating sidesteps it.
async function handler(ctx: ActionCtx, _args: { storageId: Id<'_storage'> }): Promise<Infer<typeof API.talk.transcribe.returns>> {
  const megas = await ctx.runQuery(internal.megas.forMentionMatching, {});
  return { text: CANNED_TRANSCRIPT, mentions: detectSpokenMentions(CANNED_TRANSCRIPT, megas) };
}

export const transcribe = action({ ...pick(API.talk.transcribe), handler });
