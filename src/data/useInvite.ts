// The invite card (Screen 9 redesign, CONTRACT v0.14): what the join screen shows before anyone is a
// member — adult or kid, who invited them, the MEGA that comes with the invite, who's already here.
import { api } from './api';
import { useQuery } from './useQuery';

export function useInvitePreview(token: string | undefined) {
  return useQuery(api.invites.preview, token ? { token } : 'skip');
}
