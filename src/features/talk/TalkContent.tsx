// Talk mode (PLAN "Talk mode", decided Oct 24): a full-screen walkie-talkie. Pure presentational —
// talk.tsx owns the state machine (./talkMachine), the recorder/speaker services and the chat calls;
// this just renders a TalkState and turns raw touches on the mic button into onHoldStart/onSlideLock/
// onRelease. Hold to talk, release to send; slide up to lock for hands-free, tap to send; pressing while
// the MEGA talks interrupts it; ✕ or swipe down to leave.
import { useRef, useState } from 'react';
import { ActivityIndicator, type GestureResponderEvent, Pressable, ScrollView, View } from 'react-native';
import { Glyph } from '@/features/integrations/glyphs';
import { Button } from '@/ui/Button';
import type { SpokenMention } from '@shared/domain/messages';
import { TALK_CONFIG } from '@shared/config/talk';
import { readableOn } from '@shared/config/theme';
import type { TalkPhase } from './talkMachine';
import { MegaSprite } from '@/ui/MegaSprite';
import { CloseButton, useDismiss } from '@/ui/dismiss';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { MegaInfo } from '@/features/shell/megaInfo';

export type TalkContentProps = {
  mega: MegaInfo;
  phase: TalkPhase;
  caption: string;
  mentions: SpokenMention[];
  reply: string;
  error: string | null;
  onHoldStart: () => void;
  onSlideLock: () => void;
  onRelease: () => void;
  onRemoveMention: (index: number) => void;
  onSend: () => void;
  onClose: () => void;
  onCancel?: () => void;
  onHelp?: () => void;
  playing?: boolean;
};

const FACE_BY_PHASE: Record<TalkPhase, 'open' | 'calm' | null> = {
  idle: null,
  recording: 'open',
  locked: 'open',
  transcribing: 'calm',
  review: null,
  sending: 'calm',
  speaking: null,
};

const MIC_LABEL: Record<TalkPhase, string> = {
  idle: 'Hold to talk',
  recording: 'Listening…',
  locked: 'Tap to send',
  transcribing: 'Just a moment…',
  review: 'Tap to send',
  sending: 'Sending…',
  speaking: 'Hold to interrupt',
};

export function TalkContent({ mega, phase, caption, mentions, reply, error, onHoldStart, onSlideLock, onRelease, onRemoveMention, onSend, onClose, onCancel, onHelp, playing = false }: TalkContentProps) {
  const tokens = useTokens();
  // Escape on web closes it (a route modal: the navigator handles Android back).
  useDismiss(onClose, { androidBack: false });
  const face = FACE_BY_PHASE[phase] ?? mega.face;
  const micDisabled = phase === 'transcribing' || phase === 'sending';
  const held = phase === 'recording' || phase === 'locked';

  const startY = useRef<number | null>(null);
  const lockedThisTouch = useRef(false);
  const startedThisTouch = useRef(false);
  const [pressed, setPressed] = useState(false);

  const canStartTouch = () => !micDisabled;

  const onResponderGrant = (e: GestureResponderEvent) => {
    if (micDisabled) return;
    setPressed(true);
    startedThisTouch.current = false;
    lockedThisTouch.current = false;
    if (phase === 'idle' || phase === 'speaking') {
      startedThisTouch.current = true;
      startY.current = e.nativeEvent.pageY;
      lockedThisTouch.current = false;
      onHoldStart();
    }
    // phase === 'locked': this is the "tap to send" touch — nothing to do until release.
    // phase === 'review': this is the "tap to send" touch — nothing to do until release.
  };

  const onResponderMove = (e: GestureResponderEvent) => {
    if (phase !== 'recording' || startY.current === null || lockedThisTouch.current) return;
    const dy = startY.current - e.nativeEvent.pageY;
    if (dy > TALK_CONFIG.lockSlideDistancePx) {
      lockedThisTouch.current = true;
      onSlideLock();
    }
  };

  const onResponderRelease = () => {
    setPressed(false);
    startY.current = null;
    if (startedThisTouch.current && !lockedThisTouch.current) onRelease();
    else if (phase === 'locked' && !lockedThisTouch.current) onRelease(); // tap to send while locked
    else if (phase === 'review') onSend(); // tap the button again to confirm and send
  };

  const micSize = tokens.bigTargets ? 104 : 80;
  const status = phase === 'speaking' ? (playing ? `${mega.name} is speaking` : `${mega.name} is thinking…`) : MIC_LABEL[phase];

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg, alignItems: 'center', paddingVertical: tokens.spacing.md }}>
      <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.spacing.lg }}>
        <Text variant="label" style={{ flex: 1 }}>Talk to {mega.name}</Text>
        <Button label="How to talk" variant="ghost" onPress={onHelp} />
        <CloseButton onPress={onClose} label="Close talk mode" />
      </View>
      <ScrollView keyboardDismissMode="on-drag" style={{ flex: 1, alignSelf: 'stretch' }} contentContainerStyle={{ alignItems: 'center', padding: tokens.spacing.lg, gap: tokens.spacing.lg, flexGrow: 1 }}>
        <MegaSprite hex={mega.hex} sticker={mega.sticker} face={face} scale={2.5} accessibilityLabel={`${mega.name}, ${phase}`} />
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, borderRadius: tokens.radii.pill, padding: tokens.spacing.md, backgroundColor: tokens.surface }}>
          {micDisabled || (phase === 'speaking' && !playing) ? <ActivityIndicator color={tokens.accent} /> : <Glyph name={playing ? 'speaker' : 'mic'} size={22} color={tokens.accent} />}
          <Text variant="label" color="accent">{status}</Text>
        </View>
        {error ? <Text accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</Text> : null}
        {caption ? <View style={{ alignSelf: 'stretch', gap: tokens.spacing.xs }}><Text variant="caption" color="muted">YOU SAID</Text><Text numberOfLines={3}>{caption}</Text></View> : null}
        {reply ? <View style={{ alignSelf: 'stretch', gap: tokens.spacing.xs, padding: tokens.spacing.md, backgroundColor: tokens.surface, borderRadius: tokens.radii.md }}><Text variant="caption" color="accent">{mega.name.toUpperCase()}</Text><Text selectable>{reply}</Text></View> : null}

        {phase === 'review' && mentions.length > 0 && (
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
            {mentions.map((m, i) => (
              <Pressable
                key={`${m.megaId}-${i}`}
                onPress={() => onRemoveMention(i)}
                accessibilityRole="button"
                accessibilityLabel={`Remove @${m.heard} mention`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: tokens.spacing.xs,
                  paddingHorizontal: tokens.spacing.sm,
                  borderRadius: tokens.radii.pill,
                  borderWidth: 1,
                  borderColor: tokens.accent,
                }}
              >
                <Text variant="label" color="accent">
                  @{m.heard}
                </Text>
                <Text variant="label" color="accent">
                  ✕
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View
        onStartShouldSetResponder={canStartTouch}
        onMoveShouldSetResponder={canStartTouch}
        onResponderGrant={onResponderGrant}
        onResponderMove={onResponderMove}
        onResponderRelease={onResponderRelease}
        onResponderTerminate={() => { setPressed(false); onCancel?.(); }}
        onAccessibilityTap={() => { if (held) onRelease(); else if (phase === 'review') onSend(); else { onHoldStart(); onSlideLock(); } }}
        accessibilityRole="button"
        accessibilityState={{ disabled: micDisabled }}
        accessibilityLabel={MIC_LABEL[phase] || 'Talking'}
        style={{
          width: micSize,
          height: micSize,
          borderRadius: micSize / 2,
          backgroundColor: held || pressed ? tokens.accent : tokens.surface,
          borderWidth: 2,
          borderColor: tokens.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: micDisabled ? 0.5 : 1,
        }}
      >
        <Glyph name={phase === 'locked' || phase === 'review' ? 'check' : 'mic'} size={32} color={held || pressed ? readableOn(tokens.accent) : tokens.text} />
      </View>
      <Text variant="caption" color="muted" style={{ marginTop: tokens.spacing.sm }}>Hold to talk · Release to send</Text>
      {held ? <Button label="Cancel recording" variant="ghost" onPress={onCancel} /> : null}
    </View>
  );
}
