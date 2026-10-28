// The returning-user opening (Screen 9 board LoginOpening): while the session and the family load, the
// screen is just the Midnight background — no spinner, no label — so a fast load goes straight into chat with
// nothing flashing. Only when loading takes longer than WALKER_MOTION.openingDelayMs (owner, Oct 26: ~300ms)
// do the three MEGAs walk in. AuthGate renders this for both of its loading phases at the same tree position,
// so the walk carries on across them instead of restarting.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ledge, WalkerStage } from '@/features/walkers';
import { useTokens } from '@/ui/theme';
import { WALKER_MOTION } from '@shared/config/walkers';
import { SIGNIN_SCENES } from './scenes';

export function OpeningScreen({ delayMs = WALKER_MOTION.openingDelayMs }: { delayMs?: number }) {
  const tokens = useTokens();
  const [slow, setSlow] = useState(delayMs <= 0);
  useEffect(() => {
    if (slow) return;
    const t = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs, slow]);

  return (
    <View style={[styles.fill, { backgroundColor: tokens.bg }]} accessibilityLabel="Loading" accessibilityRole="progressbar" testID="opening">
      {slow ? (
        <WalkerStage scene={SIGNIN_SCENES.opening} testID="opening-walkers">
          <View style={[styles.fill, styles.center, { paddingHorizontal: tokens.spacing.xl }]}>
            <Ledge id="opening" style={styles.mark} />
          </View>
        </WalkerStage>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { justifyContent: 'center' },
  mark: { alignSelf: 'stretch' },
});
