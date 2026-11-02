import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '@/ui/theme';
import { Text } from '@/ui/Text';
import { Glyph, type GlyphName } from '@/features/integrations/glyphs';
import { DESKTOP_LAYOUT } from '@shared/config/theme';
import { CHAT_UX } from '@shared/config/chat';
import type { Reaction } from '@shared/domain/enums';

export type ActionAnchor = { x: number; y: number };
export function MessageActions({ text, anchor, selecting, error, reaction, onClose, onCopy, onSelect, onReply, onReact }: {
  text: string; anchor: ActionAnchor | null; selecting: boolean; error: string | null;
  reaction?: Reaction | null; onClose: () => void; onCopy: () => void; onSelect: () => void;
  onReply?: () => void; onReact?: (reaction: Reaction) => void;
}) {
  const t = useTokens();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = Platform.OS === 'web' && width >= DESKTOP_LAYOUT.breakpoint;
  const size = CHAT_UX.actionMenu;
  const menuWidth = Math.min(size.width, width - t.spacing.lg * 2);
  const rows: { label: string; icon: GlyphName; action: () => void }[] = [
    ...(onReply ? [{ label: CHAT_UX.actions.reply, icon: 'reply' as const, action: onReply }] : []),
    { label: CHAT_UX.actions.copy, icon: 'copy', action: onCopy },
    { label: CHAT_UX.actions.select, icon: 'selectText', action: onSelect },
  ];
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: desktop ? 'transparent' : t.scrim, justifyContent: 'center', padding: t.spacing.lg }}>
      <Pressable accessibilityRole="button" accessibilityLabel={CHAT_UX.actions.close} onPress={onClose} style={{ position: 'absolute', inset: 0 }} />
      <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={desktop ? {
        position: 'absolute', width: menuWidth,
        left: Math.max(t.spacing.md, Math.min(anchor?.x ?? width / 2, width - menuWidth - t.spacing.md)),
        top: Math.max(insets.top + t.spacing.md, Math.min(anchor?.y ?? height / 2, height - size.reservedHeight - t.spacing.md)),
      } : { width: menuWidth, alignSelf: 'center', maxHeight: height - insets.top - insets.bottom - t.spacing.xl * 2 }}>
        {(!desktop || selecting) && <ScrollView style={{ maxHeight: size.previewHeight, borderRadius: t.radii.lg, backgroundColor: t.surface, marginBottom: t.spacing.sm }} contentContainerStyle={{ padding: t.spacing.md }}>
          <Text selectable={selecting} numberOfLines={selecting ? undefined : 5}>{text}</Text>
        </ScrollView>}
        <View style={{ backgroundColor: t.surface, borderRadius: t.radii.lg, borderWidth: 1, borderColor: t.line, overflow: 'hidden', boxShadow: `0 8px 32px ${t.scrim}` }}>
          {onReact && <View style={{ flexDirection: 'row', padding: t.spacing.sm, gap: t.spacing.sm, borderBottomColor: t.line, borderBottomWidth: 1 }}>
            {CHAT_UX.reactions.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: reaction === item.id }} onPress={() => onReact(item.id)} style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: t.touchTarget, borderRadius: t.radii.md, backgroundColor: pressed || reaction === item.id ? t.line : 'transparent' })}>
              <Text style={{ fontSize: size.reactionSize }}>{item.id === 'up' ? '👍' : '👎'}</Text>
            </Pressable>)}
          </View>}
          {rows.map((row, i) => <Pressable key={row.label} accessibilityRole="button" accessibilityLabel={row.label} onPress={row.action} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: t.spacing.md, minHeight: t.touchTarget + t.spacing.xs, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: pressed ? t.line : 'transparent' })}>
            <Text>{row.label}</Text><Glyph name={row.icon} color={t.text} size={20} />
          </Pressable>)}
          {error && <Text accessibilityRole="alert" style={{ padding: t.spacing.md }}>{error}</Text>}
        </View>
      </View>
    </View>
  </Modal>;
}
