// The chat composer (PLAN §1): `+` (attach), text field with `@` MEGA mentions, mic → opens talk mode.
// Kids (ROLES_CONFIG[role].talkButton) get the one bar every kid screen shares (canvas v33,
// design/build/thread.html "Kid composer"; owner Oct 28):
//   talk mode:   [ 🎙 Talk to Sunny ············· ] ( ⌨ )
//   typing mode: [ Type to Sunny… ··············· ] ( 🎙 back to Talk | ➤ send once there's text )
// Sizes are config (COMPOSER_SIZES), icons are drawn SVG (no emoji or icon-font glyphs, which rendered
// tiny), and the field shrinks (flex 1, minWidth 0) so nothing runs past the screen edge.
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Path, Rect, Svg, Circle } from 'react-native-svg';
import { fillCopy, COMPOSER_COPY } from '@shared/config/copy';
import { COMPOSER_SIZES, readableOn } from '@shared/config/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { hiddenFromA11y } from '@/ui/a11y';

export type ComposerProps = {
  megaName: string;
  bigTalkButton?: boolean;
  onSend: (text: string) => void;
  onOpenTalk: () => void;
  onAttach?: () => void;
  /** GD (board KidsSnap): adults get a camera button for "Snap homework" (opens mega://homework). */
  onCamera?: () => void;
  cameraLabel?: string;
};

export function Composer({ megaName, bigTalkButton = false, onSend, onOpenTalk, onAttach, onCamera, cameraLabel = 'Take a photo' }: ComposerProps) {
  const [text, setText] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(!bigTalkButton);
  const tokens = useTokens();
  const copy = (template: string) => fillCopy(template, { mega: megaName });

  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  // G2 polish fix: pad the tappable area past the visual size (tokens.hitSlop) instead of growing icons.
  const hitSlop = { top: tokens.hitSlop, bottom: tokens.hitSlop, left: tokens.hitSlop, right: tokens.hitSlop };

  if (bigTalkButton) {
    const K = COMPOSER_SIZES.kid;
    const round = { width: K.height, height: K.height, borderRadius: K.height / 2, alignItems: 'center' as const, justifyContent: 'center' as const };
    const onAccent = readableOn(tokens.accent);
    const bar = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: tokens.spacing.md, paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.sm };
    if (!showKeyboard) {
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
    const hasText = !!text.trim();
    return (
      <View style={bar}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={copy(COMPOSER_COPY.kidPlaceholder)}
          placeholderTextColor={tokens.muted}
          style={{ flex: 1, minWidth: 0, height: K.height, fontSize: K.fontSize, color: tokens.text, paddingHorizontal: tokens.spacing.lg, borderRadius: K.height / 2, borderWidth: K.fieldBorder, borderColor: tokens.accent, backgroundColor: tokens.surface }}
          accessibilityLabel={copy(COMPOSER_COPY.fieldLabel)}
          returnKeyType="send"
          onSubmitEditing={send}
          autoFocus
        />
        {hasText ? (
          <Pressable onPress={send} accessibilityRole="button" accessibilityLabel={COMPOSER_COPY.send} hitSlop={hitSlop} style={{ ...round, backgroundColor: tokens.accent }}>
            <SendIcon size={K.micIcon} color={onAccent} />
          </Pressable>
        ) : (
          <Pressable onPress={() => setShowKeyboard(false)} accessibilityRole="button" accessibilityLabel={COMPOSER_COPY.talkInstead} hitSlop={hitSlop} style={{ ...round, backgroundColor: tokens.accent }}>
            <MicIcon size={K.micIcon} color={onAccent} />
          </Pressable>
        )}
      </View>
    );
  }

  const A = COMPOSER_SIZES.adult;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, padding: tokens.spacing.md, borderTopWidth: 1, borderTopColor: tokens.line, backgroundColor: tokens.surface }}>
      {onCamera && (
        <Pressable
          onPress={onCamera}
          accessibilityRole="button"
          accessibilityLabel={cameraLabel}
          hitSlop={hitSlop}
          style={{ width: tokens.touchTarget, height: tokens.touchTarget, borderRadius: tokens.touchTarget / 2, borderWidth: 1, borderColor: tokens.line, alignItems: 'center', justifyContent: 'center' }}
        >
          <CameraIcon size={A.toggleIcon} color={tokens.text} />
        </Pressable>
      )}
      <Pressable
        onPress={onAttach}
        accessibilityRole="button"
        accessibilityLabel="Attach"
        hitSlop={hitSlop}
        style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text variant="title">+</Text>
      </Pressable>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={copy(COMPOSER_COPY.adultPlaceholder)}
        placeholderTextColor={tokens.muted}
        style={{ flex: 1, minWidth: 0, color: tokens.text, minHeight: tokens.touchTarget, paddingHorizontal: tokens.spacing.md, borderRadius: tokens.radii.pill, borderWidth: 1, borderColor: tokens.line }}
        accessibilityLabel={copy(COMPOSER_COPY.fieldLabel)}
        onSubmitEditing={send}
      />
      <Pressable
        onPress={onOpenTalk}
        accessibilityRole="button"
        accessibilityLabel="Talk"
        hitSlop={hitSlop}
        style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}
      >
        <MicIcon size={A.micIcon} color={tokens.text} />
      </Pressable>
      {!!text && <Button label="Send" onPress={send} accessibilityLabel={COMPOSER_COPY.send} />}
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

function CameraIcon({ size, color }: IconProps) {
  return (
    <Svg {...iconA11y} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <Circle cx={12} cy={13.5} r={3.5} />
    </Svg>
  );
}
