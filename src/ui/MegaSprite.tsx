// The code-drawn MEGA sprite, everywhere: the badge (head on a white tile) in headers and messages,
// and the full sprite in HQ and the profile sheet. Renders shared/sprite's pixel picture as crisp-edged
// SVG rects (one per horizontal run of equal color) — cheap for a 32x40 grid and matches the prototype's
// own toSvg approach, chosen over per-pixel Views for far fewer nodes at any scale.
import { Rect, Svg } from 'react-native-svg';
import type { ExpressionName, View as SpriteView } from '@shared/sprite';
import { renderMega, runs } from '@shared/sprite';
import type { StickerId } from '@shared/config/looks';

export type MegaSpriteProps = {
  hex: string;
  sticker: StickerId;
  face?: ExpressionName;
  view?: SpriteView;
  badge?: boolean;
  scale?: number;
  accessibilityLabel?: string;
};

export function MegaSprite({ hex, sticker, face = 'open', view = 'front', badge = false, scale = 4, accessibilityLabel }: MegaSpriteProps) {
  const picture = renderMega({ shell: hex, sticker }, { view, expression: face, badge });
  const rects = runs(picture);
  return (
    <Svg
      width={picture.w * scale}
      height={picture.h * scale}
      viewBox={`0 0 ${picture.w} ${picture.h}`}
      accessibilityLabel={accessibilityLabel ?? 'MEGA'}
      accessibilityRole="image"
    >
      {rects.map((r, i) => (
        // Each rect is a whole pixel row of a run; no stroke means no anti-aliased edges to begin with.
        <Rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.color} />
      ))}
    </Svg>
  );
}
