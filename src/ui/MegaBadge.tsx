import type { ExpressionName } from '@shared/sprite';
import type { StickerId } from '@shared/config/looks';
import { Badge } from './Badge';
import { MegaSprite } from './MegaSprite';

export type MegaBadgeProps = { hex: string; sticker: StickerId; face?: ExpressionName; size?: number; accessibilityLabel?: string };

/** The MEGA head on a white tile — used in chat headers, beside MEGA messages, and member rows. */
export function MegaBadge({ hex, sticker, face = 'open', size = 44, accessibilityLabel }: MegaBadgeProps) {
  // The badge picture is already cropped to the head; scale so it fills most of the tile.
  const scale = size / 24;
  return (
    <Badge size={size}>
      <MegaSprite hex={hex} sticker={sticker} face={face} badge scale={scale} accessibilityLabel={accessibilityLabel} />
    </Badge>
  );
}
