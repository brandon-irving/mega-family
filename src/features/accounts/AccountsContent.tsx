// Settings → Connected accounts (boards SettingsAccounts / SettingsAccountsLapse / SettingsDisconnect): grouped
// Email / Calendars / Schedule links. Each source row has its icon tile, name, a hint ("Connected as …" or the
// link's site, and "Checked 5 min ago") and a status dot (Connected · Needs you to sign in again · Couldn't
// check lately), with its buttons underneath: Sync now / Disconnect side by side; a lapsed Google source gets
// one full-width Reconnect; a failing link gets Try again / Remove. A source that isn't connected keeps its row
// with a Connect button (or says why it can't), so the page is never empty. Schedule links show only their site,
// never the URL (it can carry a private token). Presentational: the route wires the data and the sheets.
import { View } from 'react-native';
import type { IntegrationView } from '@shared/domain/api';
import { G5_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { LockNote, CardActions, type CardAction } from '@/ui/ThreadCard';
import { useTokens } from '@/ui/theme';
import type { GoogleProduct } from '@/data/useAccounts';
import { KIND_GLYPH, checkedLine, kindName, statusPill } from './accountFormat';
import { IconTile, StatusPill } from './parts';

export type AccountsHandlers = {
  onConnectGoogle: (product: GoogleProduct) => void;
  onReconnect: (i: IntegrationView) => void;
  onSyncNow: (i: IntegrationView) => void;
  onDisconnect: (i: IntegrationView) => void;
  onAddPhone: () => void;
  onAddIcs: () => void;
};

export type AccountsContentProps = {
  integrations: IntegrationView[];
  googleAvailable: boolean;
  phoneSupported: boolean;
  /** The family clock's now, for "Checked 5 min ago". */
  now: number | undefined;
  /** The running action, as `${action}:${integrationId}` (or `connect:gmail`, `phone`). */
  busy?: string | null;
  /** One line under a row after an action ("Disconnected…", "Checked just now."), keyed by kind or id. */
  notes?: Record<string, string>;
  on: AccountsHandlers;
};

const live = (i: IntegrationView) => i.status !== 'disconnected';

function SourceRow({ icon, label, hint, pill, actions, cols = 2, note, first }: { icon: IntegrationView['kind']; label: string; hint: string; pill?: { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }; actions: CardAction[]; cols?: 1 | 2; note?: string; first?: boolean }) {
  const tokens = useTokens();
  const tile = pill?.tone === 'warn' ? 'bucks' : pill?.tone === 'danger' ? 'danger' : pill?.tone === 'muted' || !pill ? 'muted' : 'accent';
  return (
    <View testID={`account-row-${icon}`} style={{ gap: tokens.spacing.sm, paddingVertical: tokens.spacing.md, borderTopWidth: first ? 0 : 1, borderTopColor: tokens.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
        <IconTile icon={KIND_GLYPH[icon]} tone={tile} />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text variant="label" numberOfLines={1}>
            {label}
          </Text>
          <Text variant="caption" color="muted">
            {hint}
          </Text>
          {pill ? <StatusPill text={pill.text} tone={pill.tone} /> : null}
        </View>
      </View>
      {note ? (
        <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
      <CardActions cols={cols} actions={actions} />
    </View>
  );
}

function Section({ title, children, foot }: { title: string; children: React.ReactNode; foot?: React.ReactNode }) {
  const tokens = useTokens();
  return (
    <View style={{ gap: tokens.spacing.xs }}>
      <Text variant="caption" weight="700" color="muted" accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      <View style={{ backgroundColor: tokens.surface, borderRadius: tokens.radii.xl, borderWidth: 1, borderColor: tokens.line, paddingHorizontal: tokens.spacing.lg }}>{children}</View>
      {foot}
    </View>
  );
}

export function AccountsContent({ integrations, googleAvailable, phoneSupported, now, busy, notes = {}, on }: AccountsContentProps) {
  const tokens = useTokens();
  const find = (kind: IntegrationView['kind']) => integrations.find((i) => i.kind === kind && live(i));
  const isBusy = (key: string) => busy === key;

  /** A connected Google source (Gmail / Google Calendar), or its "not connected" row. */
  const google = (kind: 'gmail' | 'googleCalendar', first: boolean) => {
    const i = find(kind);
    const name = kind === 'gmail' ? U.gmail : U.googleCalendar;
    if (!i) {
      return (
        <SourceRow
          first={first}
          icon={kind}
          label={name}
          hint={googleAvailable ? U.notConnected : U.googleNotSetUpHint}
          pill={{ text: U.off, tone: 'muted' }}
          note={notes[kind]}
          actions={googleAvailable ? [{ id: 'connect', label: kind === 'gmail' ? U.connectGmail : U.connectGoogleCalendar, onPress: () => on.onConnectGoogle(kind), loading: isBusy(`connect:${kind}`) }] : []}
          cols={1}
        />
      );
    }
    const who = i.label ? (kind === 'gmail' ? fillCopy(G5_COPY.gmailConnectedAs, { email: i.label }) : i.label) : '';
    if (i.status === 'needs_reconnect') {
      return (
        <SourceRow
          first={first}
          icon={kind}
          label={name}
          hint={U.lapseHint}
          pill={statusPill(i.status)}
          cols={1}
          actions={[{ id: 'reconnect', label: G5_COPY.accountReconnect, accessibilityLabel: fillCopy(U.reconnectLabel, { what: name }), onPress: () => on.onReconnect(i), loading: isBusy(`reconnect:${i.integrationId}`) }]}
        />
      );
    }
    return (
      <SourceRow
        first={first}
        icon={kind}
        label={name}
        hint={[who, checkedLine(i, now)].filter(Boolean).join(' · ')}
        pill={statusPill(i.status)}
        note={notes[i.integrationId]}
        actions={[
          { id: 'sync', label: U.syncNow, accessibilityLabel: fillCopy(U.syncNowLabel, { what: name }), variant: 'ghost', onPress: () => on.onSyncNow(i), loading: isBusy(`sync:${i.integrationId}`) },
          { id: 'disconnect', label: G5_COPY.accountDisconnect, accessibilityLabel: fillCopy(U.disconnectLabel, { what: name }), variant: 'ghost', onPress: () => on.onDisconnect(i) },
        ]}
      />
    );
  };

  const phone = find('deviceCalendar');
  const links = integrations.filter((i) => i.kind === 'ics' && live(i));

  return (
    <View style={{ gap: tokens.spacing.xl }}>
      <Section title={U.sectionEmail}>{google('gmail', true)}</Section>
      <Section title={U.sectionCalendars}>
        {google('googleCalendar', true)}
        {phone ? (
          <SourceRow
            icon="deviceCalendar"
            label={U.phoneCalendar}
            hint={[phone.label, phoneSupported ? U.phoneHint : U.phoneWebHint].filter(Boolean).join(' · ')}
            pill={statusPill(phone.status)}
            note={notes[phone.integrationId]}
            actions={[
              ...(phoneSupported ? [{ id: 'choose', label: U.chooseCalendars, variant: 'ghost' as const, onPress: on.onAddPhone, loading: isBusy('phone') }] : []),
              { id: 'disconnect', label: G5_COPY.accountDisconnect, accessibilityLabel: fillCopy(U.disconnectLabel, { what: U.phoneCalendar }), variant: 'ghost', onPress: () => on.onDisconnect(phone) },
            ]}
          />
        ) : (
          <SourceRow
            icon="deviceCalendar"
            label={U.phoneCalendar}
            hint={phoneSupported ? U.notConnected : U.phoneWebHint}
            pill={{ text: U.off, tone: 'muted' }}
            note={notes.deviceCalendar}
            cols={1}
            actions={phoneSupported ? [{ id: 'add', label: U.connectPhone, onPress: on.onAddPhone, loading: isBusy('phone') }] : []}
          />
        )}
      </Section>
      <Section
        title={U.sectionLinks}
        foot={
          <View style={{ gap: tokens.spacing.md, marginTop: tokens.spacing.sm }}>
            <Button label={G5_COPY.accountAddIcs} variant="secondary" onPress={on.onAddIcs} style={{ alignSelf: 'stretch' }} />
            <LockNote text={G5_COPY.accountsFoot} />
          </View>
        }
      >
        {links.length === 0 ? (
          <Text color="muted" style={{ paddingVertical: tokens.spacing.md }}>
            {notes.ics ?? U.noLinks}
          </Text>
        ) : (
          links.map((i, n) => {
            const name = kindName(i);
            const failing = i.status === 'error';
            return (
              <SourceRow
                key={i.integrationId}
                first={n === 0}
                icon="ics"
                label={name}
                hint={[i.host, checkedLine(i, now)].filter(Boolean).join(' · ')}
                pill={statusPill(i.status)}
                note={notes[i.integrationId]}
                actions={[
                  ...(failing ? [{ id: 'retry', label: U.tryAgain, accessibilityLabel: fillCopy(U.tryAgainLabel, { what: name }), variant: 'ghost' as const, onPress: () => on.onSyncNow(i), loading: isBusy(`sync:${i.integrationId}`) }] : []),
                  { id: 'remove', label: U.remove, accessibilityLabel: fillCopy(U.removeLabel, { what: name }), variant: 'ghost', onPress: () => on.onDisconnect(i) },
                ]}
                cols={failing ? 2 : 1}
              />
            );
          })
        )}
      </Section>
    </View>
  );
}
