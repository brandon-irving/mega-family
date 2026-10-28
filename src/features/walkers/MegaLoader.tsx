// The shared loader (owner, Oct 28; LoginOpening board): words in the middle of the screen with a MEGA
// pacing back and forth on top of them. Never blank — the words are there from the first frame. Under
// reduced motion the MEGA stands still in the middle. The auth gate uses it for every load ("Opening
// chats"); any screen can use it with its own words.
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { SIGNIN_COPY } from '@shared/config/copy';
import { WALKER_MOTION } from '@shared/config/walkers';
import { at, HIDE, type Scene, script, SHOW, wait, walk } from './engine';
import { Ledge, WalkerStage } from './WalkerStage';

const L = WALKER_MOTION.loader;

/** Teal starts in the middle and waits there first, so under reduced motion (where a wait never ends) it
 * stays in the middle; otherwise it paces end to end over the words, looping from that first wait. */
export const LOADER_SCENE: Scene = {
  teal: script([at('loader', 0.5), SHOW, wait(L.startMs), walk(L.to), wait(L.pauseMs, { face: 'right', emote: '…' }), walk(L.from), wait(L.pauseMs, { face: 'left', emote: '…' }), walk(0.5)], 2),
  coral: script([HIDE]),
  violet: script([HIDE]),
};

export type MegaLoaderProps = { text?: string; reducedMotion?: boolean; testID?: string };

export function MegaLoader({ text = SIGNIN_COPY.loader.opening, reducedMotion, testID }: MegaLoaderProps) {
  const tokens = useTokens();
  return (
    <View style={[styles.fill, { backgroundColor: tokens.bg }]} testID={testID} accessibilityRole="progressbar" accessibilityLabel={text}>
      <WalkerStage scene={LOADER_SCENE} reducedMotion={reducedMotion}>
        <View style={[styles.fill, styles.center, { paddingHorizontal: tokens.spacing.xl }]}>
          {/* The MEGA stands on the tops of the letters. */}
          <Ledge id="loader" inset={tokens.type.headline.fontSize * 0.2}>
            <Text variant="headline" color="muted" accessibilityRole="text" style={styles.text}>
              {text}
            </Text>
          </Ledge>
        </View>
      </WalkerStage>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { justifyContent: 'center' },
  text: { textAlign: 'center' },
});
