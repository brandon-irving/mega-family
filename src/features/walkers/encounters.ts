import { WALKER_CAST, type WalkerId } from '@shared/config/walkers';
import { bubbleRect, coversContent, overlaps, spriteRect, type Ctx, type Pose, type Walker } from './engine';

/** One bounded scene encounter, with a cooldown, rather than a timer for each pair. */
export type Encounter = { until: number; cooldownUntil: number; pair: [WalkerId, WalkerId] | null };

export function coordinatePoses(walkers: Walker[], poses: Pose[], ctx: Ctx, encounter: Encounter, social: boolean): Pose[] {
  if (social && ctx.now >= encounter.cooldownUntil && !walkers.some((m) => m.react)) {
    outer: for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
      const a = walkers[i];
      const b = walkers[j];
      const distance = Math.abs(a.x - b.x);
      if (a.hidden || b.hidden || a.hopping || b.hopping || !a.ledge || a.ledge !== b.ledge || distance < 38 || distance > 72) continue;
      if (!poses[i].visible || !poses[j].visible) continue;
      encounter.pair = [a.id, b.id];
      encounter.until = ctx.now + 1400;
      encounter.cooldownUntil = ctx.now + 10000;
      a.look = { until: encounter.until, face: a.x < b.x ? 'right' : 'left' };
      b.look = { until: encounter.until, face: a.x < b.x ? 'left' : 'right' };
      break outer;
    }
  }
  const pair = social && ctx.now < encounter.until ? encounter.pair : null;
  const tapped = walkers.find((m) => m.react && ctx.now < m.react.until)?.id;
  let spoken = false;
  let speechBox: ReturnType<typeof bubbleRect> | null = null;
  const result = poses.map((p) => {
    const greeting = pair?.[0] === p.id ? `Hi, ${WALKER_CAST[pair[1]].name}!` : '';
    const rawSay = tapped && tapped !== p.id ? '' : greeting || p.say;
    const box = bubbleRect(p.x, p.y, rawSay);
    const obstructed = coversContent(box, ctx.obstacles) || poses.some((other) => other.id !== p.id && other.visible && overlaps(box, spriteRect(other.x, other.y)));
    const say = p.visible && !spoken && !obstructed ? rawSay : '';
    if (say) { spoken = true; speechBox = box; }
    return { ...p, say, emote: say ? '' : pair?.[1] === p.id ? '♪' : p.emote };
  });
  // Keep another character's tiny reaction from drawing over the one visible greeting.
  return result.map((p) => speechBox && !p.say && p.emote && overlaps(speechBox, { x: p.x - 12, y: p.y - 70, w: 24, h: 24 }) ? { ...p, emote: '' } : p);
}
