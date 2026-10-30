import { runs, type Picture } from '@shared/sprite';

/** A single SVG path per color, with one closed rectangle per horizontal run. Runs never overlap, so
 * combining them preserves every pixel while avoiding hundreds of React/native SVG nodes per sprite. */
export function pixelPaths(picture: Picture): { color: string; d: string }[] {
  const byColor = new Map<string, string[]>();
  for (const { x, y, w, color } of runs(picture)) {
    const commands = byColor.get(color) ?? [];
    commands.push(`M${x} ${y}h${w}v1h-${w}z`);
    byColor.set(color, commands);
  }
  return Array.from(byColor, ([color, commands]) => ({ color, d: commands.join('') }));
}
