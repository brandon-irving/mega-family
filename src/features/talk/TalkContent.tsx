// Talk mode (PLAN "Talk mode"): a full-screen walkie-talkie. Hold to talk, release to send; words
// appear live while held, the reply shows as large captions. Recording/transcription is stubbed
// behind src/services/voice.ts until expo-audio and talk.transcribe land.
import { Pressable, View } from 'react-native';
import type { SpokenMention } from '@shared/domain/messages';
import type { VoiceState } from '@/services/voice';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { MegaInfo } from '@/features/shell/megaInfo';

export type TalkContentProps = {
  mega: MegaInfo;
  state: VoiceState;
  liveCaption: string;
  reply: string;
  mentions: SpokenMention[];
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onClose: () => void;
};

const STATE_LABEL: Record<VoiceState, string> = { idle: 'Hold to talk', listening: 'Listening…', thinking: 'Thinking…', speaking: '' };

export function TalkContent({ mega, state, liveCaption, reply, mentions, onHoldStart, onHoldEnd, onClose }: TalkContentProps) {
  const tokens = useTokens();
  const face = state === 'listening' ? 'open' : state === 'thinking' ? 'calm' : mega.face;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg, alignItems: 'center', justifyContent: 'space-between', paddingVertical: tokens.spacing.xxl }}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close talk mode" style={{ alignSelf: 'flex-end', marginRight: tokens.spacing.lg, padding: tokens.spacing.sm }}>
        <Text variant="title">✕</Text>
      </Pressable>

      <View style={{ alignItems: 'center', gap: tokens.spacing.lg, flex: 1, justifyContent: 'center' }}>
        <MegaSprite hex={mega.hex} sticker={mega.sticker} face={face} scale={7} accessibilityLabel={`${mega.name}, ${state}`} />
        <Text variant="headline" color="muted">
          {reply || liveCaption || STATE_LABEL[state]}
        </Text>
        {mentions.length > 0 && (
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
            {mentions.map((m, i) => (
              <Text key={i} variant="label" color="accent">
                @{m.heard}
              </Text>
            ))}
          </View>
        )}
      </View>

      <Pressable
        onPressIn={onHoldStart}
        onPressOut={onHoldEnd}
        accessibilityRole="button"
        accessibilityLabel={state === 'listening' ? 'Release to send' : 'Hold to talk'}
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: state === 'listening' ? tokens.accent : tokens.surface,
          borderWidth: 2,
          borderColor: tokens.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="title" style={state === 'listening' ? { color: tokens.onAccent } : undefined}>
          🎙
        </Text>
      </Pressable>
    </View>
  );
}
