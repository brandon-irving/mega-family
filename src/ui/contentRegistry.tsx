// Content that walking MEGAs must never be drawn over (owner, Oct 28: "Megas should never be covering
// content"). A walker stage (src/features/walkers/WalkerStage.tsx) provides this registry; Text, Button and
// pixel pictures register their on-screen rect with it automatically, so every screen with walkers protects
// all of its words, buttons and pictures without wrapping each one. Off a stage (no provider) it's a no-op.
// The walkers' own sprites and bubbles render under `NoContentRegistry` so they don't block themselves.
import { createContext, type ComponentRef, type ReactNode, useCallback, useContext, useEffect, useId, useRef } from 'react';
import type { LayoutChangeEvent, View } from 'react-native';

type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
export type ContentRegistry = { register: (id: string, el: Measurable) => void; unregister: (id: string) => void };

const Ctx = createContext<ContentRegistry | null>(null);
export const ContentRegistryProvider = Ctx.Provider;

/** Children render without registering content (the walkers' own sprites, bubbles and emotes). */
export function NoContentRegistry({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={null}>{children}</Ctx.Provider>;
}

/** A ref + onLayout pair that registers the element as content while it's on a walker stage. */
export function useContentRect<T = ComponentRef<typeof View>>(onLayoutProp?: (e: LayoutChangeEvent) => void) {
  const registry = useContext(Ctx);
  const id = `content:${useId()}`;
  const ref = useRef<T>(null);
  const register = registry?.register;
  const unregister = registry?.unregister;
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      register?.(id, ref.current as unknown as Measurable);
      onLayoutProp?.(e);
    },
    [register, id, onLayoutProp],
  );
  useEffect(() => () => unregister?.(id), [unregister, id]);
  return { ref, onLayout: registry || onLayoutProp ? onLayout : undefined, active: !!registry };
}
