import { recordedAction } from '@/services/demoRecording';
import { useMutation } from 'convex/react';
import { api } from './api';
import { useQueryState } from './useQuery';

export function useDemoProfile() {
  const state = useQueryState(api.demo.profile, {});
  const switchProfile = useMutation(api.demo.switchProfile);
  const testInvite = useMutation(api.demo.testInvite);
  const switchTester = useMutation(api.demo.switchTester);
  return { testInvite: recordedAction('demo.openInvitation',testInvite), switchTester: recordedAction('demo.switchPersona',switchTester), profile: state.status === 'ok' ? state.data : null, switchProfile: recordedAction('demo.switchProfile',switchProfile) };
}
