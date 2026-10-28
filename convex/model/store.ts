// GD (CONTRACT v0.13): the Store's ownership rules (shared/config/store.ts STORE_RULES). The Store is
// kids-only; adults' looks and rooms stay unrestricted. A kid owns: every free (price 0) item, whatever they
// bought, and the look their MEGA already had (its sticker, shell color and parts). `megas.update` and
// `rooms.update` call these so a kid can only wear or place what they own (invariant 6).
import { COLORS } from '../../shared/config/looks';
import { STORE_CATALOG, STORE_RULES, storeSectionOf, type StoreItemId } from '../../shared/config/store';
import { STORE_ITEM_IDS } from '../../shared/config/ids';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { balanceOf } from './bucks';
import { fail } from './errors';

type Ctx = QueryCtx | MutationCtx;
type Look = Doc<'megas'>['look'];

export async function purchasedItemIds(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>): Promise<Set<StoreItemId>> {
  const rows = await ctx.db
    .query('purchases')
    .withIndex('by_family_member', (q) => q.eq('familyId', familyId).eq('memberId', memberId))
    .collect();
  return new Set(rows.map((r) => r.itemId));
}

/** The catalog id an item on a MEGA's look corresponds to, for each look part (null = a free default). */
function lookItemIds(look: Look): StoreItemId[] {
  const ids: string[] = [];
  const color = Object.entries(STORE_CATALOG).find(([id, e]) => storeSectionOf(id as StoreItemId) === 'color' && 'hex' in e && e.hex.toLowerCase() === look.hex.toLowerCase());
  if (color) ids.push(color[0]);
  if (look.sticker !== 'none') ids.push(`sticker:${look.sticker}`);
  if (look.antenna && look.antenna !== 'classic') ids.push(`antenna:${look.antenna}`);
  if (look.eyes && look.eyes !== 'classic') ids.push(`eyes:${look.eyes}`);
  if (look.eyeColor && look.eyeColor !== 'classic') ids.push(`eyeColor:${look.eyeColor}`);
  return ids.filter((id): id is StoreItemId => (STORE_ITEM_IDS as readonly string[]).includes(id));
}

/** Everything a kid owns: free items, purchases, and (STORE_RULES.ownsCurrentLookAtStart) what their MEGA
 * is wearing now — so a kid never loses the sticker their MEGA was made with. */
export async function ownedItemIds(ctx: Ctx, familyId: Id<'families'>, memberId: Id<'members'>, mega: Doc<'megas'> | null): Promise<Set<StoreItemId>> {
  const owned = await purchasedItemIds(ctx, familyId, memberId);
  for (const id of STORE_ITEM_IDS) if (STORE_CATALOG[id].price === 0) owned.add(id);
  if (STORE_RULES.ownsCurrentLookAtStart && mega) for (const id of lookItemIds(mega.look)) owned.add(id);
  return owned;
}

export async function catalogFor(ctx: Ctx, kid: Doc<'members'>, mega: Doc<'megas'> | null) {
  const owned = await ownedItemIds(ctx, kid.familyId, kid._id, mega);
  const wearing = new Set(mega ? lookItemIds(mega.look) : []);
  const items = STORE_ITEM_IDS.map((id) => {
    const entry = STORE_CATALOG[id] as { label: string; price: number; hex?: string };
    return { id, label: entry.label, price: entry.price, hex: entry.hex, owned: owned.has(id), wearing: wearing.has(id) };
  });
  return { balance: await balanceOf(ctx, kid.familyId, kid._id), items };
}

/** The kid buys one item: refused if already owned or the balance is short. The purchase and its ledger
 * spend are written in this one mutation (atomic). */
export async function buyItem(ctx: MutationCtx, params: { kid: Doc<'members'>; mega: Doc<'megas'> | null; itemId: StoreItemId; now: number }) {
  const { kid, itemId, now } = params;
  if (!(STORE_RULES.shoppers as readonly string[]).includes(kid.role)) fail('FORBIDDEN', 'the Store is for kids');
  const price = STORE_CATALOG[itemId].price;
  const owned = await ownedItemIds(ctx, kid.familyId, kid._id, params.mega);
  if (owned.has(itemId)) fail('VALIDATION', 'you already have that');
  const balance = await balanceOf(ctx, kid.familyId, kid._id);
  if (balance < price) fail('VALIDATION', `you need ${price - balance} more Mega Bucks`);
  const purchaseId = await ctx.db.insert('purchases', { familyId: kid.familyId, memberId: kid._id, itemId, price, at: now });
  await ctx.db.insert('bucksLedger', { familyId: kid.familyId, memberId: kid._id, delta: -price, source: { kind: 'purchase', purchaseId }, byId: kid._id, at: now });
  return { purchaseId, balance: balance - price };
}

/** `megas.update` for a kid: each changed look part must be free or owned. Unchanged parts always pass. */
export async function assertKidMayWear(ctx: Ctx, kid: Doc<'members'>, mega: Doc<'megas'>, next: Look): Promise<void> {
  const owned = await ownedItemIds(ctx, kid.familyId, kid._id, mega);
  const cur = mega.look;
  const freeHexes = new Set(Object.values(COLORS).map((h) => h.toLowerCase()));
  if (next.hex.toLowerCase() !== cur.hex.toLowerCase() && !freeHexes.has(next.hex.toLowerCase())) {
    const color = Object.entries(STORE_CATALOG).find(([id, e]) => storeSectionOf(id as StoreItemId) === 'color' && 'hex' in e && e.hex.toLowerCase() === next.hex.toLowerCase());
    if (!color || !owned.has(color[0] as StoreItemId)) fail('FORBIDDEN', 'get that color in the Store first');
  }
  const parts: [string | undefined, string | undefined, string][] = [
    [next.sticker === 'none' ? undefined : next.sticker, cur.sticker === 'none' ? undefined : cur.sticker, 'sticker'],
    [next.antenna, cur.antenna, 'antenna'],
    [next.eyes, cur.eyes, 'eyes'],
    [next.eyeColor, cur.eyeColor, 'eyeColor'],
  ];
  for (const [value, current, section] of parts) {
    if (!value || value === 'classic' || value === current) continue;
    const id = `${section}:${value}`;
    if (!(STORE_ITEM_IDS as readonly string[]).includes(id) || !owned.has(id as StoreItemId)) fail('FORBIDDEN', `get that ${section === 'eyeColor' ? 'eye color' : section} in the Store first`);
  }
}

/** `rooms.update` for a kid: every piece placed must be free, bought, or already in their room. */
export async function assertKidMayPlace(ctx: Ctx, kid: Doc<'members'>, mega: Doc<'megas'> | null, room: Doc<'rooms'>, furniture: { kind: string }[]): Promise<void> {
  const owned = await ownedItemIds(ctx, kid.familyId, kid._id, mega);
  const already = new Set(room.furniture.map((f) => f.kind));
  for (const piece of furniture) {
    if (already.has(piece.kind)) continue;
    if (!owned.has(`furniture:${piece.kind}` as StoreItemId)) fail('FORBIDDEN', 'get that in the Store first');
  }
}
