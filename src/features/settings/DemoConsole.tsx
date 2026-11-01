import { connectGoogle } from '@/services/googleConnect';
import { AnimationPreviews } from './AnimationPreviews';
import { megaInfo } from '@/features/shell/megaInfo';
import { DemoRecordingPanel } from './DemoRecordingPanel';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { TabBar } from '@/ui/TabBar';
import { DEMO_SCENARIO as C, DEMO_CONSOLE_TABS } from '@shared/config/demo';
import { useDemoConsole } from '@/data/useDemoConsole';
import { useDemoProfile } from '@/data/useDemoProfile';
import { useViewer } from '@/data/useViewer';
import { useMutation } from 'convex/react';
import { api } from '@/data/api';
import { clearQueryMemory } from '@/data/queryMemory';
import { errorCopyFor } from '@/data/errorCopy';
import { router, resetNavigationGuard } from '@/features/shell/navigation';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ModalSheet } from '@/ui/ModalSheet';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export function DemoConsole() {
  const actions = useDemoConsole(); const { profile, switchProfile, switchTester, testInvite } = useDemoProfile();
  const createInvite = useMutation(api.invites.create); const viewer = useViewer(); const t = useTokens();
  const [tab, setTab] = useState<(typeof DEMO_CONSOLE_TABS)[number]['id']>('people');
  const [cleanupReport, setCleanupReport] = useState('');
  const [busy, setBusy] = useState(false); const lock = useRef(false); const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; action: () => Promise<unknown>; navigate?: boolean } | null>(null);
  const run = async (fn: () => Promise<unknown>, navigate = false) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await fn(); setConfirm(null); if (navigate) { clearQueryMemory(); resetNavigationGuard(); router.toTab('/chat'); } }
    catch(e) { setError(errorCopyFor(e, { validationDetails: true })); } finally { lock.current = false; setBusy(false); }
  };
  if (!viewer) return null;
  const state = actions.state;
  const data = state.status === 'ok' ? state.data : null;
  const restart = (mode: 'story' | 'onboarding') => setConfirm({ title: mode === 'story' ? 'Restart story?' : 'Restart onboarding?', label: 'Restart',
    body: mode === 'story' ? 'Remove this run’s tracked MEGA plans and start new email stages. Keep family members, conversations, account connections and permissions. Sent test emails remain in Gmail for auditing.' : 'Start a new isolated family with the real onboarding conversation. The old family stays saved, but connections are not copied. Google consent must be completed again.',
    action: () => data ? actions.reset({ runId: data.runId, mode }) : actions.start({ expectedMemberId: viewer.member._id }), navigate: mode === 'onboarding' });
  return <View style={{ flex: 1 }}>
    <TabBar tabs={DEMO_CONSOLE_TABS} value={tab} onChange={setTab} disabled={busy} />
    <ScrollView key={tab} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
    {tab === 'animations' ? viewer.mega ? <AnimationPreviews mega={megaInfo(viewer.mega)} /> : <Text>Create your MEGA to preview its animations.</Text> : null}
    {tab === 'logs' ? <DemoRecordingPanel /> : null}
    {state.status === 'error' ? <Text accessibilityRole="alert">{errorCopyFor(state.error)}</Text> : null}
    {state.status === 'loading' ? <Text>Loading demo…</Text> : null}
    {['people', 'emails', 'reset'].includes(tab) && !data ? <><Button label="Start onboarding demo" disabled={busy} onPress={() => restart('onboarding')} />
      {profile?.canResume ? <Button label="Resume demo" disabled={busy} onPress={() => void run(() => switchProfile({ mode: 'resume', expectedMemberId: viewer.member._id }), true)} /> : null}</> : data ? <>
      {tab === 'people' ? <>
      <Card><Text variant="label">{data.key} · {data.date}</Text><Text color="muted">{data.workerReady ? `Email runner ready · ${data.sender}` : 'Email runner offline. On the demo computer, run npm run demo:runner.'}</Text>
        <Text color="muted">Introduce yourself in Chat, then create your partner and daughter conversationally. Or use the rehearsal shortcut below; invitations and acceptance remain real.</Text>
        <Button label="Prepare rehearsal family" variant="secondary" disabled={busy} onPress={() => setConfirm({ title: 'Prepare rehearsal family?', body: 'Keep existing family members and add missing rehearsal profiles. The partner gets a proposed brief; the daughter is 16 with teen protections. This does not accept invitations or connect accounts.', label: 'Prepare', action: () => actions.prepare({ runId: data.runId }) })} />
      </Card>
      {data.personas.map(p => <Card key={p.key}><Text variant="label">{C.personas.find(x => x.key === p.key)?.label} · {p.name}</Text><Text color="muted">{p.email}</Text>
        <Text>{p.memberId ? p.joined ? 'Joined' : 'Invitation needed' : 'Create in Chat or prepare rehearsal'}</Text>
        <Text color="muted">Gmail {p.gmail ? '✓' : '—'} · Calendar {p.calendar ? '✓' : '—'} · Push {p.push ? '✓' : '—'}</Text>
        <Text color="muted">Recognition {p.recognition ? '✓' : '—'} · Auto capture {p.autoCapture ? '✓' : '—'} · Google writes {p.writes ? '✓' : '—'} · Availability sharing {p.sharesAvailability ? '✓' : '—'}</Text>
        <Text color="muted">Cleanup permission · {p.cleanupReady ? 'Ready' : 'Approval needed'}</Text>
        {p.memberId ? <Button label={p.cleanupReady ? `Review ${p.name}’s Google permissions` : `Authorize ${p.email}`} variant="secondary" disabled={busy} onPress={() => setConfirm({ title: `Authorize ${p.email}?`, body: `Choose ${p.email} in Google. This grants Gmail, Calendar and demo cleanup permissions for ${p.name} without switching your MEGA profile. Nothing is deleted by authorizing.`, label: 'Continue to Google', action: async () => {
          const result = await connectGoogle(['gmail', 'googleCalendar'], {
            googleStart: () => actions.authorizeStart({ runId: data.runId, persona: p.key }),
            googleConnectCode: async ({ serverAuthCode }) => actions.authorizeCode({ runId: data.runId, persona: p.key, serverAuthCode }),
          }, true, true);
          if (result === 'failed') throw new Error('Google authorization did not finish.');
        } })} /> : null}
        {p.key === 'daughter' ? <Text color="muted">Demo parent code: {C.daughterParentCode}. Before {p.name} connects, approve teen account connections in her Family profile. {p.name} then consents to Google and chooses her own sharing.</Text> : null}
        {p.memberId && p.memberId !== viewer.member._id ? <Button label={p.joined ? `Switch to ${p.name}` : `Open ${p.name}’s invitation`} variant="secondary" disabled={busy} onPress={() => void run(async () => {
          if (p.joined) await switchTester({ expectedMemberId: viewer.member._id, memberId: p.memberId! });
          else { const invite = await createInvite({ memberId: p.memberId! }); await testInvite({ token: invite.url, expectedMemberId: viewer.member._id }); }
        }, p.joined)} /> : null}
        {p.memberId ? <Button label={`Open ${p.name}’s profile`} variant="ghost" disabled={busy} onPress={() => router.push(`/family/${p.memberId}` as never)} /> : null}
      </Card>)}
      <Button label="My connected accounts" variant="secondary" onPress={() => router.push('/accounts')} />
      </> : null}
      {tab === 'emails' ? <>
      <Text color="muted">Preview and send scenario emails. Only the configured test mailboxes receive them.</Text>
      <Text color="muted">{data.workerReady ? 'Email runner ready' : 'Email runner offline. Start it on the demo computer.'}</Text>
      {data.stages.map(s => <Card key={s.key}><Text variant="label">{s.title}</Text><Text>{s.status} · Email received {s.received ? '✓' : '—'} · Plans {s.plans} · Calendar entries {s.events}</Text>
        {s.error ? <Text accessibilityRole="alert">{s.error}</Text> : null}
        {s.status === 'uncertain' ? <Button label="Resolve uncertain attempt" disabled={busy} onPress={() => setConfirm({ title: 'Have you checked Gmail?', body: 'Inspect the exact run and stage subject in Gmail first. This closes the uncertain attempt without sending anything. Restart the story to ignore any late delivery.', label: 'Close attempt without resending', action: () => actions.abandon({ runId: data.runId, stage: s.key, expectedAttempt: s.attempt }) })} /> : null}
        <Button label={s.attempt ? 'Preview and send again' : 'Preview email'} disabled={busy || !data.workerReady || ['queued','sending','uncertain'].includes(s.status)} onPress={() => setConfirm({ title: s.title, body: `To: ${s.recipient}\n${s.cc.length ? `Cc: ${s.cc.join(', ')}\n` : ''}Subject: ${s.subject}\n\n${s.body}`, label: s.attempt ? 'Send another test email' : 'Send test email', action: () => actions.trigger({ runId: data.runId, stage: s.key, expectedAttempt: s.attempt }) })} />
      </Card>)}
      <Card><Text variant="label">Present through the real app</Text><Text color="muted">{data.personas.find(p => p.key === 'mom')?.name} reviews her brief and chooses a call time. {data.personas.find(p => p.key === 'daughter')?.name} asks her MEGA to share the pickup change and request help from {data.personas.find(p => p.key === 'dad')?.name}. The parent accepts in Chat. Availability is not an agreement to help.</Text></Card>
      </> : null}
      {tab === 'reset' ? <>
      <Text color="muted">Clear test data or restart the demo. Google permissions are managed in People.</Text>
      <Button label="Clear MEGA_TEST emails & events" variant="secondary" disabled={busy} onPress={() => setConfirm({ title: 'Clear test emails and events?', body: 'Across all three connected test accounts: move MEGA_TEST emails to Trash (including Sent and Spam), delete MEGA_TEST events from primary calendars and calendar holds/drafts tracked by this family’s demo runs. Unrelated data stays. Queued emails are cancelled. Authorize all three accounts in the People tab first.', label: 'Clear test data', action: async () => setCleanupReport(await actions.clearGoogle({ runId: data.runId })) })} />
      {cleanupReport ? <Text accessibilityLiveRegion="polite">{cleanupReport}</Text> : null}
      <Button label="Cleanup Google artifacts" variant="secondary" disabled={busy} onPress={() => setConfirm({ title: 'Remove this run’s Google artifacts?', body: 'Delete only the exact Google calendar holds and Gmail reply drafts recorded by this run. Sent scenario emails remain in Gmail. No other calendar events or email are removed.', label: 'Clean up', action: () => actions.cleanup({ runId: data.runId }) })} />
      <Button label="Restart story · keep connections" variant="secondary" disabled={busy} onPress={() => restart('story')} />
      <Button label="Restart full onboarding" variant="secondary" disabled={busy} onPress={() => restart('onboarding')} />
      </> : null}
    </> : null}
    {tab === 'people' && profile?.active ? <Button label="Return to my original family" variant="ghost" disabled={busy} onPress={() => void run(() => switchProfile({ mode: 'return', expectedMemberId: viewer.member._id }), true)} /> : null}
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    </ScrollView>
    <ModalSheet open={!!confirm} title={confirm?.title ?? ''} onClose={() => { if (!busy) setConfirm(null); }} closeLabel="Cancel">
      <Text>{confirm?.body}</Text>{error ? <Text accessibilityRole="alert">{error}</Text> : null}
      <Button label={confirm?.label ?? 'Continue'} loading={busy} onPress={() => { if (confirm) void run(confirm.action, confirm.navigate); }} />
    </ModalSheet>
  </View>;
}
