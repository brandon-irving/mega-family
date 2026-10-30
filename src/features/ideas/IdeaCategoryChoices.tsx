import { View } from 'react-native';
import { IDEA_CATEGORIES, IDEA_CATEGORY_LABELS, type IdeaCategory } from '@shared/domain/ideas';
import { IDEAS_COPY } from '@shared/config/copy';
import { Chip } from '@/ui/Chip';
import { useTokens } from '@/ui/theme';

/** The same categories power filtering and recategorizing a saved suggestion. */
export function IdeaCategoryChoices({ category, onChange, includeAll = false, disabled = false, accessibilityLabel }: {
  category?: IdeaCategory;
  onChange: (category: IdeaCategory | undefined) => void;
  includeAll?: boolean;
  disabled?: boolean;
  accessibilityLabel?: (label: string) => string;
}) {
  const tokens = useTokens();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
      {includeAll ? <Chip label={IDEAS_COPY.allCategories} selected={!category} onPress={disabled ? undefined : () => onChange(undefined)} /> : null}
      {IDEA_CATEGORIES.map(value => (
        <Chip key={value} label={IDEA_CATEGORY_LABELS[value]} selected={category === value}
          accessibilityLabel={accessibilityLabel?.(IDEA_CATEGORY_LABELS[value])}
          onPress={disabled ? undefined : () => onChange(value)} />
      ))}
    </View>
  );
}
