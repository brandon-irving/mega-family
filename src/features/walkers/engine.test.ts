// The walking-MEGA engine (Screen 9 boards' behavior, owner Oct 26): MEGAs stand on ledges, walk and hop
// between them, dip pressable ledges, turn toward presses, say hi when tapped, and stand still under
// reduced motion.
import { WALKER_MOTION as M } from '@shared/config/walkers';
import { SIGNIN_SCENES, bx } from '@/features/signin/scenes';
import {
  assignPlan,
  at,
  createWalker,
  FOREVER,
  freeze,
  HIDE,
  hop,
  lookAt,
  pokedLedges,
  pose,
  script,
  SHOW,
  tapWalker,
  tickWalker,
  wait,
  walk,
  weightedLedges,
  type Ctx,
  type Ledges,
  type Walker,
} from './engine';

const LEDGES: Ledges = {
  floor: { x: 24, y: 360, w: 342 },
  make: { x: 24, y: 610, w: 342, pressable: true },
  sheet: { x: 24, y: 478, w: 342 },
};
const sayHi = (id: string) => `Hi! I’m ${id}.`;

function run(m: Walker, ctx: Ctx, ms: number) {
  for (let t = 0; t < ms; t += M.tickMs) {
    ctx.now += M.tickMs;
    tickWalker(m, ctx);
  }
}
const draw = (m: Walker, ctx: Ctx, extra: { dipped?: Set<string> } = {}) => pose(m, { ...ctx, dipped: extra.dipped ?? new Set(), sayHi });

describe('walker engine', () => {
  test('at() places a MEGA on a ledge by fraction of its width; SHOW makes it visible', () => {
    const m = createWalker('teal');
    const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: false };
    assignPlan(m, script([at('floor', 0.5), SHOW, wait(FOREVER)]), ctx);
    expect(m.x).toBeCloseTo(24 + 171);
    expect(m.y).toBe(360);
    expect(draw(m, ctx).visible).toBe(true);
  });

  test('walking moves along the ledge at the configured speed and alternates step frames', () => {
    const m = createWalker('teal');
    const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: false };
    assignPlan(m, script([at('floor', 0), SHOW, walk(1)]), ctx);
    const x0 = m.x;
    const frames = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ctx.now += M.tickMs;
      tickWalker(m, ctx);
      frames.add(draw(m, ctx).frame);
    }
    expect(m.x - x0).toBe(20 * M.speed);
    expect(m.face).toBe('right');
    expect(frames).toEqual(new Set(['stand', 'stepL', 'stepR']));
  });

  test('a hop lands exactly on the target ledge; hopping up arcs above the higher ledge', () => {
    const m = createWalker('teal');
    const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: false };
    assignPlan(m, script([at('make', 0.2), SHOW, hop('floor', 0.8), wait(FOREVER)]), ctx);
    let highest = Infinity;
    for (let i = 0; i < 40; i++) {
      ctx.now += M.tickMs;
      tickWalker(m, ctx);
      highest = Math.min(highest, m.y);
    }
    expect(m.ledge).toBe('floor');
    expect(m.y).toBe(360);
    expect(m.x).toBeCloseTo(24 + 342 * 0.8);
    expect(highest).toBeLessThan(360); // the arc clears the ledge it lands on
  });

  test('ledge selection: a MEGA standing on a pressable ledge dips it; one on a plain ledge does not', () => {
    const a = createWalker('teal');
    const b = createWalker('coral');
    const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: false };
    assignPlan(a, script([at('make', 0.5), SHOW, wait(FOREVER)]), ctx);
    assignPlan(b, script([at('floor', 0.5), SHOW, wait(FOREVER)]), ctx);
    const dipped = weightedLedges([a, b], LEDGES);
    expect([...dipped]).toEqual(['make']);
    // The MEGA rides the dip down with the button.
    expect(draw(a, ctx, { dipped }).y).toBe(610 + M.dip);
    expect(draw(b, ctx, { dipped }).y).toBe(360);
  });

  test('off the end of a ledge (walking in from off-screen) does not dip it', () => {
    const m = createWalker('teal');
    const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: false };
    assignPlan(m, script([at('make', 1.2), SHOW, wait(FOREVER)]), ctx);
    expect(weightedLedges([m], LEDGES).size).toBe(0);
  });

  test('a wait with poke lights up that element', () => {
    const m = createWalker('teal');
    const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: false };
    assignPlan(m, script([at('make', 0.8), SHOW, wait(2000, { poke: 'make', emote: '!' })]), ctx);
    expect([...pokedLedges([m])]).toEqual(['make']);
    expect(draw(m, ctx).emote).toBe('!');
  });

  test('tap → the MEGA faces you, looks happy, bounces and says hi, then carries on', () => {
    const m = createWalker('violet');
    const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: false };
    assignPlan(m, script([at('floor', 0), SHOW, walk(1)]), ctx);
    run(m, ctx, 200);
    tapWalker(m, ctx.now);
    const xAtTap = m.x;
    ctx.now += M.react.bounceMs / 2;
    const p = draw(m, ctx);
    expect(p.say).toBe('Hi! I’m violet.');
    expect(p.view).toBe('front');
    expect(p.expression).toBe('happy');
    expect(p.y).toBeLessThan(360); // mid-bounce
    run(m, ctx, M.react.ms / 2); // paused while reacting
    expect(m.x).toBe(xAtTap);
    run(m, ctx, M.react.ms);
    expect(m.x).toBeGreaterThan(xAtTap);
    expect(draw(m, ctx).say).toBe('');
  });

  test('a press makes everyone turn toward it', () => {
    const left = createWalker('teal');
    const right = createWalker('coral');
    const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: false };
    assignPlan(left, script([at('floor', 0.1), SHOW, wait(FOREVER)]), ctx);
    assignPlan(right, script([at('floor', 0.9), SHOW, wait(FOREVER)]), ctx);
    lookAt([left, right], { x: 195, y: 620 }, ctx.now);
    expect(draw(left, ctx).view).toBe('right');
    expect(draw(right, ctx).view).toBe('left');
  });

  test('reduced motion: walks and hops finish instantly, the MEGA stands still, and nothing bounces', () => {
    const m = createWalker('teal');
    const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: true };
    assignPlan(m, script([at('floor', 0), SHOW, walk(0.5), hop('make', 0.7), wait(500, { say: 'hello' }), walk(0.1)]), ctx);
    expect(m.ledge).toBe('make');
    expect(m.x).toBeCloseTo(24 + 342 * 0.7);
    const x = m.x;
    run(m, ctx, 10_000); // the wait never ends under reduced motion
    expect(m.x).toBe(x);
    expect(draw(m, ctx).say).toBe(''); // scripted chatter is off
    tapWalker(m, ctx.now);
    ctx.now += M.react.bounceMs / 2;
    const p = draw(m, ctx);
    expect(p.y).toBe(610 + 0); // no bounce
    expect(p.say).toBe('Hi! I’m teal.'); // a tap still says hi
  });

  test('a ledge that has not been measured yet blocks the script until it appears', () => {
    const m = createWalker('teal');
    const ledges: Ledges = { floor: LEDGES.floor };
    const ctx: Ctx = { now: 0, ledges, reduced: false };
    assignPlan(m, script([at('floor', 0.5), SHOW, hop('sheet', 0.5), wait(FOREVER)]), ctx);
    run(m, ctx, 400);
    expect(m.ledge).toBe('floor');
    expect(draw(m, ctx).visible).toBe(true);
    ledges.sheet = LEDGES.sheet;
    run(m, ctx, 1200);
    expect(m.ledge).toBe('sheet');
  });

  test('freeze hides a MEGA the sheet slid over, and keeps one above it', () => {
    const below = createWalker('coral');
    const above = createWalker('violet');
    const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: false };
    assignPlan(below, script([at('make', 0.5), SHOW, freeze('sheet')]), ctx);
    assignPlan(above, script([at('floor', 0.5), SHOW, freeze('sheet')]), ctx);
    expect(below.hidden).toBe(true);
    expect(above.hidden).toBe(false);
  });

  test('scripts loop from their loop index; HIDE keeps a MEGA off screen', () => {
    const m = createWalker('teal');
    const ctx: Ctx = { now: 0, ledges: LEDGES, reduced: false };
    assignPlan(m, script([at('floor', 0), SHOW, wait(100), HIDE, wait(100)], 2), ctx);
    run(m, ctx, 120);
    expect(m.hidden).toBe(true);
    run(m, ctx, 120);
    expect(m.i).toBe(2); // back to the first wait, still hidden (SHOW is before the loop point)
  });
});

describe('sign-in scenes', () => {
  test('board x converts to ledge fractions (24pt margins on a 390pt board)', () => {
    expect(bx(24)).toBe(0);
    expect(bx(366)).toBe(1);
  });

  test('every scene only uses ledges the sign-in screens mark', () => {
    const marked = new Set(['floor', 'head', 'make', 'invite', 'signin', 'sheet', 'field', 'cont', 'card', 'lock', 'start', 'join', 'opening']);
    for (const [name, scene] of Object.entries(SIGNIN_SCENES)) {
      for (const s of Object.values(scene)) {
        for (const a of s!.acts) {
          const ledge = 'at' in a ? a.at.ledge : 'hop' in a ? a.hop.ledge : 'freeze' in a ? a.freeze : null;
          if (ledge) expect([name, marked.has(ledge)]).toEqual([name, true]);
        }
      }
    }
  });

  test('the welcome scene runs for a minute without getting stuck (every MEGA keeps moving or waiting)', () => {
    const ledges: Ledges = {
      floor: { x: 24, y: 360, w: 342 }, head: { x: 24, y: 411, w: 342 }, make: { x: 24, y: 610, w: 342, pressable: true },
      invite: { x: 24, y: 682, w: 342 }, signin: { x: 24, y: 794, w: 342 },
    };
    const ctx: Ctx = { now: 0, ledges, reduced: false };
    const ms = (['teal', 'coral', 'violet'] as const).map((id) => {
      const m = createWalker(id);
      assignPlan(m, SIGNIN_SCENES.welcome[id], ctx);
      return m;
    });
    const seen = new Set<string>();
    for (let t = 0; t < 60_000; t += M.tickMs) {
      ctx.now += M.tickMs;
      for (const m of ms) {
        tickWalker(m, ctx);
        if (!m.hidden) seen.add(`${m.id}:${m.ledge}`);
      }
    }
    for (const m of ms) expect(m.blocked).toBe(false);
    // Teal reaches the button, Zap climbs the wordmark, Coral visits the "Sign in" row.
    expect([...seen]).toEqual(expect.arrayContaining(['teal:make', 'violet:head', 'coral:signin']));
  });
});
