// Talk mode (PLAN "Talk mode", decided Oct 24): a full-screen walkie-talkie. Pure presentational —
// talk.tsx owns the state machine (./talkMachine), the recorder/speaker services and the chat calls;
// this just renders a TalkState and turns raw touches on the mic button into onHoldStart/onSlideLock/
// onRelease. Hold to talk, release to send; slide up to lock for hands-free, tap to send; pressing while
// the MEGA talks interrupts it; ✕ or swipe down to leave.
import { useRef, useState } from 'react';
import { type GestureResponderEvent, Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
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
  transcribing: '',
  review: 'Tap to send',
  sending: '',
  speaking: 'Hold to interrupt',
};

export function TalkContent({ mega, phase, caption, mentions, reply, error, onHoldStart, onSlideLock, onRelease, onRemoveMention, onSend, onClose }: TalkContentProps) {
  const tokens = useTokens();
  const reducedMotion = useReducedMotion();
  // Escape on web closes it (a route modal: the navigator handles Android back).
  useDismiss(onClose, { androidBack: false });
  const face = FACE_BY_PHASE[phase] ?? mega.face;
  const micDisabled = phase === 'transcribing' || phase === 'sending';
  const held = phase === 'recording' || phase === 'locked';

  const startY = useRef<number | null>(null);
  const lockedThisTouch = useRef(false);
  const [pressed, setPressed] = useState(false);

  const canStartTouch = () => !micDisabled;

  const onResponderGrant = (e: GestureResponderEvent) => {
    if (micDisabled) return;
    setPressed(true);
    if (phase === 'idle' || phase === 'speaking') {
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
    if (phase === 'recording' && !lockedThisTouch.current) onRelease();
    else if (phase === 'locked') onRelease(); // tap to send while locked
    else if (phase === 'review') onSend(); // tap the button again to confirm and send
  };

  // Swipe down anywhere above the mic button to leave (PLAN: "✕ or swipe down to leave").
  const swipeStartY = useRef<number | null>(null);

  const captionText = phase === 'speaking' ? reply || '…' : phase === 'review' || phase === 'sending' ? caption : error || '';
  // Kid version of talk mode (PLAN "One app, three levels": "bigger targets"): tokens.bigTargets comes
  // from ROLES_CONFIG[role] through ThemeProvider, so this needs no role check of its own.
  const micSize = tokens.bigTargets ? 128 : 96;

  return (
    <View
      style={{ flex: 1, backgroundColor: tokens.bg, alignItems: 'center', justifyContent: 'space-between', paddingVertical: tokens.spacing.xxl }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        swipeStartY.current = e.nativeEvent.pageY;
      }}
      onResponderRelease={(e) => {
        if (swipeStartY.current !== null && e.nativeEvent.pageY - swipeStartY.current > TALK_CONFIG.lockSlideDistancePx) onClose();
        swipeStartY.current = null;
      }}
    >
      <View style={{ alignSelf: 'flex-end', marginRight: tokens.spacing.sm }}>
        <CloseButton onPress={onClose} label="Close talk mode" />
      </View>

      <View style={{ alignItems: 'center', gap: tokens.spacing.lg, flex: 1, justifyContent: 'center', paddingHorizontal: tokens.spacing.xl }}>
        <MegaSprite hex={mega.hex} sticker={mega.sticker} face={face} scale={7} accessibilityLabel={`${mega.name}, ${phase}`} />

        <Animated.View key={phase} entering={reducedMotion ? undefined : FadeIn.duration(tokens.durations.base)} exiting={reducedMotion ? undefined : FadeOut.duration(tokens.durations.fast)}>
          <Text variant="headline" color="muted" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
            {captionText || MIC_LABEL[phase]}
          </Text>
        </Animated.View>

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
      </View>

      <View
        onStartShouldSetResponder={canStartTouch}
        onMoveShouldSetResponder={canStartTouch}
        onResponderGrant={onResponderGrant}
        onResponderMove={onResponderMove}
        onResponderRelease={onResponderRelease}
        onResponderTerminate={onResponderRelease}
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
        <Text variant="title" style={held || pressed ? { color: readableOn(tokens.accent) } : undefined}>
          {phase === 'locked' || phase === 'review' ? '➤' : '🎙'}
        </Text>
      </View>
    </View>
  );
}
