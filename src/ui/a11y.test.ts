// GD UX review HIGH: on web, React logged "does not recognize the `importantForAccessibility` /
// `accessibilityElementsHidden` prop on a DOM element" on every chat screen (the composer's icons spread
// them onto react-native-svg's <svg>, which forwards unknown props to the DOM). One helper decides the
// platform's way to hide decoration from screen readers, and nothing else in src/ sets the native-only props.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { Platform } from 'react-native';
import { hiddenFromA11y } from './a11y';

const SRC = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

describe('hiddenFromA11y', () => {
  const realOS = Platform.OS;
  afterEach(() => {
    Platform.OS = realOS;
  });

  test('on web it is only aria-hidden, never the native-only props', () => {
    Platform.OS = 'web';
    expect(hiddenFromA11y()).toEqual({ 'aria-hidden': true });
    expect(hiddenFromA11y(false)).toEqual({});
  });

  test('on iOS and Android it uses the native props', () => {
    Platform.OS = 'ios';
    expect(hiddenFromA11y()).toEqual({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
    expect(hiddenFromA11y(false)).toEqual({ accessibilityElementsHidden: false, importantForAccessibility: 'auto' });
  });
});

test('no component sets the native-only hide props directly (they leak onto DOM elements on web)', () => {
  const offenders = files(SRC)
    .filter((f) => !f.endsWith(join('ui', 'a11y.ts')))
    .filter((f) => /importantForAccessibility|accessibilityElementsHidden/.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(SRC.length + 1));
  expect(offenders).toEqual([]);
});
