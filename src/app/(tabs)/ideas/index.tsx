import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, type ErrorBoundaryProps } from 'expo-router';
import { IdeasHeader, IdeasScreen } from '@/features/ideas/IdeasScreen';
import { AdultOnly } from '@/features/shell/RoleGate';
import { errorCopyFor } from '@/data/errorCopy';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TabBottomInset } from '@/ui/TabBottomInset';
import { useTokens } from '@/ui/theme';

export default function IdeasRoute() {
  return <TabBottomInset><AdultOnly><IdeasOnFirstVisit /></AdultOnly></TabBottomInset>;
}

// Native tabs mount eagerly. Delay the collection query and gift import until the first visit,
// then preserve the loaded page and filters across tab switches.
function IdeasOnFirstVisit() {
  const [hasOpened, setHasOpened] = useState(false);
  useFocusEffect(useCallback(() => { setHasOpened(true); }, []));
  return hasOpened ? <IdeasScreen /> : <Screen presentation="tab"><IdeasHeader /></Screen>;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const tokens = useTokens();
  return (
    <TabBottomInset><Screen presentation="tab">
      <IdeasHeader />
      <View style={{ paddingVertical: tokens.spacing.xl, gap: tokens.spacing.md }}>
        <Text variant="title">Couldn’t load Ideas</Text>
        <Text color="muted">{errorCopyFor(error)}</Text>
        <Button label="Try again" onPress={() => void retry()} />
      </View>
    </Screen></TabBottomInset>
  );
}
