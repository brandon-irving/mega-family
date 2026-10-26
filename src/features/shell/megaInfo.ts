// Small shared helpers for turning a MegaDoc into what the UI needs to draw it.
import { PERSONALITIES } from '@shared/config/looks';
import type { Personality } from '@shared/domain/enums';
import type { Infer } from 'convex/values';
import type { megaDoc } from '@shared/domain/api';

export type MegaDoc = Infer<typeof megaDoc>;

export type MegaInfo = { name: string; hex: string; sticker: MegaDoc['look']['sticker']; face: ReturnType<typeof faceFor> };

export function faceFor(personality: Personality) {
  return PERSONALITIES[personality].face;
}

export function megaInfo(mega: MegaDoc): MegaInfo {
  return { name: mega.name, hex: mega.look.hex, sticker: mega.look.sticker, face: faceFor(mega.personality) };
}
