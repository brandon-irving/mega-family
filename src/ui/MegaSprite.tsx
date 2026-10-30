// The code-drawn MEGA sprite, everywhere: the badge (head on a white tile) in headers and messages,
// and the full sprite in HQ, the profile sheet and the Store's try-on stage. Renders shared/sprite's pixel
// picture through PixelArt (crisp SVG paths, one per color).
import { useMemo } from 'react';
import type { ExpressionName, FrameName, View as SpriteView } from '@shared/sprite';
import { renderMega } from '@shared/sprite';
import type { StickerId } from '@shared/config/looks';
import type { AntennaId, EyeColorId, EyeStyleId } from '@shared/config/store';
import { PixelArt } from './PixelArt';

/** GD (CONTRACT v0.13 `megaLook`): the Store parts a MEGA is wearing; missing means `classic`. */
export type LookParts = { antenna?: AntennaId; eyes?: EyeStyleId; eyeColor?: EyeColorId };

export type MegaSpriteProps = {
  hex: string;
  sticker: StickerId;
  face?: ExpressionName;
  view?: SpriteView;
  /** A walk-cycle frame (the walking MEGAs, src/features/walkers). */
  frame?: FrameName;
  badge?: boolean;
  scale?: number;
  accessibilityLabel?: string;
  parts?: LookParts;
};

export function MegaSprite({ hex, sticker, face = 'open', view = 'front', frame = 'stand', badge = false, scale = 4, accessibilityLabel, parts }: MegaSpriteProps) {
  const { antenna, eyes, eyeColor } = parts ?? {};
  const picture = useMemo(() => renderMega({ shell: hex, sticker, antenna, eyes, eyeColor }, { view, frame, expression: face, badge }), [hex, sticker, antenna, eyes, eyeColor, view, frame, face, badge]);
  return <PixelArt picture={picture} scale={scale} accessibilityLabel={accessibilityLabel ?? 'MEGA'} />;
}
