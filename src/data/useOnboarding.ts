// G5 (CONTRACT v0.17): the onboarding chat. It's server-driven (MEGA's lines are G5_COPY, posted by the backend),
// so the app only starts it (`onboarding.begin` from "Start a family"), reads where it is (`onboarding.state`, to
// turn the composer into "What should I call you?" while the step is `name`) and skips an offer (Not now).
import { useMutation } from 'convex/react';
import type { CONNECT_OFFERS } from '@shared/config/ids';
import { api } from './api';
import { useQueryState } from './useQuery';

export type ConnectOffer = (typeof CONNECT_OFFERS)[number];

/** The caller's onboarding progress; `null` once they have none (joined adults, kids, the seeded admin). A stub
 * or refusal reads as "not onboarding" so the chat keeps its normal composer. */
export function useOnboardingState() {
  const state = useQueryState(api.onboarding.state, {});
  return state.status === 'ok' ? state.data : null;
}

export function useBeginOnboarding() {
  return useMutation(api.onboarding.begin);
}

export function useAddPerson() {
  return useMutation(api.onboarding.addPerson);
}

export function useSkipOffer(): (offer: ConnectOffer) => Promise<null> {
  const skip = useMutation(api.onboarding.skip);
  return (offer) => skip({ offer });
}
