import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { ANIMATION_PREVIEWS, ANIMATION_PREVIEW_LAYOUT, type AnimationPreviewId } from '@shared/config/animationPreviews';
import type { FrameName } from '@shared/sprite';
import { EntranceAnimation } from '@/features/chat/ChatEntrance';
import type { MegaInfo } from '@/features/shell/megaInfo';
import { ModalSheet } from '@/ui/ModalSheet';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { MegaSprite } from '@/ui/MegaSprite';
import { MegaBadge } from '@/ui/MegaBadge';
import { useTokens } from '@/ui/theme';

/** Local-only replay: never resets onboarding, changes profiles, or acknowledges the real entrance. */
export function AnimationPreviews({ mega }: { mega: MegaInfo }) {
  const tokens = useTokens();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<AnimationPreviewId>('entrance');
  const [run, setRun] = useState(0);
  return <>
    <Button label="Animation previews" variant="secondary" onPress={() => setOpen(true)} />
    {open && <ModalSheet open title="Animation previews" closeLabel="Close" onClose={() => setOpen(false)}>
      <Text color="muted">Replay with {mega.name}. Your demo progress stays unchanged. Device reduced-motion settings apply.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
        {ANIMATION_PREVIEWS.map(item => <Button key={item.id} label={item.label} variant={selection === item.id ? 'primary' : 'secondary'} onPress={() => { setSelection(item.id); setRun(n => n + 1); }} />)}
      </View>
      <PreviewStage key={`${selection}:${run}`} mega={mega} selection={selection} />
      <Button label="Replay animation" onPress={() => setRun(n => n + 1)} />
    </ModalSheet>}
  </>;
}
function PreviewStage({ mega, selection }: { mega: MegaInfo; selection: AnimationPreviewId }) {
  const tokens = useTokens();
  const [width, setWidth] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const reveal = useCallback(() => setRevealed(true), []);
  const complete = useCallback(() => { setDone(true); setRevealed(true); }, []);
  return <View testID="animation-preview-stage" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height: ANIMATION_PREVIEW_LAYOUT.height, overflow: 'hidden', backgroundColor: tokens.bg, borderRadius: tokens.radii.lg }}>
    {selection === 'entrance' ? <>
      <View style={{ padding: tokens.spacing.md, opacity: revealed ? 1 : 0 }}>
        <MegaBadge hex={mega.hex} sticker={mega.sticker} face={mega.face} size={32} />
        <Text variant="label">{mega.name}</Text>
        <Text color="muted">Your conversation appears here.</Text>
      </View>
      {width > 0 && !done && <View style={StyleSheet.absoluteFill}><EntranceAnimation mega={mega} geometry={{ width, height: ANIMATION_PREVIEW_LAYOUT.height, targetX: tokens.spacing.md + 16, targetY: tokens.spacing.md + 16 }} onReveal={reveal} onComplete={complete} /></View>}
    </> : <SpriteStudy mega={mega} selection={selection} />}
  </View>;
}
function SpriteStudy({ mega, selection }: { mega: MegaInfo; selection: Exclude<AnimationPreviewId, 'entrance'> }) {
  const config = ANIMATION_PREVIEWS.find(item => item.id === selection)!;
  const [frame, setFrame] = useState<FrameName>('stand');
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || AppState.currentState !== 'active') return;
    let step = 0;
    const timer = setInterval(() => setFrame(config.frames[step++ % config.frames.length]), config.frameMs);
    const stop = () => { clearInterval(timer); setFrame('stand'); };
    const end = setTimeout(stop, config.durationMs);
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') { clearTimeout(end); stop(); } });
    return () => { clearInterval(timer); clearTimeout(end); listener.remove(); };
  }, [config, reduced]);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <MegaSprite hex={mega.hex} sticker={mega.sticker} face="happy" view={selection === 'walk' ? 'right' : 'front'} frame={frame} scale={2} />
  </View>;
}
