import { CHAT_UX } from '@shared/config/chat';
// A full-width text area and its actions share one surface. Only backed actions are exposed.
// Kids (ROLES_CONFIG[role].talkButton) get the one bar every kid screen shares (canvas v33,
// design/build/thread.html "Kid composer"; owner Oct 28):
//   talk mode:   [ 🎙 Talk to Sunny ············· ] ( ⌨ )
//   typing mode: [ Type to Sunny… ··············· ] ( 🎙 back to Talk | ➤ send once there's text )
// Sizes are config (COMPOSER_SIZES), icons are drawn SVG (no emoji or icon-font glyphs, which rendered
// tiny), and the field shrinks (flex 1, minWidth 0) so nothing runs past the screen edge.
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Platform, Pressable, TextInput, View } from 'react-native';
import { Path, Rect, Svg } from 'react-native-svg';
import { fillCopy, COMPOSER_COPY } from '@shared/config/copy';
import { COMPOSER_SIZES, readableOn } from '@shared/config/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { Glyph } from '@/features/integrations/glyphs';
import { useDesktopLayout } from '@/ui/useDesktopLayout';
import { hiddenFromA11y } from '@/ui/a11y';

export type ComposerProps = {
  megaName: string;
  responding?: boolean;
  stopping?: boolean;
  onStop?: () => void;
  replyTo?: string | null;
  onCancelReply?: () => void;
  bigTalkButton?: boolean;
  onSend: (text: string) => void;
  onOpenTalk: () => void;
  /** GD (board KidsSnap): adults get a camera button for "Snap homework" (opens mega://homework). */
  onCamera?: () => void;
  cameraLabel?: string;
  /** G5: the onboarding chat's "What should I call you?" while the step is `name` (replaces the usual one). */
  placeholder?: string;
};

export function Composer({ responding = false, stopping = false, onStop, megaName, bigTalkButton = false, onSend, onOpenTalk, onCamera, placeholder, replyTo, onCancelReply }: ComposerProps) {
  const fieldRef = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => { if (replyTo) fieldRef.current?.focus(); }, [replyTo]);
  const [text, setText] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(!bigTalkButton);
  const tokens = useTokens();
  const desktop = useDesktopLayout();
  const copy = (template: string) => fillCopy(template, { mega: megaName });

  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
    Keyboard.dismiss();
  };

  // G2 polish fix: pad the tappable area past the visual size (tokens.hitSlop) instead of growing icons.
  const hitSlop = { top: tokens.hitSlop, bottom: tokens.hitSlop, left: tokens.hitSlop, right: tokens.hitSlop };

  if (bigTalkButton) {
    const K = COMPOSER_SIZES.kid;
    const round = { width: K.height, height: K.height, borderRadius: K.height / 2, alignItems: 'center' as const, justifyContent: 'center' as const };
    const onAccent = readableOn(tokens.accent);
    const bar = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: tokens.spacing.md, paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.sm };
    if (!showKeyboard && !responding) {
      return (
        <View style={bar}>
          <Pressable
            onPress={onOpenTalk}
            accessibilityRole="button"
            accessibilityLabel={copy(COMPOSER_COPY.talkTo)}
            style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: K.height, borderRadius: K.height / 2, backgroundColor: tokens.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.sm, opacity: pressed ? 0.85 : 1 })}
          >
            <MicIcon size={K.talkIcon} color={onAccent} />
            <Text numberOfLines={1} style={{ color: onAccent, fontSize: K.fontSize, fontWeight: '800' }}>
              {copy(COMPOSER_COPY.talkTo)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowKeyboard(true)}
            accessibilityRole="button"
            accessibilityLabel={COMPOSER_COPY.typeInstead}
            hitSlop={hitSlop}
            style={{ ...round, borderWidth: 1, borderColor: tokens.line, backgroundColor: tokens.surface }}
          >
            <KeyboardIcon size={K.toggleIcon} color={tokens.text} />
          </Pressable>
        </View>
      );
    }
  }

  const A = COMPOSER_SIZES.adult;
  const hasText = !!text.trim();
  // Let Fabric measure multiline content intrinsically. Fixing height from onContentSizeChange
  // creates a layout feedback loop on iOS; toggling scrolling also shifts its native caret offset.
  const maxTextAreaHeight = Math.max(tokens.touchTarget, tokens.type.body.lineHeight * CHAT_UX.maxComposerLines + tokens.spacing.sm * 2);
  return (
    <View testID="composer-bar" style={{ paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.sm }}>
      <View testID="composer-surface" style={{ borderRadius: tokens.radii.lg, borderWidth: 1, borderColor: tokens.line, backgroundColor: tokens.surface, paddingHorizontal: tokens.spacing.sm, paddingVertical: tokens.spacing.xs }}>
        {replyTo && <View style={{ flexDirection: 'row', alignItems: 'center', padding: tokens.spacing.sm, borderLeftWidth: 2, borderLeftColor: tokens.accent }}><Text variant="caption" color="muted" numberOfLines={2} style={{ flex: 1 }}>{replyTo}</Text><Button label={CHAT_UX.actions.cancelReply} variant="ghost" onPress={onCancelReply ?? (() => {})} /></View>}
        <View testID="composer-row" style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        {onCamera ? <Pressable onPress={onCamera} accessibilityRole="button" accessibilityLabel="Add attachment" style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}><Glyph name="plus" size={24} color={tokens.muted} /></Pressable> : null}
        <TextInput
          ref={fieldRef}
          nativeID="mega-composer-input"
          numberOfLines={desktop ? 1 : undefined}
          autoFocus={bigTalkButton}
          value={text}
          onChangeText={setText}
          placeholder={placeholder ?? copy(bigTalkButton ? COMPOSER_COPY.kidPlaceholder : COMPOSER_COPY.adultPlaceholder)}
          placeholderTextColor={tokens.muted}
          style={{ flex: 1, minWidth: 0, minHeight: tokens.touchTarget, maxHeight: maxTextAreaHeight, color: tokens.text, fontSize: tokens.type.body.fontSize, lineHeight: tokens.type.body.lineHeight, paddingHorizontal: tokens.spacing.sm, paddingTop: tokens.spacing.sm, paddingBottom: tokens.spacing.sm, textAlignVertical: 'top' }}
          accessibilityLabel={copy(COMPOSER_COPY.fieldLabel)}
          multiline
          scrollEnabled
          submitBehavior="newline"
          onKeyPress={Platform.OS === 'web' ? event => {
            const key = event.nativeEvent as unknown as KeyboardEvent;
            if (key.key !== 'Enter' || key.shiftKey || key.isComposing || key.keyCode === 229) return;
            event.preventDefault();
            if (!responding) send();
          } : undefined}
          underlineColorAndroid="transparent"
        />
        <Pressable disabled={responding && (stopping || !onStop)} onPress={responding ? onStop : hasText ? send : bigTalkButton ? () => setShowKeyboard(false) : onOpenTalk} accessibilityRole="button" accessibilityLabel={responding ? stopping ? CHAT_UX.stopping : CHAT_UX.stopResponse : hasText ? COMPOSER_COPY.send : bigTalkButton ? COMPOSER_COPY.talkInstead : 'Talk'} style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}>
          {responding ? <Svg {...iconA11y} width={A.micIcon} height={A.micIcon} viewBox="0 0 24 24"><Rect x={5} y={5} width={14} height={14} rx={2} fill={tokens.text} /></Svg> : hasText ? <SendIcon size={A.micIcon} color={tokens.accent} /> : <MicIcon size={A.micIcon} color={tokens.text} />}
        </Pressable>
        </View>
      </View>
    </View>
  );
}

// Drawn icons, paths from the canvas board (design/build/thread.html), in the given color.
type IconProps = { size: number; color: string };
const iconA11y = hiddenFromA11y();

function MicIcon({ size, color }: IconProps) {
  return (
    <Svg {...iconA11y} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={9} y={3} width={6} height={11} rx={3} />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </Svg>
  );
}

function KeyboardIcon({ size, color }: IconProps) {
  return (
    <Svg testID="keyboard-icon" {...iconA11y} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={2} y={6} width={20} height={13} rx={2.5} />
      <Path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14.5h6" />
    </Svg>
  );
}

function SendIcon({ size, color }: IconProps) {
  return (
    <Svg {...iconA11y} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12h13M13 6l6 6-6 6" />
    </Svg>
  );
}
