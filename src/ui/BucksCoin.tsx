// The pixel Mega Bucks coin (shared/sprite COIN) — next to every balance, price tag and release stepper.
import { renderCoin } from '@shared/sprite';
import { PixelArt } from './PixelArt';

const COIN = renderCoin();

/** `size` is the coin's side in points; the 12px art scales to it. Decorative by default (the amount beside
 * it carries the meaning for screen readers). */
export function BucksCoin({ size = 24, accessibilityLabel }: { size?: number; accessibilityLabel?: string }) {
  return <PixelArt picture={COIN} scale={size / COIN.w} decorative={!accessibilityLabel} accessibilityLabel={accessibilityLabel} />;
}
