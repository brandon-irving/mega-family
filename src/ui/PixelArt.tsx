// Any pixel picture from the shared engine (shared/sprite: the MEGA, the Mega Bucks coin, Store furniture)
// as crisp SVG paths, one per color, keeping hundreds of pixel runs out of the React/native view tree.
import { useMemo } from 'react';
import { View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import type { Picture } from '@shared/sprite';
import { hiddenFromA11y } from './a11y';
import { useContentRect } from './contentRegistry';
import { pixelPaths } from './pixelPaths';

export type PixelArtProps = { picture: Picture; scale?: number; accessibilityLabel?: string; decorative?: boolean };

export function PixelArt({ picture, scale = 4, accessibilityLabel, decorative = false }: PixelArtProps) {
  const paths = useMemo(() => pixelPaths(picture), [picture]);
  // On a walker stage, pictures (Hub, a MEGA on an invite card) are content MEGAs never cover (Oct 28).
  const { ref: contentRef, onLayout: onContentLayout, active: onStage } = useContentRect();
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
      {paths.map(({ color, d }) => (
        <Path key={color} d={d} fill={color} />
      ))}
    </Svg>
  );
  if (!decorative && !onStage) return svg;
  return (
    <View ref={contentRef} onLayout={onContentLayout} collapsable={false} {...(decorative ? hiddenFromA11y() : {})}>
      {svg}
    </View>
  );
}
