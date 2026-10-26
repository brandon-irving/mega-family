// mega://talk — full-screen push-to-talk (PLAN "Talk mode"). Opens already listening. Owns the state
// machine (features/talk/talkMachine), the recorder/speaker services and the chat.send/answerBlock
// calls; TalkContent itself is pure presentation.
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { router } from 'expo-router';
import { useAnswerBlock, useChatThread, useSendMessage, useStreamBody } from '@/data/useChat';
import { useUploadAndTranscribe } from '@/data/useTalk';
import { errorCopyFor, streamStatusCopy } from '@/data/errorCopy';
import { useViewer } from '@/data/useViewer';
import { useVoiceService } from '@/services/voice';
import { speaker } from '@/services/speaker';
import { turnEnd, turnStart } from '@/services/talkFeedback';
import { LoadingScreen } from '@/ui/LoadingScreen';
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
  const stream = useStreamBody(streamId);

  // "If the latest MEGA message is an unanswered block, the transcript is sent as the block's answer"
  // (G2 scope). `chat.thread` pages come back newest-first (CONTRACT §4), so index 0 is the latest.
  const latestUnansweredBlock = useMemo(() => {
    const latest = thread.results[0];
    if (latest?.author.kind === 'mega' && latest.body.type === 'block' && !latest.body.answeredWith) {
      return { messageId: latest._id, block: latest.body.block };
    }
    return null;
  }, [thread.results]);

  const beginRecording = useCallback(() => {
    turnStart();
    voice.start().catch((e) => dispatch({ type: 'transcribeFailed', error: errorCopyFor(e) }));
  }, [voice]);

  // Opens already listening (PLAN §8 widgets: "mega://talk ... opens already listening") — intentionally
  // mount-only (not re-run when `beginRecording`'s identity changes on every render).
  useEffect(() => {
    beginRecording();
    dispatch({ type: 'holdStart' });
    return () => {
      voice.cancel();
      speaker.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Streams the MEGA's reply as large captions (CONTRACT §4 `chat.streamBody`) while phase is "speaking".
  useEffect(() => {
    if (!stream || state.phase !== 'speaking') return;
    if (stream.status === 'error' || stream.status === 'timeout') {
      dispatch({ type: 'replyFailed', error: streamStatusCopy(stream.status) });
      return;
    }
    dispatch({ type: 'replyChunk', text: stream.text });
    if (stream.status === 'done') {
      speaker.speak(stream.text);
      dispatch({ type: 'replyDone' });
    }
  }, [stream, state.phase]);

  const onHoldStart = useCallback(() => {
    if (state.phase === 'speaking') speaker.stop(); // "pressing while the MEGA talks interrupts it"
    beginRecording();
    dispatch({ type: 'holdStart' });
  }, [state.phase, beginRecording]);

  const onSlideLock = useCallback(() => dispatch({ type: 'lock' }), []);

  const onRelease = useCallback(async () => {
    turnEnd();
    dispatch({ type: 'release' });
    const clip = await voice.stop();
    if (!clip) {
      dispatch({ type: 'transcribeFailed', error: "I didn't catch that." });
      return;
    }
    try {
      const { text, mentions } = await uploadAndTranscribe(clip.uri, clip.mimeType);
      if (!text.trim()) {
        dispatch({ type: 'transcribeFailed', error: "I didn't catch that — try again?" });
        return;
      }
      dispatch({ type: 'transcribed', text, mentions });
    } catch (e) {
      dispatch({ type: 'transcribeFailed', error: errorCopyFor(e) });
    }
  }, [uploadAndTranscribe, voice]);

  const onRemoveMention = useCallback((index: number) => dispatch({ type: 'removeMention', index }), []);

  const onSend = useCallback(async () => {
    dispatch({ type: 'send' });
    try {
      if (latestUnansweredBlock) {
        const answer = mapVoiceBlockAnswer(latestUnansweredBlock.block, state.caption);
        if (answer) {
          await answerBlock(latestUnansweredBlock.messageId, answer, 'voice');
          // chat.answerBlock doesn't return a streamId (CONTRACT §4) — see the G2 report's contract
          // request — so the follow-up reply can't be streamed as captions here; it still lands in the
          // thread normally, and talk mode returns to idle rather than showing an empty "speaking" state.
          dispatch({ type: 'sent' });
          dispatch({ type: 'replyDone' });
          return;
        }
      }
      const result = await sendMessage({ text: state.caption, via: 'voice', mentions: state.mentions.map((m) => m.megaId) });
      setStreamId(result.streamId);
      dispatch({ type: 'sent' });
    } catch (e) {
      dispatch({ type: 'sendFailed', error: errorCopyFor(e) });
    }
  }, [latestUnansweredBlock, state.caption, state.mentions, answerBlock, sendMessage]);

  const onClose = useCallback(() => {
    voice.cancel();
    speaker.stop();
    dispatch({ type: 'cancel' });
    router.back();
  }, [voice]);

  if (viewer === undefined) return <LoadingScreen label="Opening talk mode…" />;
  if (!viewer?.mega) return <LoadingScreen label="No MEGA yet" />;

  return (
    <TalkContent
      mega={megaInfo(viewer.mega)}
      phase={state.phase}
      caption={state.caption}
      mentions={state.mentions}
      reply={state.reply}
      error={state.error}
      onHoldStart={onHoldStart}
      onSlideLock={onSlideLock}
      onRelease={onRelease}
      onRemoveMention={onRemoveMention}
      onSend={onSend}
      onClose={onClose}
    />
  );
}
