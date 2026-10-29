// The invite card (Screen 9 redesign, CONTRACT v0.14): what the join screen shows before anyone is a
// member — adult or kid, who invited them, the MEGA that comes with the invite, who's already here.
import { useMutation } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from './api';
import { invitesForMember } from './pendingContract';
import { useQuery, useQueryState } from './useQuery';

export function useInvitePreview(token: string | undefined) {
  return useQuery(api.invites.preview, token ? { token } : 'skip');
}

/** Makes a new invite for an unjoined member (a parent or the admin). Each call is a new code. */
export function useCreateInvite() {
  return useMutation(api.invites.create);
}

/** When the member's newest open invite expires, if the server can say (CONTRACT v0.17b, pending); else null. */
export function useMemberInvite(memberId: Id<'members'>) {
  const state = useQueryState(invitesForMember, { memberId });
  return state.status === 'ok' ? state.data : null;
}
