// Chat header (PLAN §1): the animated badge, the MEGA's name, a live status line from the same job
// event that drives HQ, and a Today button with a count of things waiting on you.
import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { MegaInfo } from '@/features/shell/megaInfo';

export type ChatHeaderProps = { mega: MegaInfo; statusLine: string; todayCount: number; onOpenProfile: () => void; onOpenToday: () => void };

export function ChatHeader({ mega, statusLine, todayCount, onOpenProfile, onOpenToday }: ChatHeaderProps) {
  const tokens = useTokens();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: tokens.durations.slow, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: tokens.durations.slow, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, tokens.durations.slow]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: tokens.spacing.lg,
        paddingVertical: tokens.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: tokens.line,
        backgroundColor: tokens.surface,
      }}
    >
      <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel={`Open ${mega.name}'s profile`} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, flex: 1 }}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <MegaBadge hex={mega.hex} sticker={mega.sticker} face={mega.face} size={40} accessibilityLabel={mega.name} />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text variant="title">{mega.name}</Text>
          <Text variant="caption" color="muted" numberOfLines={1}>
            {statusLine}
          </Text>
        </View>
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
            <Text variant="caption" style={{ color: '#FFFFFF' }}>
              {todayCount}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
