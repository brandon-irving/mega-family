import { useMutation, useAction } from 'convex/react';
import { api } from './api';
import { useQueryState } from './useQuery';
export function useDemoConsole() {
  return { authorizeStart: useMutation(api.demoCleanup.authorizeStart), authorizeCode: useAction(api.demoCleanup.authorizeCode), clearGoogle: useAction(api.demoCleanup.clear), abandon: useMutation(api.demoConsole.abandon), state: useQueryState(api.demoConsole.state, {}), start: useMutation(api.demoConsole.start), reset: useMutation(api.demoConsole.reset), prepare: useMutation(api.demoConsole.prepare), trigger: useMutation(api.demoConsole.trigger), cleanup: useAction(api.demoConsole.cleanup) };
}
