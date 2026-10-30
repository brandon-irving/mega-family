// GD live check: on web, react-native-svg forwards unknown props to the DOM <svg>, so the native-only
// accessibility props must sit on a wrapping View (React Native Web maps them to aria-hidden there), never on
// the Svg — or React logs "does not recognize the accessibilityElementsHidden prop" into the dev overlay.
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { renderWithTheme } from '@/test/renderWithTheme';
import { PixelArt } from './PixelArt';
import { renderMega } from '@shared/sprite';

const picture = { w: 2, h: 1, px: ['#000000', '#FFFFFF'] };

type Node = ReactTestRendererJSON;
function nodes(n: Node | Node[] | null): Node[] {
  if (!n) return [];
  if (Array.isArray(n)) return n.flatMap(nodes);
  return [n, ...((n.children ?? []).filter((c): c is Node => typeof c !== 'string').flatMap(nodes))];
}

describe('PixelArt accessibility props', () => {
  test('a sprite keeps its size and accessible label with one drawing node per color', async () => {
    const view = await renderWithTheme(<PixelArt picture={renderMega({ shell: '#2FB8B0', sticker: 'none' })} scale={2} accessibilityLabel="Teal" />);
    const all = nodes(view.toJSON() as Node | Node[] | null);
    const svg = all.find((n) => n.props.accessibilityLabel === 'Teal');
    expect(svg?.props).toEqual(expect.objectContaining({ bbWidth: 64, bbHeight: 80, vbWidth: 32, vbHeight: 40, accessibilityRole: 'image' }));
    expect(all.filter((n) => n.type === 'RNSVGPath')).toHaveLength(14);
    expect(all.filter((n) => n.type === 'RNSVGRect')).toHaveLength(0);
  });

  test('a decorative picture hides itself on a wrapping View, not on the Svg', async () => {
    const view = await renderWithTheme(<PixelArt picture={picture} decorative />);
    const all = nodes(view.toJSON() as Node | Node[] | null);
    const svg = all.filter((n) => /svg/i.test(n.type));
    expect(svg.length).toBeGreaterThan(0);
    for (const n of svg) {
      expect(n.props.accessibilityElementsHidden).toBeUndefined();
      expect(n.props.importantForAccessibility).toBeUndefined();
    }
    const hidden = all.find((n) => n.props.accessibilityElementsHidden === true);
    expect(hidden?.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
