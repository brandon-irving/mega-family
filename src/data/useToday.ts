// Today sheet data: events, things waiting on you, lists and the MEGA statement, plus the two
// response mutations its buttons call.
import { useMutation } from 'convex/react';
import { api } from './api';
import { useQuery } from './useQuery';

export function useToday() {
  return useQuery(api.today.get, {}); // no-flicker (useQuery wrapper): keeps showing today's count on a refetch
}

export function useAnswerNotification() {
  return useMutation(api.notifications.answer);
}

export function useRespondToRequest() {
  return useMutation(api.requests.respond);
}
