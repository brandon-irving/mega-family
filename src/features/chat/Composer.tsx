// The chat composer (PLAN §1): `+` (attach), text field with `@` MEGA mentions, mic → opens talk
// mode. Kid version: a big Talk button plus a small keyboard button (ROLES_CONFIG[role].talkButton).
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type ComposerProps = {
  megaName: string;
  bigTalkButton?: boolean;
  onSend: (text: string) => void;
  onOpenTalk: () => void;
  onAttach?: () => void;
};

export function Composer({ megaName, bigTalkButton = false, onSend, onOpenTalk, onAttach }: ComposerProps) {
  const [text, setText] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(!bigTalkButton);
  const tokens = useTokens();

  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  // G2 polish fix: pad the tappable area past the 44pt-floor visual size (tokens.hitSlop) instead of
  // growing these icon buttons — kids get the bigger hitSlop too, via ROLES_CONFIG[role].bigTargets.
  const hitSlop = { top: tokens.hitSlop, bottom: tokens.hitSlop, left: tokens.hitSlop, right: tokens.hitSlop };

  if (bigTalkButton && !showKeyboard) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, padding: tokens.spacing.md }}>
        <Button label={`Talk to ${megaName}`} onPress={onOpenTalk} style={{ flex: 1 }} accessibilityLabel={`Talk to ${megaName}`} />
        <Pressable
          onPress={() => setShowKeyboard(true)}
          accessibilityRole="button"
          accessibilityLabel="Use keyboard instead"
          hitSlop={hitSlop}
          style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="title">⌨</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.sm,
        padding: tokens.spacing.md,
        borderTopWidth: 1,
        borderTopColor: tokens.line,
        backgroundColor: tokens.surface,
      }}
    >
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
        placeholder={`Message ${megaName}… (@ to mention)`}
        placeholderTextColor={tokens.muted}
        style={{ flex: 1, color: tokens.text, minHeight: tokens.touchTarget, paddingHorizontal: tokens.spacing.md, borderRadius: tokens.radii.pill, borderWidth: 1, borderColor: tokens.line }}
        accessibilityLabel={`Message ${megaName}`}
        onSubmitEditing={send}
      />
      <Pressable
        onPress={onOpenTalk}
        accessibilityRole="button"
        accessibilityLabel="Talk"
        hitSlop={hitSlop}
        style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text variant="title">🎙</Text>
      </Pressable>
      {!!text && <Button label="Send" onPress={send} accessibilityLabel="Send message" />}
      {bigTalkButton && (
        <Pressable onPress={() => setShowKeyboard(false)} accessibilityRole="button" accessibilityLabel="Switch to Talk button" style={{ padding: tokens.spacing.xs }}>
          <Text variant="caption" color="muted">
            Back to Talk
          </Text>
        </Pressable>
      )}
    </View>
  );
}
