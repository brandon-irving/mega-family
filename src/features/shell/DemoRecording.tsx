import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSegments } from 'expo-router';
import { useDemoProfile } from '@/data/useDemoProfile';
import { useViewer } from '@/data/useViewer';
import { useChatThread } from '@/data/useChat';
import type { RecordingContext } from '@/services/demoRecording/store';
import { demoRecorder } from '@/services/demoRecording';

function ConversationRecording({ context }: { context: RecordingContext }) {
  const thread = useChatThread();
  useEffect(() => {
    demoRecorder.context(context);
    for (const m of thread.results) demoRecorder.message(m.familyId, m._id, { at: m.at, author: m.author, threadId: m.threadId, body: m.body, via: m.via });
    if (thread.status === 'CanLoadMore' && thread.results.length < 5000) thread.loadMore(100);
  }, [thread,context]);
  return null;
}
/** Remains mounted through route and persona transitions, including the invitation screen. */
export function DemoRecording() {
  const { profile } = useDemoProfile();
  const viewer = useViewer();
  const segments = useSegments(); const route = segments.join('/');
  const recording = profile?.recording;
  const runId = recording?.runId, key = recording?.key, familyId = recording?.familyId;
  const memberId = viewer?.member._id;
  const persona = viewer?.member.name || profile?.currentName || 'Invite preview';
  const eligible = !!recording && (viewer ? viewer.family._id === familyId : !!profile?.pendingToken);
  useEffect(() => {
    demoRecorder.context(eligible && runId && key && familyId ? { runId,key,familyId,memberId,persona } : null);
  }, [eligible,runId,key,familyId,memberId,persona]);
  useEffect(() => { demoRecorder.event('screen.view', { route }); }, [route,runId,memberId]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { demoRecorder.event('app.state',{state}); if (state !== 'active') void demoRecorder.flush(); });
    return () => { subscription.remove(); demoRecorder.context(null); void demoRecorder.flush(); };
  }, []);
  return recording && viewer?.family._id === familyId ? <ConversationRecording key={`${runId}:${memberId}`} context={{ ...recording, memberId, persona }} /> : null;
}
