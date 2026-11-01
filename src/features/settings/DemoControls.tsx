import type { Id } from '@shared/domain/validators';
import { useDemoProfile } from '@/data/useDemoProfile';
import { router } from '@/features/shell/navigation';
import { Button } from '@/ui/Button';
import { SettingsSection } from './rows';
export function DemoControls({ memberId: _memberId }: { memberId: Id<'members'> }) {
  const { profile } = useDemoProfile();
  if (!profile) return null;
  return <SettingsSection title="Demo"><Button label="Open Demo Console" variant="secondary" onPress={() => router.push('/demo-console' as never)} /></SettingsSection>;
}
