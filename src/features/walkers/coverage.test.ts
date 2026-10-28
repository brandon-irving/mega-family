// Owner, Oct 28: "Megas should never be covering content". A MEGA (its sprite, speech bubble and emote) is
// never drawn over measured content: text, inputs, buttons, cards. Standing on a ledge is fine (the ledge's
// own element is below its feet); anything that would overlap is hidden instead (the bubble or emote first,
// the MEGA itself if its body would cover something).
import { WALKER_MOTION as M } from '@shared/config/walkers';
import { assignPlan, at, createWalker, pose, script, SHOW, wait, type Ctx, type Rect, FOREVER } from './engine';

const sayHi = (id: string) => `Hi! I’m ${id}.`;
const LEDGES = { make: { x: 24, y: 600, w: 342, pressable: true } };

function standingAt(f: number, obstacles: Record<string, Rect>, opts: { say?: string; emote?: string } = {}) {
  const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: false, obstacles };
  const m = createWalker('teal');
  assignPlan(m, script([at('make', f), SHOW, wait(FOREVER, opts)]), ctx);
  return pose(m, { ...ctx, dipped: new Set(), sayHi });
}

describe('MEGAs never cover content', () => {
  test('standing on a button whose own rect is below the feet: visible', () => {
    const p = standingAt(0.5, { make: { x: 24, y: 600, w: 342, h: 56 } });
    expect(p.visible).toBe(true);
    expect(p.covered).toBe(false);
  });

  test('a caption just above the button, inside the sprite box: the MEGA is hidden', () => {
    // Sprite is 40 tall: feet at 600 cover y 560–600. A caption at 570–586 overlaps it.
    const p = standingAt(0.5, { make: { x: 24, y: 600, w: 342, h: 56 }, caption: { x: 24, y: 570, w: 342, h: 16 } });
    expect(p.visible).toBe(false);
    expect(p.covered).toBe(true);
  });

  test('content off to the side of the sprite does not hide it', () => {
    // MEGA at x = 24 + 342 * 0.9 ≈ 332; a label on the left half (24–180) at the same height is clear.
    const p = standingAt(0.9, { label: { x: 24, y: 570, w: 156, h: 16 } });
    expect(p.visible).toBe(true);
  });

  test('a speech bubble that would overlap content is dropped, the MEGA stays', () => {
    // Bubble sits above the hit box (feet − 48 and up, ~24 tall): y 528–552. Text at 535–550 overlaps it only.
    const p = standingAt(0.5, { heading: { x: 24, y: 535, w: 342, h: 15 } }, { say: 'Hi! I’m Teal.' });
    expect(p.visible).toBe(true);
    expect(p.say).toBe('');
  });

  test('an emote that would overlap content is dropped, the MEGA stays', () => {
    // The emote sits just above the 44pt hit box: y ≈ 542–558.
    const p = standingAt(0.5, { heading: { x: 24, y: 545, w: 342, h: 10 } }, { emote: '!' });
    expect(p.visible).toBe(true);
    expect(p.emote).toBe('');
  });

  test('a bubble with clear space keeps its words', () => {
    const p = standingAt(0.5, {}, { say: 'Hi! I’m Teal.' });
    expect(p.say).toBe('Hi! I’m Teal.');
  });

  test('sprite box matches the config sprite size', () => {
    // Content touching exactly the sprite's top edge (no overlap) is fine.
    const top = 600 - M.sprite.h;
    const p = standingAt(0.5, { above: { x: 24, y: top - 20, w: 342, h: 20 } });
    expect(p.visible).toBe(true);
  });
});
