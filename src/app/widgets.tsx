// mega://widgets — how to add MEGA's widgets (G8). The widgets themselves live on the home and lock screens
// (src/widgets/, kept in step by src/features/widgets/WidgetSync.tsx); they're iOS only, so the web says so.
import { Platform } from 'react-native';
import { router } from '@/features/shell/navigation';
import { G8_UI_COPY } from '@shared/config/copy';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

export default function WidgetsRoute() {
  return (
    <Sheet title={G8_UI_COPY.widgetsSheetTitle} onClose={() => router.back()}>
      <Text color="muted">{Platform.OS === 'web' ? G8_UI_COPY.widgetsSheetWeb : G8_UI_COPY.widgetsSheetBody}</Text>
    </Sheet>
  );
}
