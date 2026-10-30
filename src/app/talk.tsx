import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { SpokenMention } from '@shared/domain/messages';
import { router } from '@/features/shell/navigation';
import { useAnswerBlock, useChatThread, useSendMessage, useStreamBody } from '@/data/useChat';
import { useUploadAndTranscribe } from '@/data/useTalk';
import { errorCopyFor, streamStatusCopy } from '@/data/errorCopy';
import { useViewer } from '@/data/useViewer';
import { useVoiceService, VOICE_UNSUPPORTED_MESSAGE } from '@/services/voice';
import { speaker } from '@/services/speaker';
import { hasSeenTalkIntroduction, rememberTalkIntroduction } from '@/services/talkIntroduction';
import { turnEnd, turnStart } from '@/services/talkFeedback';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Screen } from '@/ui/Screen';
import { ModalSheet } from '@/ui/ModalSheet';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { megaInfo } from '@/features/shell/megaInfo';
import { TalkContent } from '@/features/talk/TalkContent';
import { initialTalkState, talkReducer } from '@/features/talk/talkMachine';
import { mapVoiceBlockAnswer } from '@/features/talk/blockVoiceAnswer';

export default function TalkRoute() {
  const viewer = useViewer();
  const thread = useChatThread();
  const sendMessage = useSendMessage();
  const answerBlock = useAnswerBlock();
  const uploadAndTranscribe = useUploadAndTranscribe();
  const voice = useVoiceService();
  const [state, dispatch] = useReducer(talkReducer, initialTalkState);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [introduction, setIntroduction] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  const stream = useStreamBody(streamId);
  const generation = useRef(0);
  const recording = useRef(false);
  const starting = useRef<Promise<void> | null>(null);
  const playedStream = useRef<string | null>(null);
  const awaitingBlock = useRef<Set<string> | null>(null);

  const latestUnansweredBlock = useMemo(() => {
    const latest = thread.results[0];
    return latest?.author.kind === 'mega' && latest.body.type === 'block' && !latest.body.answeredWith
      ? { messageId: latest._id, block: latest.body.block } : null;
  }, [thread.results]);

  const cancel = useCallback(() => {
    generation.current++;
    recording.current = false;
    awaitingBlock.current = null;
    void voice.cancel();
    speaker.stop();
    setPlaying(false);
    setStreamId(null);
    dispatch({ type: 'cancel' });
  }, [voice]);

  useEffect(() => {
    const lifecycle = generation;
    let active = true;
    void hasSeenTalkIntroduction().then(seen => { if (active) { setIntroduction(!seen); setIntroReady(true); } });
    const subscription = AppState.addEventListener('change', next => { if (next !== 'active') cancel(); });
    return () => { active = false; subscription.remove(); lifecycle.current++; recording.current = false; void voice.cancel(); speaker.stop(); };
  }, [cancel, voice]);

  const playReply = useCallback((text: string) => {
    const current = generation.current;
    dispatch({ type: 'replyChunk', text });
    speaker.speak(text, {
      onStart: () => { if (current === generation.current) setPlaying(true); },
      onDone: () => { if (current === generation.current) { setPlaying(false); dispatch({ type: 'replyDone' }); } },
      onError: () => { if (current === generation.current) { setPlaying(false); dispatch({ type: 'replyFailed', error: 'Audio could not play. You can read the reply below and try again.' }); } },
    });
  }, []);

  useEffect(() => {
    if (!stream || !streamId || state.phase !== 'speaking' || playedStream.current === streamId) return;
    if (stream.status === 'error' || stream.status === 'timeout') {
      playedStream.current = streamId;
      dispatch({ type: 'replyFailed', error: streamStatusCopy(stream.status) });
    } else if (stream.status === 'done') {
      playedStream.current = streamId;
      playReply(stream.text);
    } else dispatch({ type: 'replyChunk', text: stream.text });
  }, [stream, streamId, state.phase, playReply]);

  // Block answers have no stream id. Read their new reply from the existing live thread instead.
  useEffect(() => {
    if (!awaitingBlock.current || state.phase !== 'speaking') return;
    const reply = thread.results.find(message => !awaitingBlock.current!.has(message._id) && message.author.kind === 'mega' && (message.body.type === 'text' || message.body.type === 'notice') && !!message.body.text.trim());
    if (reply && (reply.body.type === 'text' || reply.body.type === 'notice')) {
      awaitingBlock.current = null;
      playReply(reply.body.text);
    }
  }, [thread.results, state.phase, playReply]);

  useEffect(() => {
    if (state.phase !== 'speaking' || playing) return;
    const timer = setTimeout(() => {
      awaitingBlock.current = null;
      speaker.stop();
      dispatch({ type: 'replyFailed', error: 'The reply is taking longer than expected. Check Chat or try again.' });
    }, 60_000);
    return () => clearTimeout(timer);
  }, [state.phase, playing]);

  const sendTranscript = async (text: string, mentions: SpokenMention[], current: number) => {
    dispatch({ type: 'send' });
    try {
      const answer = latestUnansweredBlock && mapVoiceBlockAnswer(latestUnansweredBlock.block, text);
      if (latestUnansweredBlock && answer) {
        awaitingBlock.current = new Set(thread.results.map(message => message._id));
        await answerBlock(latestUnansweredBlock.messageId, answer, 'voice');
      } else {
        const result = await sendMessage({ text, via: 'voice', mentions: mentions.map(mention => mention.megaId) });
        if (current !== generation.current) return;
        setStreamId(result.streamId);
      }
      if (current === generation.current) dispatch({ type: 'sent' });
    } catch (error) {
      if (current === generation.current) { awaitingBlock.current = null; dispatch({ type: 'sendFailed', error: errorCopyFor(error) }); }
    }
  };

  const onHoldStart = () => {
    if (!introReady || introduction || recording.current || (state.phase !== 'idle' && state.phase !== 'speaking')) return;
    const current = ++generation.current;
    speaker.stop(); setPlaying(false); setStreamId(null); awaitingBlock.current = null;
    recording.current = true;
    dispatch({ type: 'holdStart' });
    starting.current = voice.start().then(() => { if (current === generation.current) turnStart(); }).catch(error => {
      if (current !== generation.current) return;
      recording.current = false;
      dispatch({ type: 'transcribeFailed', error: error instanceof Error && error.message === VOICE_UNSUPPORTED_MESSAGE ? error.message : 'Microphone could not start. Allow microphone access in Settings and try again.' });
    });
  };

  const onRelease = async () => {
    if (!recording.current) return;
    recording.current = false;
    const current = generation.current;
    dispatch({ type: 'release' });
    try {
      await starting.current;
      if (current !== generation.current) return;
      const clip = await voice.stop(); turnEnd();
      if (current !== generation.current) return;
      if (!clip) { dispatch({ type: 'transcribeFailed', error: 'Hold the button while you speak, then release.' }); return; }
      const { text, mentions } = await uploadAndTranscribe(clip.uri, clip.mimeType);
      if (current !== generation.current) return;
      if (!text.trim()) { dispatch({ type: 'transcribeFailed', error: 'I didn’t catch that. Hold to try again.' }); return; }
      dispatch({ type: 'transcribed', text, mentions });
      await sendTranscript(text, mentions, current);
    } catch (error) { if (current === generation.current) dispatch({ type: 'transcribeFailed', error: errorCopyFor(error) }); }
  };

  const closeIntro = () => { setIntroduction(false); void rememberTalkIntroduction(); };
  if (!viewer?.mega) return <LoadingScreen label="Opening talk mode…" />;
  return <Screen padded={false}>
    <TalkContent mega={megaInfo(viewer.mega)} phase={state.phase} caption={state.caption} mentions={state.mentions} reply={state.reply} error={state.error} playing={playing}
      onHoldStart={onHoldStart} onSlideLock={() => dispatch({ type: 'lock' })} onRelease={() => void onRelease()} onCancel={cancel}
      onRemoveMention={index => dispatch({ type: 'removeMention', index })} onSend={() => void sendTranscript(state.caption, state.mentions, generation.current)}
      onHelp={() => setIntroduction(true)} onClose={() => { cancel(); router.back(); }} />
    <ModalSheet open={introduction} title="Talk like a walkie-talkie" closeLabel="Close talk instructions" onClose={closeIntro}>
      <Text>Hold the microphone while you speak. Release it to send your words and hear MEGA’s reply.</Text>
      <Text>Slide up while holding to keep recording hands-free, then tap to send. Hold again to interrupt a reply.</Text>
      <Text>Your last words and MEGA’s reply stay here. The conversation also appears in Chat.</Text>
      <Button label="Got it" onPress={closeIntro} />
    </ModalSheet>
  </Screen>;
}
