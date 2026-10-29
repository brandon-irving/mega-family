// The invite card (Screen 9 redesign, CONTRACT v0.14): what the join screen shows before anyone is a
// member — adult or kid, who invited them, the MEGA that comes with the invite, who's already here.
import { useMutation } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from './api';
import { useQuery, useQueryState } from './useQuery';

export function useInvitePreview(token: string | undefined) {
  return useQuery(api.invites.preview, token ? { token } : 'skip');
}

/** Makes a new invite for an unjoined member (a parent or the admin). Each call is a new code. */
export function useCreateInvite() {
  return useMutation(api.invites.create);
}

/** The member's invite state (`invites.forMember`: none / joined / pending / expired); null until it answers.
 * The link itself can't be read back (only its hash is stored), so "Show invite" makes a fresh one. */
export function useMemberInvite(memberId: Id<'members'>) {
  const state = useQueryState(api.invites.forMember, { memberId });
  return state.status === 'ok' ? state.data : null;
}
