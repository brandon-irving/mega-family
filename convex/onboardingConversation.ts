import { GOOGLE_ASSISTANT_PROMPT } from '../shared/config/google';
import { offerGoogleSetup } from './model/googleSetup';
// First-contact conversation uses the same model adapter, spend guard, name setter and conversation flow.
import { v } from 'convex/values';
import { LIMITS } from '../shared/config';
import { G5_COPY } from '../shared/config/copy';
import { ONBOARDING } from '../shared/config/onboarding';
import { internal } from './_generated/api';
import { internalAction, internalMutation } from './_generated/server';
import { callModel, parseJson } from './model/modelCall';
import { onboardingRow } from './model/integrations';
import { afterName, parseName, setName } from './model/onboarding';
import { clock } from './ports/clock';

export const NAME_REPLY_SCHEMA = {
  type: 'object',
  properties: { name: { type: ['string', 'null'] }, reply: { type: 'string' }, offerGoogle: { type: 'boolean', description: 'True when the person asks to connect Google, Gmail or Calendar.' } },
  required: ['name', 'reply', 'offerGoogle'], additionalProperties: false,
};

export const reply = internalAction({
  args: { familyId: v.id('families'), memberId: v.id('members'), replyMessageId: v.id('messages'), userText: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    let name: string | null = null;
    let offerGoogle = false;
    let text: string = G5_COPY.nameConversationFallback;
    try {
      const result = await callModel(ctx, args.familyId, {
        messages: [{ role: 'system', content: `${ONBOARDING.nameConversationPrompt} ${GOOGLE_ASSISTANT_PROMPT} If they ask to connect Google, set offerGoogle=true; the app will provide its setup card. A reply such as "Brandon, can you connect to my Google?" gives the owner name Brandon and a Google setup request.` }, { role: 'user', content: args.userText }],
        schema: { name: 'onboarding_name_reply', schema: NAME_REPLY_SCHEMA, strict: true },
        maxTokens: LIMITS.agent.maxTokensStructured, effort: LIMITS.agent.effort,
      });
      const parsed = parseJson<{ name?: unknown; reply?: unknown; offerGoogle?: unknown }>(result.text);
      offerGoogle = parsed?.offerGoogle === true;
      // Require an actual name from the message, not an invented identity or a truncated long name.
      if (typeof parsed?.name === 'string' && args.userText.toLocaleLowerCase().includes(parsed.name.toLocaleLowerCase())) name = parseName(parsed.name);
      if ((parsed?.name === null || name) && typeof parsed?.reply === 'string' && parsed.reply.trim()) text = parsed.reply.trim();
    } catch {
      // Offline, over budget or malformed output: keep chatting, with a useful name question.
    }
    await ctx.runMutation(internal.onboardingConversation.finish, { ...args, name, text, offerGoogle });
    return null;
  },
});

export const finish = internalMutation({
  args: { familyId: v.id('families'), memberId: v.id('members'), replyMessageId: v.id('messages'), userText: v.string(), name: v.union(v.string(), v.null()), text: v.string(), offerGoogle: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    const message = await ctx.db.get(args.replyMessageId);
    if (!member || member.familyId !== args.familyId || !message || message.familyId !== args.familyId || !message.streamId || message.body.type !== 'text' || message.body.text) return null;
    const thread = await ctx.db.get(message.threadId);
    if (thread?.ownerId !== member._id) return null;
    const row = await onboardingRow(ctx, args.familyId, member._id);
    let text = args.text;
    if (row?.step === 'name' && args.name) {
      const now = Math.max(await clock.now(ctx, args.familyId), thread.lastAt + 1);
      await setName(ctx, member, args.name, now);
      await afterName(ctx, member, now, false);
    } else if (row?.step !== 'name') {
      // A later name reply may have completed setup while this model request was in flight.
      text = G5_COPY.nameAlreadySet;
    }
    if (args.offerGoogle) {
      const outcome = await offerGoogleSetup(ctx, member, message.threadId, await clock.now(ctx, member.familyId));
      text = outcome.startsWith('Google setup is available') ? `${args.name ? `${args.name}, yes` : 'Yes'}—I can help you connect Gmail and Google Calendar. Open the Google setup card here to review permissions and choose what to share. You’ll approve access with Google yourself.` : outcome;
    }
    await ctx.db.patch(message._id, { body: { type: 'text', text } });
    await ctx.scheduler.runAfter(0, internal.chat.streamFixedText, { streamId: message.streamId, text });
    return null;
  },
});
