// G8 (CONTRACT v0.18 decision 6, G8.md invariant 8; boards LoginInvite and IcsPaste, the Paste button in a
// one-line field): paste only on a tap. On iOS 16+ the system paste control (`ClipboardPasteButton`,
// UIPasteControl) pastes with no "Allow Paste" prompt; elsewhere our own button reads `getStringAsync()` inside
// the press (on iOS that shows the system prompt, and a denied prompt reads as '' — the same as an empty
// clipboard). Never on mount/focus.
//
// G8 UX review: on the web the read can reject (no permission, Safari) or never settle, so it's bounded by
// APP_TIMEOUTS.clipboardReadMs and a failure calls `onFailed` (the field shows G8_UI_COPY.pasteFailed) — the
// button never sits there dead. Size per the Login board: 86×52 (compact: 44, the touch floor, for 48pt fields).
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { APP_TIMEOUTS } from '@shared/config/appTimeouts';
import { G8_COPY } from '@shared/config/copy';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

const SIZES = { normal: { width: 86, height: 52 }, compact: { width: 86, height: 44 } } as const;

/** Fixed width, so a field can leave room for it inside its right edge. */
export const PASTE_BUTTON_WIDTH = SIZES.normal.width;

/** The clipboard text, or null when it can't be read in time. */
function readClipboard(ms: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    Clipboard.getStringAsync().then(
      (text) => {
        clearTimeout(timer);
        resolve(text);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export function PasteButton({ label, onPasted, onFailed, size = 'normal' }: { label: string; onPasted: (text: string) => void; onFailed?: () => void; size?: keyof typeof SIZES }) {
  const tokens = useTokens();
  const frame = SIZES[size];
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  if (Clipboard.isPasteButtonAvailable) {
    return (
      <View style={frame} accessibilityLabel={label}>
        <Clipboard.ClipboardPasteButton
          acceptedContentTypes={['plain-text', 'url']}
          backgroundColor={tokens.surface}
          foregroundColor={tokens.text}
          cornerStyle="capsule"
          displayMode="iconAndLabel"
          style={frame}
          onPress={(data) => onPasted(data.type === 'text' ? data.text : '')}
        />
      </View>
    );
  }
  return (
    <Pressable
      onPress={async () => {
        if (pending) return;
        setPending(true);
        const text = await readClipboard(APP_TIMEOUTS.clipboardReadMs);
        if (!mounted.current) return;
        setPending(false);
        if (text === null) onFailed?.();
        else onPasted(text);
      }}
      disabled={pending}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: pending, disabled: pending }}
      style={({ pressed }) => ({
        minWidth: frame.width,
        height: frame.height,
        paddingHorizontal: tokens.spacing.md,
        borderRadius: tokens.radii.pill,
        backgroundColor: tokens.bg,
        borderWidth: 1,
        borderColor: tokens.line,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed || pending ? 0.7 : 1,
      })}
    >
      <Text variant="label" weight="600">
        {G8_COPY.paste}
      </Text>
    </Pressable>
  );
}
