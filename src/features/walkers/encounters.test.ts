import { coordinatePoses, type Encounter } from './encounters';
import { createWalker, pose, type Ctx } from './engine';

const context = (now = 100): Ctx => ({ now, ledges: { head: { x: 0, y: 150, w: 300 } }, reduced: false });
function family() {
  return (['teal', 'violet', 'coral'] as const).map((id, i) => ({ ...createWalker(id), hidden: false, x: 100 + 60 * i, y: 150, ledge: 'head', say: `Hi from ${id}` }));
}
const initial = (): Encounter => ({ until: 0, cooldownUntil: 0, pair: null });
const pictures = (walkers: ReturnType<typeof family>, ctx: Ctx) => walkers.map((m) => pose(m, { ...ctx, dipped: new Set(), sayHi: (id) => `Hi ${id}` }));

test('nearby MEGAs turn toward each other, share one greeting, and respect the encounter cooldown', () => {
  const walkers = family();
  const ctx = context();
  const encounter = initial();
  const poses = coordinatePoses(walkers, pictures(walkers, ctx), ctx, encounter, true);
  expect(walkers[0].look?.face).toBe('right');
  expect(walkers[1].look?.face).toBe('left');
  expect(poses.filter((p) => p.say)).toHaveLength(1);
  expect(encounter.pair).toEqual(['teal', 'violet']);
  const expires = encounter.cooldownUntil;
  coordinatePoses(walkers, pictures(walkers, context(2000)), context(2000), encounter, true);
  expect(encounter.cooldownUntil).toBe(expires);
});

test('tapping one character gives that greeting priority and does not create social encounters in still mode', () => {
  const walkers = family();
  const ctx = context();
  walkers[2].react = { t0: 100, until: 2000 };
  const encounter = initial();
  const poses = coordinatePoses(walkers, pictures(walkers, ctx), ctx, encounter, false);
  expect(poses.filter((p) => p.say).map((p) => p.id)).toEqual(['coral']);
  expect(encounter.pair).toBeNull();
});

test('a greeting cannot cover content or another character', () => {
  const walkers = family();
  const ctx = { ...context(), obstacles: { title: { x: 0, y: 50, w: 300, h: 70 } } };
  const poses = coordinatePoses(walkers, pictures(walkers, ctx), ctx, initial(), true);
  expect(poses.every((p) => !p.say)).toBe(true);
});
