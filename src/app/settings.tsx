// Settings (canvas Screen 7 boards Settings / SettingsAdult / SettingsKid / SettingsTheme / SettingsWallpaper,
// G5; replaces the G1 placeholder). Wires the member's own settings (`settings.set`), the admin's parent code,
// the family count and the owner's connected accounts into SettingsContent, and opens its three sheets. Sign
// out lives here (PLAN.md → Sign-in): the auth gate reacts to the session ending on its own.
import { useState } from 'react';
import { router } from 'expo-router';
import type { ThemeName } from '@shared/domain/enums';
import { G5_UI_COPY as U } from '@shared/config/copy';
import { useViewer } from '@/data/useViewer';
import { useFamilyMembers } from '@/data/useFamily';
import { useIntegrations } from '@/data/useAccounts';
import { useParentCode, useSetSettings } from '@/data/useSettings';
import { signOut, useSignedInEmail } from '@/services/auth';
import { MegaLoader } from '@/features/walkers';
import { SettingsContent, type Accent, type Notify, type Wallpaper } from '@/features/settings/SettingsContent';
import { NotifySheet, ThemeSheet, WallpaperSheet } from '@/features/settings/SettingsSheets';
import { Sheet } from '@/ui/Sheet';
import { useTokens } from '@/ui/theme';
import type { StickerId } from '@shared/config/looks';

export default function SettingsRoute() {
  const tokens = useTokens();
  const viewer = useViewer();
  const members = useFamilyMembers();
  const integrations = useIntegrations();
  const setSettings = useSetSettings();
  const email = useSignedInEmail();
  const isAdmin = viewer?.member.role === 'admin';
  const parentCode = useParentCode(isAdmin);
  const [sheet, setSheet] = useState<'theme' | 'wallpaper' | 'notify' | null>(null);

  if (!viewer) return <MegaLoader />;

  const role = viewer.member.role;
  const settings = viewer.settings;
  const accent = settings.accent as Accent;
  const wallpaper = settings.wallpaper as Wallpaper;
  const notify = settings.notify as Notify;
  const megaName = viewer.mega?.name ?? 'MEGA';
  const megaHex = viewer.mega?.look.hex ?? tokens.accent;
  const megaSticker = (viewer.mega?.look.sticker ?? 'none') as StickerId;
  const connected = integrations.status === 'ok' ? integrations.data.filter((i) => (i.status ?? 'connected') === 'connected').length : undefined;
  const save = (patch: Parameters<typeof setSettings>[0]) => void setSettings(patch).catch(() => null);

  return (
    <Sheet title={U.settingsTitle} onClose={() => router.back()}>
      <SettingsContent
        role={role}
        megaName={megaName}
        theme={viewer.theme.name as ThemeName}
        accent={accent}
        accentHex={tokens.accent}
        wallpaper={wallpaper}
        notify={notify}
        email={role === 'kid' ? null : email}
        parentCode={parentCode}
        memberCount={members?.length}
        connectedCount={connected}
        on={{
          openTheme: () => setSheet('theme'),
          openWallpaper: () => setSheet('wallpaper'),
          openNotify: () => setSheet('notify'),
          openMembers: () => router.push('/(tabs)/family' as never),
          openAccounts: () => router.push('/accounts' as never),
          openPlaces: () => router.push('/places' as never),
          signOut: () => void signOut(),
        }}
      />
      <ThemeSheet
        open={sheet === 'theme'}
        onClose={() => setSheet(null)}
        theme={viewer.theme.name as ThemeName}
        accent={accent}
        megaName={megaName}
        megaHex={megaHex}
        megaSticker={megaSticker}
        onTheme={(theme) => save({ theme })}
        onAccent={(a) => save({ accent: a })}
      />
      <WallpaperSheet open={sheet === 'wallpaper'} onClose={() => setSheet(null)} wallpaper={wallpaper} megaHex={megaHex} kid={role === 'kid'} onPick={(id) => save({ wallpaper: { kind: 'preset', id } })} />
      {role === 'kid' ? null : <NotifySheet open={sheet === 'notify'} onClose={() => setSheet(null)} notify={notify} onChange={(n) => save({ notify: { ...settings.notify, ...n } })} />}
    </Sheet>
  );
}
