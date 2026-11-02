import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, PanResponder, Pressable, View, useWindowDimensions, type GestureResponderEvent, type PanResponderGestureState } from 'react-native';
import { DEMO_QUICK_MENU as C } from '@shared/config/demo';
import { useDemoProfile } from '@/data/useDemoProfile';
import { useViewer } from '@/data/useViewer';
import { useDesktopLayout } from '@/ui/useDesktopLayout';
import { useTokens } from '@/ui/theme';
import { Text } from '@/ui/Text';
import { ModalSheet } from '@/ui/ModalSheet';
import { DemoSessionBar } from './DemoSessionBar';
import { DemoConsole } from './DemoConsole';

/** Only mounted on the tab shell; invitation/start screens retain their recovery controls. */
export function DemoQuickMenu({ placement }: { placement: 'sidebar' | 'floating' }) {
  const { profile } = useDemoProfile();
  const desktop = useDesktopLayout();
  if (!profile?.active || (placement === 'sidebar') !== desktop) return null;
  return <ActiveMenu placement={placement} currentName={profile.currentName ?? 'Admin'} />;
}

function ActiveMenu({ placement, currentName }: { placement: 'sidebar' | 'floating'; currentName: string }) {
  const t = useTokens();
  const viewer = useViewer();
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const { width, height } = useWindowDimensions();
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: width - C.size - C.inset, y: C.initialTop });
  const maxX = Math.max(C.inset, width - C.size - C.inset);
  const maxY = Math.max(C.inset, height - C.bottomReserve - C.size);
  const x = Math.min(maxX, Math.max(C.inset, position.x));
  const y = Math.min(maxY, Math.max(C.inset, position.y));
  const grab = useRef({ x: C.size / 2, y: C.size / 2 });
  const onGrant = useCallback((event: GestureResponderEvent) => {
    grab.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
  }, []);
  const onMove = useCallback((_: GestureResponderEvent, g: PanResponderGestureState) => {
    setPosition({ x: Math.min(maxX, Math.max(C.inset, g.moveX - grab.current.x)), y: Math.min(maxY, Math.max(C.inset, g.moveY - grab.current.y)) });
  }, [maxX, maxY]);
  // PanResponder registers these handlers; it invokes them only for gestures, never during render.
  // eslint-disable-next-line react-hooks/refs
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > C.dragThreshold,
    onPanResponderGrant: onGrant,
    onPanResponderMove: onMove,
  }), [onGrant, onMove]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return <>
    {placement === 'sidebar' ? <View style={{ borderTopWidth: 1, borderTopColor: t.line, paddingTop: t.spacing.md, marginTop: t.spacing.md }}>
      <Text variant="caption" color="muted">DEMO</Text>
      <DemoSessionBar stacked />
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ minHeight: t.touchTarget, justifyContent: 'center', paddingHorizontal: t.spacing.md }}><Text variant="label" color="accent">Demo controls</Text></Pressable>
    </View> : !keyboard && <View {...pan.panHandlers} style={{ position: 'absolute', left: x, top: y, zIndex: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open demo controls" accessibilityHint="Drag to reposition" onPress={() => setOpen(true)} style={{ width: C.size, height: C.size, borderRadius: C.size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface, borderWidth: 1, borderColor: t.accent }}><Text variant="caption" color="accent" weight="700">{C.label}</Text></Pressable>
    </View>}
    {open && <ModalSheet open scrollable={placement !== 'sidebar'} title={placement === 'sidebar' ? 'Demo Console' : C.title} closeLabel="Close demo controls" onClose={() => setOpen(false)}>
      <View style={placement === 'sidebar' ? { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm } : undefined}>
      {placement !== 'sidebar' && <><Text variant="label">Current person · {currentName}</Text>
      <Text color="muted">{viewer?.member.role === 'admin' ? 'Demo admin' : viewer?.member.role === 'adult' ? 'Adult' : 'Child / teen'}</Text></>}
      <DemoSessionBar />
      </View>
      {viewer?.member.role === 'admin' ? <DemoConsole quick={placement !== 'sidebar'} /> : <Text color="muted">Return to the demo admin above to restart the story, clear demo data, or connect the three demo accounts.</Text>}
    </ModalSheet>}
  </>;
}
