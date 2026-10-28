// The walking-MEGA engine: pure logic, no React. Ported from the approved Screen 9 boards
// (design/build/Login.template.html, `scene`/`begin`/`tick`/`lookAt`/`renderVals`) with one change for a
// real, responsive layout: positions are given along *ledges* (the measured top edges of elements: a button,
// a card, the wordmark) as a fraction of the ledge's width, instead of the boards' fixed 390pt coordinates.
// `WalkerStage` (./WalkerStage.tsx) measures the ledges, steps this engine on a timer and draws the result;
// HQ (G5) reuses both.
import { WALKER_MOTION as M, type WalkerId } from '@shared/config/walkers';

/** A ledge: the top edge of an element, in stage coordinates. `pressable` ledges dip while stood on. */
export type LedgeRect = { x: number; y: number; w: number; pressable?: boolean };
export type Ledges = Record<string, LedgeRect>;
export type Face = 'front' | 'back' | 'left' | 'right';

type WaitOpts = { face?: Face; emote?: string; happy?: boolean; say?: string; poke?: string };
export type Act =
  | { at: { ledge: string; f: number }; face: Face }
  | { walk: number }
  | { hop: { ledge: string; f: number } }
  | ({ wait: number } & WaitOpts)
  | { show: true }
  | { hide: true }
  | { layer: 'top' | 'base' }
  /** Stay put for good, but hide if standing below ledge `below` (a sheet sliding up over the MEGA). */
  | { freeze: string };
/** A MEGA's plan for a screen. Plays `acts` in order, then loops from `loop` (past the end = stay put). */
export type Script = { acts: Act[]; loop: number };
export type Scene = Partial<Record<WalkerId, Script>>;

// Script builders, mirroring the boards' DSL. Fractions run along the ledge's width; <0 or >1 is off its ends
// (OFF_LEFT/OFF_RIGHT walk a MEGA in from, or out past, the screen's edges).
export const OFF_LEFT = -0.25;
export const OFF_RIGHT = 1.25;
export const at = (ledge: string, f: number, face: Face = 'front'): Act => ({ at: { ledge, f }, face });
export const walk = (f: number): Act => ({ walk: f });
export const hop = (ledge: string, f: number): Act => ({ hop: { ledge, f } });
export const wait = (ms: number, opts: WaitOpts = {}): Act => ({ wait: ms, face: 'front', ...opts });
export const SHOW: Act = { show: true };
export const HIDE: Act = { hide: true };
export const ON_TOP: Act = { layer: 'top' };
export const freeze = (below: string): Act => ({ freeze: below });
export const script = (acts: Act[], loop: number = acts.length): Script => ({ acts, loop });
export const FOREVER = M.forever;

export type Walker = {
  id: WalkerId;
  x: number;
  y: number;
  ledge: string | null;
  face: Face;
  walked: number;
  hidden: boolean;
  layer: 'top' | 'base';
  plan: Script;
  i: number;
  cur: Act | null;
  /** Waiting for a ledge that hasn't been measured yet (it stays where it is until the ledge appears). */
  blocked: boolean;
  until: number;
  walkTo: number;
  hopping: { x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; lift: number; ledge: string } | null;
  react: { t0: number; until: number } | null;
  look: { until: number; face: Face } | null;
  emote: string;
  happy: boolean;
  say: string;
  poke: string;
};

/** A measured content rect (text, input, button, card) MEGAs must never be drawn over (owner, Oct 28). */
export type Rect = { x: number; y: number; w: number; h: number };
export type Ctx = { now: number; ledges: Ledges; reduced: boolean; obstacles?: Record<string, Rect> };

export function createWalker(id: WalkerId): Walker {
  return {
    id, x: 0, y: 0, ledge: null, face: 'front', walked: 0, hidden: true, layer: 'base',
    plan: script([HIDE]), i: 0, cur: null, blocked: false, until: 0, walkTo: 0, hopping: null, react: null, look: null,
    emote: '', happy: false, say: '', poke: '',
  };
}

const xOn = (l: LedgeRect, f: number) => l.x + l.w * f;

/** Give a MEGA a new plan for this screen and start it. */
export function assignPlan(m: Walker, plan: Script | undefined, ctx: Ctx): void {
  Object.assign(m, { plan: plan ?? script([HIDE]), i: 0, cur: null, hopping: null, react: null, look: null, blocked: false });
  begin(m, ctx);
}

/** Start the current action, running instant ones (teleport, show, hide, layer) straight through. */
function begin(m: Walker, { now, ledges, reduced }: Ctx): void {
  Object.assign(m, { emote: '', happy: false, say: '', poke: '', blocked: false });
  for (let guard = 0; guard < 50; guard++) {
    if (m.i >= m.plan.acts.length) {
      if (m.plan.loop < m.plan.acts.length) m.i = m.plan.loop;
      else {
        m.cur = null;
        return;
      }
    }
    const a = m.plan.acts[m.i];
    if ('at' in a) {
      const l = ledges[a.at.ledge];
      if (!l) return block(m, a);
      Object.assign(m, { x: xOn(l, a.at.f), y: l.y, ledge: a.at.ledge, face: a.face, layer: 'base' });
      m.i++;
      continue;
    }
    if ('show' in a) { m.hidden = false; m.i++; continue; }
    if ('hide' in a) { m.hidden = true; m.i++; continue; }
    if ('layer' in a) { m.layer = a.layer; m.i++; continue; }
    if ('freeze' in a) {
      const l = ledges[a.freeze];
      if (!l) return block(m, a);
      if (m.y > l.y) m.hidden = true;
      Object.assign(m, { face: 'front', cur: a, until: now + FOREVER });
      return;
    }
    if ('walk' in a) {
      const l = m.ledge ? ledges[m.ledge] : undefined;
      if (!l) return block(m, a);
      const to = xOn(l, a.walk);
      if (reduced) { m.x = to; m.i++; continue; }
      Object.assign(m, { walkTo: to, face: to > m.x ? 'right' : 'left', cur: a });
      return;
    }
    if ('hop' in a) {
      const l = ledges[a.hop.ledge];
      if (!l) return block(m, a);
      const x1 = xOn(l, a.hop.f);
      const y1 = l.y;
      if (reduced) { Object.assign(m, { x: x1, y: y1, ledge: a.hop.ledge }); m.i++; continue; }
      const dist = Math.hypot(x1 - m.x, y1 - m.y);
      m.hopping = {
        x0: m.x, y0: m.y, x1, y1, t0: now, ledge: a.hop.ledge,
        dur: Math.min(M.hop.maxMs, M.hop.minMs + dist * M.hop.msPerPoint),
        lift: M.hop.lift + Math.max(0, m.y - y1) * M.hop.liftPerPointUp,
      };
      if (Math.abs(x1 - m.x) > 2) m.face = x1 > m.x ? 'right' : 'left';
      m.cur = a;
      return;
    }
    if ('wait' in a) {
      // Under reduced motion a hidden MEGA never waits its way back on; a shown one simply stands still.
      if (reduced && m.hidden) { m.i++; continue; }
      Object.assign(m, {
        cur: a, until: now + (reduced ? FOREVER : a.wait),
        face: a.face ?? 'front', emote: a.emote ?? '', happy: !!a.happy, say: reduced ? '' : a.say ?? '', poke: a.poke ?? '',
      });
      return;
    }
    m.i++;
  }
}

function block(m: Walker, a: Act) {
  m.cur = a;
  m.blocked = true;
}

function next(m: Walker, ctx: Ctx) {
  m.i++;
  begin(m, ctx);
}

/** One engine step for one MEGA. */
export function tickWalker(m: Walker, ctx: Ctx): void {
  const { now, ledges } = ctx;
  if (m.blocked) return begin(m, ctx); // retry once the ledge has been measured
  if (!m.cur) return;
  // A MEGA reacting to a tap, or looking at a press, pauses whatever it was doing (and its clocks with it).
  const paused = (m.react && now < m.react.until) || (m.look && now < m.look.until);
  if (paused) {
    m.until += M.tickMs;
    if (m.hopping) m.hopping.t0 += M.tickMs;
    return;
  }
  m.react = null;
  m.look = null;
  // Standing MEGAs ride their ledge if the layout moves (keyboard, rotation, a sheet).
  if (!m.hopping && m.ledge && ledges[m.ledge]) m.y = ledges[m.ledge].y;
  if ('walk' in m.cur) {
    const d = m.walkTo - m.x;
    const s = Math.sign(d) * Math.min(M.speed, Math.abs(d));
    m.x += s;
    m.walked += Math.abs(s);
    if (Math.abs(m.walkTo - m.x) < 0.01) { m.x = m.walkTo; next(m, ctx); }
  } else if (m.hopping) {
    const h = m.hopping;
    const t = Math.min(1, (now - h.t0) / h.dur);
    m.x = h.x0 + (h.x1 - h.x0) * t;
    m.y = h.y0 + (h.y1 - h.y0) * t - h.lift * 4 * t * (1 - t);
    if (t >= 1) {
      Object.assign(m, { x: h.x1, y: h.y1, ledge: h.ledge, hopping: null });
      next(m, ctx);
    }
  } else if (now >= m.until) next(m, ctx);
}

/** Tapping a MEGA: it turns to face you, bounces once and says hi. */
export function tapWalker(m: Walker, now: number): void {
  m.react = { t0: now, until: now + M.react.ms };
}

/** Everyone turns toward whatever was just pressed. */
export function lookAt(walkers: Walker[], point: { x: number; y: number }, now: number): void {
  for (const m of walkers) {
    if (m.hidden || m.hopping) continue;
    const face: Face = point.x < m.x - 20 ? 'left' : point.x > m.x + 20 ? 'right' : point.y < m.y ? 'back' : 'front';
    m.look = { until: now + M.lookMs, face };
  }
}

/** Which pressable ledges have a MEGA standing on them right now (they dip, like a pressed button). */
export function weightedLedges(walkers: Walker[], ledges: Ledges): Set<string> {
  const out = new Set<string>();
  for (const m of walkers) {
    if (m.hidden || m.hopping || !m.ledge) continue;
    const l = ledges[m.ledge];
    if (l?.pressable && m.x >= l.x && m.x <= l.x + l.w) out.add(m.ledge);
  }
  return out;
}

/** Which ledges a MEGA is pointing at ("poke" in a wait): the element under it lights up. */
export function pokedLedges(walkers: Walker[]): Set<string> {
  return new Set(walkers.filter((m) => !m.hidden && m.poke).map((m) => m.poke));
}

/** The boxes a MEGA standing with its feet at (x, y) draws: sprite, speech bubble (for `say`) and emote. */
export function spriteRect(x: number, y: number): Rect {
  return { x: x - M.sprite.w / 2, y: y - M.sprite.h, w: M.sprite.w, h: M.sprite.h };
}
export function bubbleRect(x: number, y: number, say: string): Rect {
  const w = Math.max(M.bubble.minW, say.length * M.bubble.charW + M.bubble.padX);
  return { x: x - w / 2, y: y - M.hitSize - M.bubble.gap - M.bubble.h, w, h: M.bubble.h };
}
export function emoteRect(x: number, y: number): Rect {
  return { x: x - M.emote.w / 2, y: y - M.hitSize - M.emote.rise, w: M.emote.w, h: M.emote.h };
}
/** Two rects overlap by more than the tolerance on both axes. */
export function overlaps(a: Rect, b: Rect, tol: number = M.tolerance): boolean {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > tol && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > tol;
}
export function coversContent(r: Rect, obstacles: Record<string, Rect> | undefined): boolean {
  if (!obstacles) return false;
  for (const k in obstacles) if (overlaps(r, obstacles[k])) return true;
  return false;
}

export type Pose = {
  id: WalkerId;
  visible: boolean;
  /** Hidden this step only because its body would cover content: hide at once (no fade over the content). */
  covered: boolean;
  /** Feet position in stage coordinates (the sprite is drawn above it). */
  x: number;
  y: number;
  view: Face;
  frame: 'stand' | 'stepL' | 'stepR';
  expression: 'open' | 'happy';
  say: string;
  emote: string;
  top: boolean;
};

/** What to draw for a MEGA this step. `sayHi` turns a name into the tap greeting (copy lives in config). */
export function pose(m: Walker, ctx: Ctx & { dipped: Set<string>; sayHi: (id: WalkerId) => string; busy?: boolean }): Pose {
  const { now, reduced } = ctx;
  const r = m.react && now < m.react.until ? m.react : null;
  const look = m.look && now < m.look.until ? m.look : null;
  const walking = !!m.cur && 'walk' in m.cur && !r && !look && !m.blocked;
  const view: Face = r ? 'front' : look ? look.face : m.face;
  const p = m.walked % M.stride;
  const quarter = M.stride / 4;
  const frame = m.hopping ? 'stepL' : walking && p >= quarter && p < 3 * quarter ? (Math.floor(m.walked / M.stride) % 2 ? 'stepR' : 'stepL') : 'stand';
  const happy = r ? true : m.happy;
  const rt = r ? now - r.t0 : Infinity;
  const bounce = !reduced && rt < M.react.bounceMs ? -M.react.bounce * Math.sin((Math.PI * rt) / M.react.bounceMs) : 0;
  const onDip = !m.hopping && !!m.ledge && ctx.dipped.has(m.ledge);
  // Never over content (owner, Oct 28): checked at the MEGA's own spot (dips and bounces are a few points of
  // motion, not where it stands). A bubble or emote that would overlap is dropped; a body that would, hides.
  const covered = !m.hidden && coversContent(spriteRect(m.x, m.y), ctx.obstacles);
  const rawSay = r ? ctx.sayHi(m.id) : m.say;
  const say = rawSay && !coversContent(bubbleRect(m.x, m.y, rawSay), ctx.obstacles) ? rawSay : '';
  const rawEmote = ctx.busy ? '…' : look ? '!' : r ? '' : m.emote;
  const emote = rawEmote && !coversContent(emoteRect(m.x, m.y), ctx.obstacles) ? rawEmote : '';
  return {
    id: m.id,
    visible: !m.hidden && !covered,
    covered,
    x: m.x,
    y: m.y + (onDip ? M.dip : 0) + bounce,
    view,
    frame,
    expression: view === 'front' && frame === 'stand' && happy ? 'happy' : 'open',
    say,
    emote: say ? '' : emote,
    top: m.layer === 'top',
  };
}
