// Today sheet data: events, things waiting on you, lists and the MEGA statement, plus the two
// response mutations its buttons call.
import { useMutation, useQuery } from 'convex/react';
import { api } from './api';
import { useStableQuery } from './useStableQuery';

export function useToday() {
  return useStableQuery(useQuery(api.today.get, {})); // no-flicker: keeps showing today's count on a refetch
}

export function useAnswerNotification() {
  return useMutation(api.notifications.answer);
}

export function useRespondToRequest() {
  return useMutation(api.requests.respond);
}
