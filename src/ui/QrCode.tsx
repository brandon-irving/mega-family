// A QR code drawn in code (G5 UX review, Oct 29): qrcode-generator (pure JS, MIT) encodes the text into a grid
// of modules and react-native-svg draws each dark run as one rect, like PixelArt. Dark modules on a light
// tile with the 4-module quiet zone the QR spec asks for, in the theme's two contrast colors (CONTRAST_TEXT),
// so phone cameras read it on any theme.
import { useMemo } from 'react';
import { View } from 'react-native';
import { Rect, Svg } from 'react-native-svg';
import makeQr from 'qrcode-generator';
import { CONTRAST_TEXT } from '@shared/config/theme';

/** Quiet zone around the code, in modules (ISO/IEC 18004 asks for 4). */
const QUIET = 4;

/** `text` as rows of modules (true = dark). Error correction M: still reads with a smudge or a glare. */
export function qrMatrix(text: string): boolean[][] {
  const qr = makeQr(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

export function QrCode({ value, size, accessibilityLabel }: { value: string; size: number; accessibilityLabel: string }) {
  const runs = useMemo(() => {
    const m = qrMatrix(value);
    const out: { x: number; y: number; w: number }[] = [];
    m.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (!row[x]) {
          x += 1;
          continue;
        }
        const start = x;
        while (x < row.length && row[x]) x += 1;
        out.push({ x: start + QUIET, y: y + QUIET, w: x - start });
      }
    });
    return { runs: out, side: m.length + QUIET * 2 };
  }, [value]);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${runs.side} ${runs.side}`}>
        <Rect x={0} y={0} width={runs.side} height={runs.side} fill={CONTRAST_TEXT.light} />
        {runs.runs.map((r, i) => (
          <Rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={CONTRAST_TEXT.dark} />
        ))}
      </Svg>
    </View>
  );
}
