// mega://store — the kid's Store (Screen 11), opened from their room or from a Mega Bucks card. Kids only
// (STORE_RULES.shoppers): an adult sees one line explaining that grown-ups' MEGAs wear anything for free.
import { router } from 'expo-router';
import { View } from 'react-native';
import { STORE_COPY } from '@shared/config/copy';
import { useBuy, useStoreCatalog, useUpdateMyMega } from '@/data/useStore';
import { useViewer } from '@/data/useViewer';
import { useRunAction } from '@/features/shell/useRunAction';
import { StoreScreenView } from '@/features/store/StoreScreen';
import { tryOn, type Look } from '@/features/store/storeModel';
import { Button } from '@/ui/Button';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export default function StoreRoute() {
  const viewer = useViewer();
  const tokens = useTokens();
  const catalog = useStoreCatalog();
  const buy = useBuy();
  const updateMega = useUpdateMyMega();
  const { busy, error, run } = useRunAction();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/chat'));
  if (viewer === undefined || catalog.status === 'loading') return <LoadingScreen />;
  const mega = viewer?.mega;
  if (!viewer || !mega || viewer.member.role !== 'kid' || catalog.status === 'error') {
    return (
      <Screen padded={false} presentation="sheet">
        <View style={{ padding: tokens.spacing.lg, gap: tokens.spacing.lg }}>
          <Text variant="headline">{STORE_COPY.title}</Text>
          <Text color="muted">{viewer?.member.role === 'kid' ? STORE_COPY.unavailable : STORE_COPY.kidsOnly}</Text>
          <Button label={STORE_COPY.done} variant="secondary" onPress={close} />
        </View>
      </Screen>
    );
  }
  const look: Look = mega.look;
  const wear = (next: Look) => run('wear', () => updateMega({ look: next }));
  return (
    <Screen padded={false} presentation="sheet">
      <StoreScreenView
        megaName={mega.name}
        balance={catalog.data.balance}
        items={catalog.data.items}
        look={look}
        busy={!!busy}
        error={error}
        onClose={close}
        onWear={(next) => void wear(next)}
        onDecorate={() => router.replace(`/hq/${viewer.member._id}?decorate=1`)}
        onBuy={async (tile) => {
          if (!tile.itemId) return false;
          const itemId = tile.itemId;
          const ok = await run('buy', () => buy({ itemId }));
          // A bought look part goes on right away (the board's "Zap is wearing the star antenna").
          if (ok && tile.section !== 'furniture') await wear(tryOn(look, tile));
          return ok;
        }}
      />
    </Screen>
  );
}
