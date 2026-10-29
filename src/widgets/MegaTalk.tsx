// G8 (CONTRACT v0.18 §6; boards WidgetsLock, WidgetsLockSignedOut; canvas v41): the round lock-screen
// "Talk to your MEGA" widget, kind `WIDGETS.talk` (accessoryCircular). The MEGA's head (drawn from the pixel
// runs in props) over "Talk"; a tap opens talk mode. Signed out: a sleeping grey MEGA that opens the app.
// Same widget-runtime rules as MegaNext: everything inside the function, everything from props.
import { HStack, Rectangle, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, opacity, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { WIDGETS } from '@shared/config/widgets';
import { initialTalkProps } from '@/services/widgetSync';
import type { MegaTalkProps } from './types';

export const MegaTalkLayout = (props: MegaTalkProps, _environment: WidgetEnvironment) => {
  'widget';
  const c = props.colors;
  const px = 1.5;
  return (
    <VStack spacing={2} modifiers={[containerBackground(c.bg, 'widget'), widgetURL(props.link)]}>
      <VStack spacing={0}>
        {props.head.map((row, y) => (
          <HStack key={'h' + y} spacing={0}>
            {row.map((run, x) => (
              <Rectangle key={'h' + y + '-' + x} modifiers={[frame({ width: run[0] * px, height: px }), foregroundStyle(run[1] || c.bg), opacity(run[1] ? 1 : 0)]} />
            ))}
          </HStack>
        ))}
      </VStack>
      <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(c.text)]}>{props.copy.talk}</Text>
    </VStack>
  );
};

export const MegaTalk = createWidget<MegaTalkProps>(WIDGETS.talk.name, MegaTalkLayout, initialTalkProps());
