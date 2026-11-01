import { beginFamily, createFamily } from './model/familySetup';
import { activeDraft } from './model/megaCreation';
// CONTRACT §4 "Session and onboarding". `onboarding.start` (tests, demo) creates the family, its admin member,
// their MEGA, default settings/sharing/profile and a thread in one step. G5 (v0.17): the app instead calls
// `onboarding.begin`, which creates the same family with an unnamed admin and opens the onboarding chat (Screen
// 13): "What should I call you?" → Gmail → a calendar → schedule links → the family step. The step machine lives
// in convex/model/onboarding.ts; `chat.send` / `chat.start` / `chat.answerBlock` route into it while it runs.
import { fillCopy, G5_COPY } from '../shared/config/copy';
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { fail } from './model/errors';
import { pick } from './model/define';
import { onboardingRow, requireConnector } from './model/integrations';
import { afterName, completeOffer, postStep, stepIsShowing, setName as setNameLogic } from './model/onboarding';
import { getOrCreateOwnThread, postOwnMegaMessage } from './model/threads';
import { requireViewer, tryViewer } from './model/viewer';
import { clock } from './ports/clock';

/** Reuse the family creation conversation after initial setup; repeated taps resume the same person. */
export const addPerson = mutation({
  ...pick(API.onboarding.addPerson),
  handler: async ctx => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role !== 'admin') fail('FORBIDDEN');
    const familyId = viewer.member.familyId;
    const now = await clock.now(ctx, familyId);
    const current = await onboardingRow(ctx, familyId, viewer.member._id);
    const thread = await getOrCreateOwnThread(ctx, familyId, viewer.member._id, viewer.mega?._id ?? null, now);
    if (await activeDraft(ctx, viewer.member)) return null;
    if (current && current.step !== 'done') {
      if (!await stepIsShowing(ctx, current, thread._id)) await postStep(ctx, current, now);
      return null;
    }
    const id = current?._id ?? await ctx.db.insert('onboarding', { familyId, memberId: viewer.member._id, step: 'family', outcomes: {}, startedAt: now });
    if (current) await ctx.db.patch(id, { step: 'family', family: undefined, personId: undefined, blockMessageId: undefined, finishedAt: undefined });
    await postStep(ctx, (await ctx.db.get(id))!, now);
    return null;
  },
});

export const start = mutation({
  ...pick(API.onboarding.start),
  handler: async (ctx, args) => {
    const { familyId, threadId } = await createFamily(ctx, args);
    return { familyId, threadId };
  },
});

// ---------- G5 (CONTRACT v0.17): the onboarding chat (Screen 13). ----------

/** Sign up → the chat opens with the admin's MEGA (ONBOARDING.firstMega) asking "What should I call you?". The
 * name is empty until they answer; the thread counts as started, so `chat.start` never adds the generic adult
 * greeting on top. */
export const begin = mutation({
  ...pick(API.onboarding.begin),
  handler: async (ctx, { timezone }) => {
    const { familyId, threadId } = await beginFamily(ctx, timezone);
    return { familyId, threadId };
  },
});

export const state = query({
  ...pick(API.onboarding.state),
  handler: async (ctx) => {
    const viewer = await tryViewer(ctx);
    if (!viewer) return null;
    const row = await onboardingRow(ctx, viewer.member.familyId, viewer.member._id);
    if (!row) return null;
    const named = row.step !== 'name' && !!viewer.member.name;
    return { step: row.step, outcomes: row.outcomes, ...(row.personId ? { personId: row.personId } : {}), ...(named ? { callMe: viewer.member.name } : {}) };
  },
});

export const setName = mutation({
  ...pick(API.onboarding.setName),
  handler: async (ctx, { name }) => {
    const viewer = await requireViewer(ctx);
    const now = await clock.now(ctx, viewer.member.familyId);
    const named = await setNameLogic(ctx, viewer.member, name, now);
    // `chat.send` streams this line as its reply instead; here it's a plain MEGA message.
    await postOwnMegaMessage(ctx, viewer.member.familyId, viewer.member._id, { type: 'text', text: fillCopy(G5_COPY.niceToMeet, { name: named }) }, now);
    await afterName(ctx, viewer.member, now);
    return null;
  },
});

export const skip = mutation({
  ...pick(API.onboarding.skip),
  handler: async (ctx, { offer }) => {
    const viewer = await requireViewer(ctx);
    // v0.17b (C8): adults only, like every connect mutation.
    requireConnector(viewer.member);
    const now = await clock.now(ctx, viewer.member.familyId);
    await completeOffer(ctx, { familyId: viewer.member.familyId, memberId: viewer.member._id, offer, outcome: 'skipped', now });
    return null;
  },
});
