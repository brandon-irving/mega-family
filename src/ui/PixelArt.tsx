// Any pixel picture from the shared engine (shared/sprite: the MEGA, the Mega Bucks coin, Store furniture)
// as crisp SVG rects, one per horizontal run of equal color — the same approach MegaSprite has always used.
import { useMemo } from 'react';
import { View } from 'react-native';
import { Rect, Svg } from 'react-native-svg';
import { runs, type Picture } from '@shared/sprite';

export type PixelArtProps = { picture: Picture; scale?: number; accessibilityLabel?: string; decorative?: boolean };

export function PixelArt({ picture, scale = 4, accessibilityLabel, decorative = false }: PixelArtProps) {
  const rects = useMemo(() => runs(picture), [picture]);
  // The hide-from-screen-readers props live on a wrapping View: react-native-svg forwards unknown props to
  // the DOM <svg> on web, which React rejects, while React Native Web maps them to aria-hidden on a View.
  const svg = (
    <Svg
      width={picture.w * scale}
      height={picture.h * scale}
      viewBox={`0 0 ${picture.w} ${picture.h}`}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      accessibilityRole={decorative ? undefined : 'image'}
    >
      {rects.map((r, i) => (
        <Rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.color} />
      ))}
    </Svg>
  );
  if (!decorative) return svg;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {svg}
    </View>
  );
}
