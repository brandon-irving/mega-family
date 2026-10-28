// Any pixel picture from the shared engine (shared/sprite: the MEGA, the Mega Bucks coin, Store furniture)
// as crisp SVG rects, one per horizontal run of equal color — the same approach MegaSprite has always used.
import { useMemo } from 'react';
import { Rect, Svg } from 'react-native-svg';
import { runs, type Picture } from '@shared/sprite';

export type PixelArtProps = { picture: Picture; scale?: number; accessibilityLabel?: string; decorative?: boolean };

export function PixelArt({ picture, scale = 4, accessibilityLabel, decorative = false }: PixelArtProps) {
  const rects = useMemo(() => runs(picture), [picture]);
  return (
    <Svg
      width={picture.w * scale}
      height={picture.h * scale}
      viewBox={`0 0 ${picture.w} ${picture.h}`}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    >
      {rects.map((r, i) => (
        <Rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.color} />
      ))}
    </Svg>
  );
}
