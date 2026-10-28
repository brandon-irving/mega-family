// GD Screen 12 (CONTRACT v0.13): sharing, clash proposals and gift ideas. The explicit-share rule lives on
// the server; the app only ever calls the owner's own `shareSuggestions.answer` / `events.share`.
import { useMutation } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from './api';
import { useQueryState } from './useQuery';

export function useShareSuggestion(suggestionId: Id<'shareSuggestions'>) {
  return useQueryState(api.shareSuggestions.get, { suggestionId });
}

export function useAnswerShareSuggestion() {
  return useMutation(api.shareSuggestions.answer);
}

export function useProposal(proposalId: Id<'proposals'>) {
  return useQueryState(api.proposals.get, { proposalId });
}

/** Adults only; kids get FORBIDDEN, which the calendar treats as "no open proposals". */
export function useOpenProposals(enabled: boolean) {
  return useQueryState(api.proposals.open, enabled ? {} : 'skip');
}

export function useDecideProposal() {
  return useMutation(api.proposals.decide);
}

export function useGiftIdeas(giftIdeasId: Id<'giftIdeas'>) {
  return useQueryState(api.gifts.get, { giftIdeasId });
}

export function useAddGiftToList() {
  return useMutation(api.gifts.addToList);
}
