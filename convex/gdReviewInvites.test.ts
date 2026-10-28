/// <reference types="vite/client" />
// GD correctness review (BLOCKER): `invites.redeem` is an action that reads (prepareRedeem) and writes
// (finishRedeem) in two transactions. Two concurrent redeems of one token both passed the read, and the
// second write silently re-pointed the member's authId at the second caller. finishRedeem must re-check
// the claim inside its own transaction.
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const WEEK = '2026-10-25';

function code(err: unknown): string | undefined {
  return (err as { data?: { code?: string } } | undefined)?.data?.code;
}

async function unjoinedAdultInvite() {
  const t = convexTest(schema, modules);
  const { familyId } = await t.mutation(internal.seed.sampleFamily, { weekOf: WEEK });
  const memberId: Id<'members'> = await t.run((ctx) => ctx.db.insert('members', { familyId, name: 'New Adult', role: 'adult', activities: [], hasMega: false }));
  const { url } = await t.withIdentity({ subject: 'sample:admin' }).mutation(api.invites.create, { memberId });
  const token = url.split('/').pop()!;
  const info = await t.query(internal.invites.prepareRedeem, { token, authId: 'device-a' });
  if (!info.ok) throw new Error('setup: invite should be redeemable');
  return { t, memberId, inviteId: info.inviteId };
}

describe('invites.finishRedeem: a second claim of one invite is refused (race)', () => {
  test('two finishRedeem calls for the same invite: the second is INVALID_INVITE and authId stays with the first', async () => {
    const { t, memberId, inviteId } = await unjoinedAdultInvite();
    await t.mutation(internal.invites.finishRedeem, { inviteId, memberId, authSubject: 'device-a' });
    const err = await t.mutation(internal.invites.finishRedeem, { inviteId, memberId, authSubject: 'device-b' }).catch((e) => e);
    expect(code(err)).toBe('INVALID_INVITE');
    const member = await t.run((ctx) => ctx.db.get(memberId));
    expect(member?.authId).toBe('device-a');
  });

  test('an identity that already belongs to a member cannot claim a second invite in the same race', async () => {
    const { t, memberId, inviteId } = await unjoinedAdultInvite();
    // device-a already joined as someone else between the read and the write
    const err = await t.mutation(internal.invites.finishRedeem, { inviteId, memberId, authSubject: 'sample:partner' }).catch((e) => e);
    expect(code(err)).toBe('VALIDATION');
  });
});
