// The onboarding chat's `connect` card (CONTRACT v0.17 §3; canvas Screen 13 OnboardGmail / OnboardCalendar /
// OnboardIcs and Screen 16 ConnectNotSetUp / IcsPaste* / PhoneCalendar*). One card per offer, read live from
// `integrations.offer`, so it follows the server: offered → connected (the connected line), skipped (the skipped
// line), failed (try again). Every variant has Not now, and skipping never blocks (the server posts the next
// card). Google not set up on this deployment → the Gmail card says so with only Not now (never a dead button)
// and the calendar card shows Google Calendar as a dashed "Not set up yet" row. The phone's calendar is iOS and
// Android only (web shows the dashed row with "Open MEGA on your phone…"). Found things land in the owner's
// private layer, which the foot says.
import { useState } from 'react';
import type { OfferView } from '@shared/domain/api';
import { G5_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { ONBOARDING } from '@shared/config/onboarding';
import { useAccountActions, useOffer } from '@/data/useAccounts';
import type { ConnectOffer } from '@/data/useOnboarding';
import { useSkipOffer } from '@/data/useOnboarding';
import { useFamilyNow } from '@/data/useShopping';
import { connectGoogle } from '@/services/googleConnect';
import { openPhoneSettings } from '@/services/phoneCalendar';
import { useRunAction } from '@/features/shell/useRunAction';
import { CardFallback } from '@/features/kids/CardFallback';
import { IconCard, type IconCardStatus } from '@/features/integrations/G4Card';
import type { GlyphName } from '@/features/integrations/glyphs';
import { CardActions, TagList, type CardAction } from '@/ui/ThreadCard';
import { useTokens } from '@/ui/theme';
import { View } from 'react-native';
import { LinkField, OptionRow } from './parts';
import { PhoneCalendarSheet } from './PhoneCalendarSheet';
import { usePhoneCalendarFlow } from './usePhoneCalendarFlow';

/** A schedule link the app will try: https:// or webcal:// (the server re-checks and fetches it). */
export function looksLikeFeedUrl(url: string): boolean {
  return /^(https|webcal):\/\/\S+$/i.test(url.trim());
}

export type ConnectHandlers = {
  onGoogle: () => void;
  onPhone: () => void;
  onOpenSettings: () => void;
  onSkip: () => void;
  onIcsChange: (text: string) => void;
  onIcsSubmit: () => void;
  onIcsAnother: () => void;
  onIcsDone: () => void;
};

export type ConnectLocal = {
  /** Which action is running (`google`, `phone`, `ics`, `skip`). */
  busy?: string | null;
  error?: string | null;
  phoneDenied?: boolean;
  phoneSupported: boolean;
  icsText: string;
  icsError?: string | null;
  /** The link just added this session (title + how many events), until Paste another / Done. */
  icsAdded?: { label: string; events: number } | null;
  icsDone?: boolean;
  /** Paste another: the field opens again on a card that's already connected. */
  icsReopen?: boolean;
};

const FROM: Record<ConnectOffer, string> = { gmail: U.fromGmail, calendar: U.fromCalendar, ics: U.fromIcs };
const ICON: Record<ConnectOffer, GlyphName> = { gmail: 'mail', calendar: 'calendar', ics: 'link' };

export function ConnectCardView({ view, megaName, local, on }: { view: OfferView; megaName: string; local: ConnectLocal; on: ConnectHandlers }) {
  const tokens = useTokens();
  const from = fillCopy(FROM[view.offer], { mega: megaName });
  const google = view.available.google;
  const open = view.state === 'offered' || view.state === 'failed';
  const ok = (text: string): IconCardStatus => ({ text, color: tokens.success });
  const muted = (text: string): IconCardStatus => ({ text, color: tokens.muted });
  const warn = (text: string): IconCardStatus => ({ text, color: tokens.warn });
  const notNow: CardAction = { id: 'skip', label: G5_COPY.notNow, variant: 'ghost', onPress: on.onSkip, loading: local.busy === 'skip', disabled: !!local.busy && local.busy !== 'skip' };
  const failedLine = local.error ?? (view.state === 'failed' ? U.connectFailed : null);

  if (view.offer === 'gmail') {
    if (!google && view.state !== 'connected') {
      return (
        <IconCard from={from} icon="mail" title={U.gmailNotSetUpTitle} body={U.gmailNotSetUpBody} status={view.state === 'skipped' ? muted(G5_COPY.gmailSkipped) : null} testID="connect-card-gmail">
          {open ? <CardActions cols={1} actions={[notNow]} /> : null}
        </IconCard>
      );
    }
    const status =
      view.state === 'connected'
        ? ok(fillCopy(G5_COPY.gmailConnected, { days: ONBOARDING.gmailFirstLookDays }))
        : view.state === 'skipped'
          ? muted(G5_COPY.gmailSkipped)
          : local.busy === 'google'
            ? ok(U.connecting)
            : failedLine
              ? warn(failedLine)
              : null;
    return (
      <IconCard from={from} icon="mail" title={G5_COPY.gmailTitle} body={G5_COPY.gmailBody} status={status} foot={G5_COPY.privateFoot} testID="connect-card-gmail">
        <TagList label={G5_COPY.gmailLooksFor} tags={[...G5_COPY.gmailLooksForItems]} />
        {open ? (
          <CardActions
            actions={[{ id: 'google', label: failedLine ? U.tryAgain : G5_COPY.gmailConnect, onPress: on.onGoogle, loading: local.busy === 'google', disabled: !!local.busy && local.busy !== 'google' }, notNow]}
          />
        ) : null}
      </IconCard>
    );
  }

  if (view.offer === 'calendar') {
    if (local.phoneDenied && open) {
      const actions: CardAction[] = [{ id: 'settings', label: U.openSettings, onPress: on.onOpenSettings }];
      if (google) actions.push({ id: 'google', label: U.useGoogleInstead, variant: 'ghost', onPress: on.onGoogle, loading: local.busy === 'google' });
      actions.push(notNow);
      return (
        <IconCard from={from} icon="calendar" title={U.phoneDeniedTitle} body={G5_COPY.calendarPhoneDenied} testID="connect-card-calendar">
          <CardActions cols={1} actions={actions} />
        </IconCard>
      );
    }
    const google_ = view.integrations.find((i) => i.kind === 'googleCalendar');
    const phone = view.integrations.find((i) => i.kind === 'deviceCalendar');
    const status =
      view.state === 'connected'
        ? google_
          ? ok(fillCopy(G5_COPY.calendarGoogleConnected, { count: google_.countThisMonth }))
          : ok(fillCopy(G5_COPY.calendarPhoneConnected, { count: phone?.countThisMonth ?? 0 }))
        : view.state === 'skipped'
          ? muted(G5_COPY.calendarSkipped)
          : local.busy === 'google'
            ? ok(U.connecting)
            : local.busy === 'phone'
              ? ok(U.choosing)
              : failedLine
                ? warn(failedLine)
                : null;
    return (
      <IconCard from={from} icon="calendar" title={G5_COPY.calendarTitle} body={G5_COPY.calendarBody} status={status} foot={G5_COPY.privateFoot} testID="connect-card-calendar">
        {open ? (
          <>
            <View style={{ gap: tokens.spacing.sm }}>
              <OptionRow icon="calendar" label={G5_COPY.calendarGoogle} sub={google ? U.calendarGoogleSub : U.notSetUpSub} off={!google} onPress={on.onGoogle} loading={local.busy === 'google'} />
              <OptionRow icon="phone" label={G5_COPY.calendarPhone} sub={local.phoneSupported ? U.calendarPhoneSub : G5_COPY.calendarPhoneWebOnly} off={!local.phoneSupported} onPress={on.onPhone} loading={local.busy === 'phone'} />
            </View>
            <CardActions cols={1} actions={[notNow]} />
          </>
        ) : null}
      </IconCard>
    );
  }

  // Schedule links.
  if (local.icsAdded && !local.icsDone) {
    return (
      <IconCard
        from={from}
        icon="link"
        title={fillCopy(G5_COPY.icsAdded, { title: local.icsAdded.label })}
        body={local.icsAdded.events > 0 ? fillCopy(U.icsAddedBody, { count: local.icsAdded.events }) : U.icsAddedBodyNone}
        foot={U.icsFoot}
        testID="connect-card-ics"
      >
        <CardActions
          actions={[
            { id: 'another', label: U.icsPasteAnother, variant: 'ghost', onPress: on.onIcsAnother },
            { id: 'done', label: U.done, onPress: on.onIcsDone },
          ]}
        />
      </IconCard>
    );
  }
  const last = view.integrations.filter((i) => i.kind === 'ics').at(-1);
  const showField = open || !!local.icsReopen;
  const status =
    view.state === 'skipped'
      ? muted(G5_COPY.icsSkipped)
      : view.state === 'connected' && !showField
        ? ok(local.icsDone || !last ? G5_COPY.icsDone : fillCopy(G5_COPY.icsAdded, { title: last.label ?? last.host ?? '' }))
        : null;
  return (
    <IconCard from={from} icon={ICON.ics} title={G5_COPY.icsTitle} body={G5_COPY.icsBody} status={status} foot={G5_COPY.privateFoot} testID="connect-card-ics">
      {showField ? (
        <>
          <LinkField label={U.icsFieldLabel} value={local.icsText} placeholder={G5_COPY.icsPlaceholder} error={local.icsError} onChange={on.onIcsChange} onSubmit={on.onIcsSubmit} testID="ics-field" />
          <CardActions
            cols={1}
            actions={[{ id: 'ics', label: local.busy === 'ics' ? U.icsAdding : U.icsAdd, onPress: on.onIcsSubmit, loading: local.busy === 'ics', disabled: !!local.busy && local.busy !== 'ics' }, ...(view.state === 'connected' ? [] : [notNow])]}
          />
        </>
      ) : null}
    </IconCard>
  );
}

/** The connected card: live offer state + the connect actions. */
export function ConnectCard({ offer, megaName }: { offer: ConnectOffer; megaName: string }) {
  const state = useOffer(offer);
  const actions = useAccountActions();
  const skip = useSkipOffer();
  const now = useFamilyNow();
  const { busy, error, run } = useRunAction();
  const [googleFailed, setGoogleFailed] = useState(false);
  const [icsText, setIcsText] = useState('');
  const [icsError, setIcsError] = useState<string | null>(null);
  const [icsAdded, setIcsAdded] = useState<{ label: string; events: number } | null>(null);
  const [icsDone, setIcsDone] = useState(false);
  const [icsReopen, setIcsReopen] = useState(false);
  const phone = usePhoneCalendarFlow(actions, now);

  if (state.status !== 'ok') return <CardFallback state={state} from={fillCopy(FROM[offer], { mega: megaName })} />;

  const onGoogle = () =>
    void run('google', async () => {
      setGoogleFailed(false);
      const result = await connectGoogle(offer === 'gmail' ? ['gmail'] : ['googleCalendar'], actions);
      if (result === 'failed') setGoogleFailed(true);
    });
  const onIcsSubmit = () => {
    const url = icsText.trim();
    if (!looksLikeFeedUrl(url)) {
      setIcsError(G5_COPY.icsBad);
      return;
    }
    void run('ics', async () => {
      const r = await actions.addIcs({ url });
      if (r.failure || !r.integrationId) {
        setIcsError(G5_COPY.icsBad);
        return;
      }
      setIcsError(null);
      setIcsText('');
      setIcsDone(false);
      setIcsReopen(false);
      setIcsAdded({ label: r.label ?? U.sectionLinks, events: r.events });
    });
  };

  return (
    <>
      <ConnectCardView
        view={state.data}
        megaName={megaName}
        local={{
          busy: busy ?? (phone.stage === 'asking' || phone.stage === 'picking' || phone.stage === 'adding' ? 'phone' : null),
          error: googleFailed ? U.connectFailed : (phone.error ?? error),
          phoneDenied: phone.stage === 'denied',
          phoneSupported: phone.supported,
          icsText,
          icsError,
          icsAdded,
          icsDone,
          icsReopen,
        }}
        on={{
          onGoogle,
          onPhone: () => void phone.start(),
          onOpenSettings: () => void openPhoneSettings(),
          onSkip: () => void run('skip', () => skip(offer)),
          onIcsChange: (t) => {
            setIcsText(t);
            setIcsError(null);
          },
          onIcsSubmit,
          onIcsAnother: () => {
            setIcsAdded(null);
            setIcsDone(false);
            setIcsReopen(true);
          },
          onIcsDone: () => setIcsDone(true),
        }}
      />
      <PhoneCalendarSheet
        open={phone.stage === 'picking' || phone.stage === 'adding'}
        calendars={phone.calendars}
        picks={phone.picks}
        busy={phone.stage === 'adding'}
        onToggle={phone.toggle}
        onAdd={() => void phone.add()}
        onClose={phone.close}
      />
    </>
  );
}
