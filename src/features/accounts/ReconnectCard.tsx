// The `reconnect` card (CONTRACT v0.17 §3; board Reconnect): a Google grant lapsed (Testing mode: every 7 days).
// Says what MEGA can't check until then, Reconnect / Not now stacked full width, and Google's "unverified app"
// note as the foot. Reconnect runs the same Google connect as the onboarding card, asking again for everything
// the grant covered; Not now says where to reconnect later. Once the integration is connected again the card
// shows that instead of the buttons.
import { useState } from 'react';
import type { Id } from '@shared/domain/validators';
import type { IntegrationView } from '@shared/domain/api';
import { G5_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { useAccountActions, useIntegrations } from '@/data/useAccounts';
import { connectGoogle } from '@/services/googleConnect';
import { useRunAction } from '@/features/shell/useRunAction';
import { CardFallback } from '@/features/kids/CardFallback';
import { IconCard } from '@/features/integrations/G4Card';
import { CardActions } from '@/ui/ThreadCard';
import { useTokens } from '@/ui/theme';
import { googleProductsOf, reconnectWhat } from './accountFormat';

export function ReconnectCardView({
  google,
  megaName,
  later,
  busy,
  failed,
  onReconnect,
  onLater,
}: {
  /** The owner's Google integrations (the lapsed one and any sharing its grant). */
  google: IntegrationView[];
  megaName: string;
  later: boolean;
  busy: boolean;
  failed: boolean;
  onReconnect: () => void;
  onLater: () => void;
}) {
  const tokens = useTokens();
  const fixed = google.length > 0 && google.every((i) => i.status === 'connected');
  const what = reconnectWhat(google.map((i) => i.kind));
  const status = fixed
    ? { text: G5_COPY.accountConnected, color: tokens.success }
    : busy
      ? { text: U.connecting, color: tokens.success }
      : failed
        ? { text: U.connectFailed, color: tokens.warn }
        : later
          ? { text: U.reconnectLater, color: tokens.muted }
          : null;
  return (
    <IconCard from={fillCopy(U.fromAccounts, { mega: megaName })} icon="refresh" title={G5_COPY.reconnectTitle} body={fillCopy(G5_COPY.reconnectBody, { what })} status={status} foot={G5_COPY.gmailTestingNote} testID="reconnect-card">
      {fixed || later ? null : (
        <CardActions
          cols={1}
          actions={[
            { id: 'reconnect', label: G5_COPY.accountReconnect, onPress: onReconnect, loading: busy },
            { id: 'later', label: G5_COPY.notNow, variant: 'ghost', onPress: onLater, disabled: busy },
          ]}
        />
      )}
    </IconCard>
  );
}

/** The integrations a reconnect card is about: the ones it names (CONTRACT v0.17b `integrationIds`, one card per
 * lapsed grant), else just its own `integrationId` (a v0.17 card). Never another Google account's. */
export function coveredByCard(google: IntegrationView[], integrationId: Id<'integrations'>, integrationIds: Id<'integrations'>[] | undefined): IntegrationView[] {
  const ids = new Set<string>(integrationIds?.length ? integrationIds : [integrationId]);
  return google.filter((i) => ids.has(i.integrationId));
}

export function ReconnectCard({ integrationId, integrationIds, megaName }: { integrationId: Id<'integrations'>; integrationIds?: Id<'integrations'>[]; megaName: string }) {
  const state = useIntegrations();
  const actions = useAccountActions();
  const { busy, run } = useRunAction();
  const [later, setLater] = useState(false);
  const [failed, setFailed] = useState(false);
  if (state.status !== 'ok') return <CardFallback state={state} from={fillCopy(U.fromAccounts, { mega: megaName })} />;
  const google = state.data.filter((i) => i.kind === 'gmail' || i.kind === 'googleCalendar');
  const covered = coveredByCard(google, integrationId, integrationIds);
  return (
    <ReconnectCardView
      google={covered}
      megaName={megaName}
      later={later}
      busy={busy === 'reconnect'}
      failed={failed}
      onReconnect={() =>
        void run('reconnect', async () => {
          setFailed(false);
          const result = await connectGoogle(googleProductsOf(covered.map((i) => i.kind)), actions);
          if (result === 'failed') setFailed(true);
        })
      }
      onLater={() => setLater(true)}
    />
  );
}
