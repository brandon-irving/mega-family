// G8 (CONTRACT v0.18 §4): the viewer's widget timeline (`widgets.next`), only while they're a signed-in member.
import { api } from './api';
import { useQuery } from './useQuery';

export function useWidgetTimeline(enabled: boolean) {
  return useQuery(api.widgets.next, enabled ? {} : 'skip');
}
