// Today sheet data: events, things waiting on you, lists and the MEGA statement, plus the two
// response mutations its buttons call.
import { useMutation, useQuery } from 'convex/react';
import { api } from './api';

export function useToday() {
  return useQuery(api.today.get, {});
}

export function useAnswerNotification() {
  return useMutation(api.notifications.answer);
}

export function useRespondToRequest() {
  return useMutation(api.requests.respond);
}
