import { useViewer } from './useViewer';
import { ageGroupAt, canConnectAccountsAt, AccountConnectionPermissionError } from '@shared/ageGroups';
// G5 (CONTRACT v0.17): connected accounts — the owner's own Gmail, Google Calendar, this phone's calendar and
// schedule links (.ics) — and what MEGA found in Gmail. Every function is owner-only on the server; reads go
// through `useQueryState`, so a stub (backend still being built), a refusal or a provider failure renders a calm
// line instead of throwing into the thread or the page. Tokens and saved ICS URLs never reach the app.
import { useAction, useMutation } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import type { GOOGLE_PRODUCTS } from '@shared/config/ids';
import { api } from './api';
import { useQueryState } from './useQuery';
import type { ConnectOffer } from './useOnboarding';

export type GoogleProduct = (typeof GOOGLE_PRODUCTS)[number];

/** The caller's own integrations (Settings → Connected accounts). */
export function useIntegrations() {
  return useQueryState(api.integrations.list, {});
}

/** The live state behind one `connect` card. */
export function useOffer(offer: ConnectOffer) {
  return useQueryState(api.integrations.offer, { offer });
}

/** The rows behind a `mailFound` card (owner only). */
export function useMailItems(itemIds: Id<'mailItems'>[]) {
  return useQueryState(api.mail.items, itemIds.length > 0 ? { itemIds } : 'skip');
}

export function useAccountActions() {
  const viewer = useViewer();
  return {
    assertCanConnect: () => { const now = new Date().getTime(); if (!viewer || !canConnectAccountsAt(viewer.member, now, viewer.family.timezone)) throw new AccountConnectionPermissionError(viewer ? ageGroupAt(viewer.member, now, viewer.family.timezone) : 'unknown'); },
    googleStart: useMutation(api.integrations.googleStart),
    googleConnectCode: useAction(api.integrations.googleConnectCode),
    connectDevice: useMutation(api.integrations.connectDevice),
    syncDevice: useMutation(api.integrations.syncDevice),
    addIcs: useAction(api.integrations.addIcs),
    disconnect: useAction(api.integrations.disconnect),
    syncNow: useAction(api.integrations.syncNow),
    dismissMail: useMutation(api.mail.dismiss),
  };
}

export type AccountActions = ReturnType<typeof useAccountActions>;
