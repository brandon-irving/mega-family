import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { useTokens } from './theme';

/** Compact, persistent navigation for sections within a screen. */
export function TabBar<T extends string>({ tabs, value, onChange, disabled = false }: {
  tabs: readonly { id: T; label: string }[]; value: T; onChange: (value: T) => void; disabled?: boolean;
}) {
  const t = useTokens();
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.line }}>
    {tabs.map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: value === tab.id, disabled }} disabled={disabled} onPress={() => onChange(tab.id)} style={{ flex: 1, minHeight: t.touchTarget, justifyContent: 'center', alignItems: 'center', paddingVertical: t.spacing.sm, borderBottomWidth: 2, borderBottomColor: value === tab.id ? t.accent : 'transparent' }}>
      <Text variant="caption" style={{ color: value === tab.id ? t.accent : t.muted }}>{tab.label}</Text>
    </Pressable>)}
  </View>;
}
