// Floating controls frame the centered identity; the measured portrait is also the entrance dock.
import { useId, type RefObject, type ComponentRef } from 'react';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { CHAT_UX } from '@shared/config/chat';
import { Pressable, View } from 'react-native';
import { readableOn, DESKTOP_LAYOUT } from '@shared/config/theme';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { MegaInfo } from '@/features/shell/megaInfo';
import { useDesktopLayout } from '@/ui/useDesktopLayout';
import { AppSettingsButton } from '@/features/shell/AppSettingsButton';

export type ChatHeaderProps = { demoPersonName?: string; onHeightChange?: (height: number) => void; avatarRef?: RefObject<ComponentRef<typeof View> | null>; onAvatarLayout?: () => void; mega: MegaInfo; todayCount: number; onOpenProfile: () => void; onOpenToday: () => void };

export function ChatHeader({ mega, demoPersonName, todayCount, onOpenProfile, onOpenToday, avatarRef, onAvatarLayout, onHeightChange }: ChatHeaderProps) {
  const tokens = useTokens();
  const gradientId = `chat-header-${useId().replace(/:/g, '')}`;
  const desktop = useDesktopLayout();
  const verticalPadding = desktop ? tokens.spacing.md : tokens.spacing.sm;

  return (
    <View pointerEvents="box-none"
      onLayout={event => onHeightChange?.(event.nativeEvent.layout.height)}
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: desktop ? DESKTOP_LAYOUT.gutter : tokens.spacing.lg,
        paddingVertical: verticalPadding,
        gap: tokens.spacing.sm,
      }}
    >
      {/* Tint stops at the portrait; the name pill floats below it over the conversation. */}
      <View pointerEvents="none" accessible={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: verticalPadding + CHAT_UX.entrance.badgeSize }}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              {CHAT_UX.header.fadeStops.map(stop => <Stop key={stop.offset} offset={stop.offset} stopColor={tokens.bg} stopOpacity={stop.opacity} />)}
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
      </View>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'flex-start' }}>
        {!desktop && <View style={{ backgroundColor: tokens.line, borderRadius: tokens.radii.pill }}><AppSettingsButton /></View>}
      </View>
      <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel={`Open ${mega.name}'s profile`} style={{ alignItems: 'center', maxWidth: '40%', gap: tokens.spacing.xs }}>
        <View ref={avatarRef} collapsable={false} onLayout={onAvatarLayout}><MegaBadge hex={mega.hex} sticker={mega.sticker} face={mega.face} size={CHAT_UX.entrance.badgeSize} accessibilityLabel={mega.name} /></View>
        <View style={{ alignItems: 'center', borderRadius: tokens.radii.pill, backgroundColor: tokens.line, paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.xs, maxWidth: '100%' }}>
          <Text variant="label" numberOfLines={1}>{mega.name}</Text>
          {demoPersonName ? <Text variant="caption" color="muted" numberOfLines={1}>{demoPersonName}</Text> : null}
        </View>
      </Pressable>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'flex-end' }}>
      {!desktop && <Pressable
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
          backgroundColor: tokens.line,
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
      </Pressable>}
      </View>
    </View>
  );
}
