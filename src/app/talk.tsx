// mega://talk — full-screen push-to-talk (PLAN "Talk mode"). Opens already listening.
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import type { SpokenMention } from '@shared/domain/messages';
import type { VoiceState } from '@/services/voice';
import { voice } from '@/services/voice';
import { useSendMessage } from '@/data/useChat';
import { useViewer } from '@/data/useViewer';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { megaInfo } from '@/features/shell/megaInfo';
import { TalkContent } from '@/features/talk/TalkContent';

export default function TalkRoute() {
  const viewer = useViewer();
  const sendMessage = useSendMessage();
  const [state, setState] = useState<VoiceState>('listening');
  const [liveCaption, setLiveCaption] = useState('');
  const [reply, setReply] = useState('');
  const [mentions, setMentions] = useState<SpokenMention[]>([]);

  useEffect(() => {
    voice.startListening();
    return () => voice.cancel();
  }, []);

  const onHoldStart = useCallback(() => {
    setState('listening');
    voice.startListening();
  }, []);

  const onHoldEnd = useCallback(async () => {
    setState('thinking');
    const { text, mentions: heard } = await voice.stopListening();
    setMentions(heard);
    if (!text) {
      setState('idle');
      return;
    }
    setLiveCaption(text);
    const result = await sendMessage({ text, via: 'voice', mentions: heard.map((m) => m.megaId) });
    setState('speaking');
    setReply(`Sent · ${result.streamId.slice(0, 6)}`);
  }, [sendMessage]);

  if (viewer === undefined) return <LoadingScreen label="Opening talk mode…" />;
  if (!viewer?.mega) return <LoadingScreen label="No MEGA yet" />;

  return (
    <TalkContent
      mega={megaInfo(viewer.mega)}
      state={state}
      liveCaption={liveCaption}
      reply={reply}
      mentions={mentions}
      onHoldStart={onHoldStart}
      onHoldEnd={onHoldEnd}
      onClose={() => router.back()}
    />
  );
}
