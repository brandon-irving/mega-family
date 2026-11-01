// A compact identity link leaves room for Today and the shared Settings shortcut.
import type { RefObject, ComponentRef } from 'react';
import { CHAT_UX } from '@shared/config/chat';
import { Pressable, View } from 'react-native';
import { readableOn } from '@shared/config/theme';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { MegaInfo } from '@/features/shell/megaInfo';
import { AppSettingsButton } from '@/features/shell/AppSettingsButton';

export type ChatHeaderProps = { avatarRef?: RefObject<ComponentRef<typeof View> | null>; onAvatarLayout?: () => void; mega: MegaInfo; todayCount: number; onOpenProfile: () => void; onOpenToday: () => void };

export function ChatHeader({ mega, todayCount, onOpenProfile, onOpenToday, avatarRef, onAvatarLayout }: ChatHeaderProps) {
  const tokens = useTokens();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: tokens.spacing.lg,
        paddingVertical: tokens.spacing.sm,
        gap: tokens.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: tokens.line,
        backgroundColor: tokens.surface,
      }}
    >
      <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel={`Open ${mega.name}'s profile`} style={{ flexDirection: 'row', alignItems: 'center', minHeight: tokens.touchTarget, gap: tokens.spacing.sm, flex: 1, minWidth: 0 }}>
        <View ref={avatarRef} collapsable={false} onLayout={onAvatarLayout}><MegaBadge hex={mega.hex} sticker={mega.sticker} face={mega.face} size={CHAT_UX.entrance.badgeSize} accessibilityLabel={mega.name} /></View>
        <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{mega.name}</Text>
      </Pressable>
      <Pressable
        onPress={onOpenToday}
        accessibilityRole="button"
        accessibilityLabel={`Today, ${todayCount} waiting on you`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          minHeight: tokens.touchTarget,
          paddingHorizontal: tokens.spacing.md,
          borderRadius: tokens.radii.pill,
          borderWidth: 1,
          borderColor: tokens.line,
        }}
      >
        <Text variant="label">Today</Text>
        {todayCount > 0 && (
          <View style={{ backgroundColor: tokens.accent, borderRadius: tokens.radii.pill, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text variant="caption" style={{ color: readableOn(tokens.accent) }}>
              {todayCount}
            </Text>
          </View>
        )}
      </Pressable>
      <AppSettingsButton />
    </View>
  );
}
