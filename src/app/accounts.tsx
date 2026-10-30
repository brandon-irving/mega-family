// Settings → Connected accounts (canvas Screen 16, boards SettingsAccounts / SettingsAccountsLapse /
// SettingsDisconnect): the owner's own Gmail, calendars and schedule links. Disconnect (and a link's Remove)
// asks first in a sheet — Disconnect (danger) / Keep connected, stacked full width — then the row says what
// happened. "Add a schedule link" opens the same link field as the onboarding card, in a sheet. Every sheet
// closes every way (ModalSheet); the page itself closes with ✕ or Escape (Sheet).
import { useState } from 'react';
import { router } from '@/features/shell/navigation';
import { View } from 'react-native';
import type { IntegrationView } from '@shared/domain/api';
import { G5_COPY, G5_FIX_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { useAccountActions, useIntegrations, useOffer, type GoogleProduct } from '@/data/useAccounts';
import { useFamilyNow } from '@/data/useShopping';
import { errorCopyFor } from '@/data/errorCopy';
import { connectGoogle } from '@/services/googleConnect';
import { AccountsContent } from '@/features/accounts/AccountsContent';
import { googleProductsOf, kindName } from '@/features/accounts/accountFormat';
import { LinkField } from '@/features/accounts/parts';
import { PhoneCalendarSheet } from '@/features/accounts/PhoneCalendarSheet';
import { useAddIcsLink } from '@/features/accounts/useAddIcsLink';
import { syncPhone, usePhoneCalendarFlow } from '@/features/accounts/usePhoneCalendarFlow';
import { CardFallback } from '@/features/kids/CardFallback';
import { AdultOnly } from '@/features/shell/RoleGate';
import { Button } from '@/ui/Button';
import { ModalSheet } from '@/ui/ModalSheet';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

/** Adults only (G5 UX review): a kid is sent back to chat before any of this page's queries run. */
export default function AccountsRoute() {
  return (
    <AdultOnly>
      <AccountsScreen />
    </AdultOnly>
  );
}

function AccountsScreen() {
  const tokens = useTokens();
  const list = useIntegrations();
  const gmailOffer = useOffer('gmail');
  const actions = useAccountActions();
  const now = useFamilyNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<IntegrationView | null>(null);
  const [icsOpen, setIcsOpen] = useState(false);
  const ics = useAddIcsLink(actions.addIcs);
  const note = (key: string, text: string) => setNotes((n) => ({ ...n, [key]: text }));
  const phone = usePhoneCalendarFlow(actions, now, () => note('deviceCalendar', ''));

  const run = async (key: string, fn: () => Promise<void>, noteKey?: string) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      if (noteKey) note(noteKey, errorCopyFor(e));
    } finally {
      setBusy(null);
    }
  };

  const google = (want: GoogleProduct[], key: string, noteKey: string) =>
    run(key, async () => {
      const result = await connectGoogle(want, actions);
      if (result === 'failed') note(noteKey, U.connectFailed);
    }, noteKey);

  const syncNow = (i: IntegrationView) =>
    run(`sync:${i.integrationId}`, async () => {
      if (i.kind === 'deviceCalendar') {
        if (now !== undefined && (await syncPhone(i.integrationId, now, actions))) note(i.integrationId, fillCopy(G5_COPY.accountLastChecked, { ago: U.agoJustNow }));
        return;
      }
      const r = await actions.syncNow({ integrationId: i.integrationId });
      note(i.integrationId, r.failure ? U.syncFailed[r.failure] : fillCopy(G5_COPY.accountLastChecked, { ago: U.agoJustNow }));
    }, i.integrationId);

  const disconnect = (i: IntegrationView) =>
    run(`disconnect:${i.integrationId}`, async () => {
      await actions.disconnect({ integrationId: i.integrationId });
      setConfirm(null);
      note(i.kind === 'ics' ? 'ics' : i.kind, fillCopy(G5_COPY.accountDisconnected, { what: kindName(i) }));
    }, i.integrationId);

  const addIcs = () =>
    void ics.submit().then((r) => {
      if (!r) return;
      setIcsOpen(false);
      note(r.integrationId, fillCopy(G5_COPY.icsAdded, { title: r.label ?? U.sectionLinks }));
    });

  return (
    <Sheet title={G5_COPY.accountsTitle} onClose={() => router.back()}>
      {list.status !== 'ok' ? (
        <CardFallback state={list} from={G5_COPY.accountsTitle} />
      ) : (
        <AccountsContent
          integrations={list.data}
          googleAvailable={gmailOffer.status === 'ok' ? gmailOffer.data.available.google : false}
          phoneSupported={phone.supported}
          now={now}
          busy={busy ?? (phone.stage === 'asking' || phone.stage === 'adding' ? 'phone' : null)}
          notes={{ ...notes, ...(phone.error ? { deviceCalendar: phone.error } : {}), ...(phone.stage === 'denied' ? { deviceCalendar: G5_COPY.calendarPhoneDenied } : {}) }}
          on={{
            onConnectGoogle: (p) => void google([p], `connect:${p}`, p),
            onReconnect: (i) => void google(googleProductsOf(list.data.filter((x) => (x.kind === 'gmail' || x.kind === 'googleCalendar') && x.status !== 'disconnected').map((x) => x.kind)), `reconnect:${i.integrationId}`, i.integrationId),
            onSyncNow: (i) => void syncNow(i),
            onDisconnect: setConfirm,
            onAddPhone: () => void phone.start(),
            onAddIcs: () => setIcsOpen(true),
          }}
        />
      )}

      <ModalSheet open={!!confirm} title={confirm ? fillCopy(U.disconnectTitle, { what: kindName(confirm) }) : ''} closeLabel={U.close} onClose={() => setConfirm(null)} testID="disconnect-sheet">
        {confirm ? (
          <View style={{ gap: tokens.spacing.md }}>
            <Text color="muted">{fillCopy(U.disconnectBody, { what: kindName(confirm) })}</Text>
            <Button label={G5_COPY.accountDisconnect} variant="danger" onPress={() => void disconnect(confirm)} loading={busy === `disconnect:${confirm.integrationId}`} style={{ alignSelf: 'stretch' }} />
            <Button label={U.keepConnected} variant="secondary" onPress={() => setConfirm(null)} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : null}
      </ModalSheet>

      <ModalSheet open={icsOpen} title={U.icsSheetTitle} closeLabel={U.close} onClose={() => setIcsOpen(false)} testID="ics-sheet">
        <View style={{ gap: tokens.spacing.md }}>
          <Text color="muted">{G5_COPY.icsBody}</Text>
          <LinkField label={U.icsFieldLabel} value={ics.text} placeholder={G5_COPY.icsPlaceholder} error={ics.error} onChange={ics.setText} onSubmit={addIcs} />
          <Button label={ics.busy ? G5_FIX_COPY.icsAdding : U.icsAdd} onPress={addIcs} loading={ics.busy} disabled={ics.busy} style={{ alignSelf: 'stretch' }} />
        </View>
      </ModalSheet>

      <PhoneCalendarSheet
        open={phone.stage === 'picking' || phone.stage === 'adding'}
        calendars={phone.calendars}
        picks={phone.picks}
        busy={phone.stage === 'adding'}
        onToggle={phone.toggle}
        onAdd={() => void phone.add()}
        onClose={phone.close}
      />
    </Sheet>
  );
}
