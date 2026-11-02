import { useRef, useState } from 'react';
import { Switch, View } from 'react-native';
import { SCHEDULING_COPY as C, GOOGLE_SETUP as U } from '@shared/config/scheduling';
import { availabilitySharingMode } from '@shared/scheduling';
import { useSchedulingPreferences, useSchedulingActions } from '@/data/useScheduling';
import { useAccountActions } from '@/data/useAccounts';
import { connectGoogle } from '@/services/googleConnect';
import { useRunAction } from '@/features/shell/useRunAction';
import { CardFallback } from '@/features/kids/CardFallback';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '@/data/api';

type Preferences = FunctionReturnType<typeof api.scheduling.preferences>;
type Selection = Pick<Preferences, 'enabled' | 'autoCapture' | 'availabilityFor' | 'availabilitySharing'>;

export function SchedulingSettings() {
  const state = useSchedulingPreferences();
  if (state.status !== 'ok') return <CardFallback state={state} from={C.title} />;
  return <SchedulingSetup preferences={state.data} />;
}

export function SchedulingSetup({ preferences: p }: { preferences: Preferences }) {
  const actions = useSchedulingActions();
  const accounts = useAccountActions();
  const { busy, error, run } = useRunAction();
  const lock = useRef(false);
  const [draft, setDraft] = useState<Selection | null>(null);
  const [writes, setWrites] = useState(p.desiredWrites ?? true);
  const [sharingNotice, setSharingNotice] = useState('');
  const [notice, setNotice] = useState('');
  const [sharingMode, setSharingMode] = useState<'private' | 'family' | 'custom' | null>(null);
  const t = useTokens();
  const connected = !!p.gmailConnected && !!p.calendarConnected;
  const selection = draft ?? { enabled: p.configured ? p.enabled : true, autoCapture: p.autoCapture, availabilityFor: p.availabilityFor, availabilitySharing: availabilitySharingMode(p) };
  const mode = sharingMode ?? availabilitySharingMode(selection);
  const needsGoogle = !connected || (writes && (!p.canWriteCalendar || !p.canWriteDraft));
  const change = (patch: Partial<Selection>) => setDraft({ ...selection, ...patch });
  const chooseSharing = async (availabilityFor: Selection['availabilityFor'], nextMode: 'private' | 'family' | 'custom') => {
    if (lock.current) return;
    if (!p.configured) {
      setSharingMode(nextMode);
      change({ availabilityFor, availabilitySharing: nextMode });
      setSharingNotice('Not saved yet. Continue below to save your setup choices.');
      return;
    }
    lock.current = true;
    setSharingNotice('');
    const saved = await run('sharing', () => actions.setSharing({ availabilityFor, availabilitySharing: nextMode }));
    if (saved) {
      // Preserve unsaved recognition/write choices without freezing their old sharing value.
      setDraft(current => current ? { ...current, availabilityFor, availabilitySharing: nextMode } : null);
      setSharingMode(nextMode === 'custom' ? 'custom' : null);
      setSharingNotice('Sharing saved.');
    }
    lock.current = false;
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setNotice('');
    await run('setup', async () => {
      // Save the explicitly reviewed choices before redirecting on web. They grant no Google access.
      await actions.setPreferences({ ...selection, desiredWrites: writes });
      setDraft(selection);
      setSharingNotice('Sharing saved.');
      if (needsGoogle) {
        const result = await connectGoogle(['gmail', 'googleCalendar'], accounts, writes);
        if (result === 'failed') throw new Error('Google could not finish connecting. Your setup choices are saved; try connecting again.');
        if (result === 'cancelled') { setNotice('Google connection cancelled. Your setup choices are saved; no new access was granted.'); return; }
        if (result === 'redirecting') return;
        setNotice('Google returned. Check the connection status below; any permissions you declined remain off.');
      } else setNotice('Your setup is saved.');
    });
    lock.current = false;
  };
  return <View style={{ gap: t.spacing.lg }}>
    <View style={{ gap: t.spacing.sm }}><Text variant="title">{U.title}</Text><Text color="muted">{U.intro}</Text></View>
    <Card><Text variant="label">Your Google connection</Text>
      <Text color="muted">Gmail · {p.gmailConnected ? 'Connected' : 'Not connected'}{ '\n' }Calendar · {p.calendarConnected ? 'Connected' : 'Not connected'}</Text>
      <Text variant="caption" color="muted">{p.canWriteCalendar ? 'Calendar holds enabled' : 'Calendar holds not enabled'} · {p.canWriteDraft ? 'Reply drafts enabled' : 'Reply drafts not enabled'}</Text>
      <Text variant="caption" color="muted">{p.detection === 'push' ? 'New email detection is active.' : p.detection === 'polling' ? 'Checking email periodically.' : 'Connect to start finding plans in your email.'}</Text>
    </Card>
    <Card>
      <SettingSwitch title={C.enable} detail={C.enableDetail} value={selection.enabled} disabled={!!busy} onChange={enabled => change({ enabled })} />
      <SettingSwitch title={C.autoCapture} detail={C.autoCaptureDetail} value={selection.autoCapture} disabled={!!busy || !selection.enabled} onChange={autoCapture => change({ autoCapture })} />
      <SettingSwitch title={U.writes} detail={U.writesDetail} value={writes} disabled={!!busy} onChange={setWrites} />
      {(p.canWriteCalendar || p.canWriteDraft) && !writes ? <Text variant="caption" color="muted">Existing Google permissions remain granted. Disconnect Google in Connected accounts to revoke access.</Text> : null}
    </Card>
    <View style={{ gap: t.spacing.sm }}><Text variant="label">What can your family see?</Text>
      {U.sharing.map(preset => <Card key={preset.key}>
        <Button label={`${mode === preset.key ? 'Selected · ' : ''}${preset.title}`} variant={mode === preset.key ? 'primary' : 'secondary'} disabled={!!busy || (preset.key === 'custom' && p.people.length === 0)} onPress={() => { if (preset.key === 'custom') setSharingMode('custom'); else void chooseSharing(preset.key === 'family' ? p.people.map(person => person.id) : [], preset.key); }} />
        <Text color="muted">{preset.detail}</Text>
      </Card>)}
      {!p.people.length ? <Text color="muted">{U.noSharingRecipients}</Text> : null}
      {sharingNotice ? <Text accessibilityLiveRegion="polite">{sharingNotice}</Text> : null}
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      {mode === 'family' ? <Text color="muted">{p.people.length ? `Share availability with: ${p.people.map(person => person.name).join(', ')}. ${U.familyFuture}` : U.familyEmpty}</Text> : null}
      {mode === 'custom' ? <Card>{p.people.map(person => <SettingSwitch key={person.id} title={person.name} detail={person.sharesWithMe ? 'They also share availability with you.' : 'This only changes what you share.'} disabled={!!busy} value={selection.availabilityFor.includes(person.id)} onChange={on => void chooseSharing(on ? [...selection.availabilityFor, person.id] : selection.availabilityFor.filter(id => id !== person.id), 'custom')} />)}</Card> : null}
    </View>
    <Text color="muted">{needsGoogle ? 'Next, Google will ask for Gmail and Calendar access together. You choose which permissions to grant.' : 'Google is already connected for these choices. No sign-in needed.'}</Text>
    <Button label={needsGoogle ? connected ? U.update : U.connect : 'Save choices'} loading={!!busy} disabled={!!busy} onPress={() => void save()} />
    {process.env.EXPO_PUBLIC_DEMO_MODE === 'true' ? <Card><Text variant="label">Demo cleanup permission</Text><Text color="muted">Authorize moving MEGA_TEST emails to Trash and deleting test calendar events from this account. This grants Gmail modification access; cleanup only runs when confirmed in the admin Demo Console.</Text><Button label="Authorize demo cleanup" variant="secondary" disabled={!!busy} onPress={() => void run('cleanup-permission', async () => {
      const result = await connectGoogle(['gmail', 'googleCalendar'], accounts, true, true);
      setNotice(result === 'connected' ? 'Google returned. The admin can now try demo cleanup.' : result === 'redirecting' ? '' : 'Cleanup authorization was not completed.');
    })} /></Card> : null}
    {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
  </View>;
}

function SettingSwitch({ title, detail, value, disabled, onChange }: { title: string; detail: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  const t = useTokens();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.sm }}>
    <View style={{ flex: 1, gap: t.spacing.xs }}><Text variant="label">{title}</Text><Text variant="caption" color="muted">{detail}</Text></View>
    <Switch accessibilityLabel={title} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: t.accent }} />
  </View>;
}
