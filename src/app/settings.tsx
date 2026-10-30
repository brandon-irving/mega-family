// Settings (canvas Screen 7 boards Settings / SettingsAdult / SettingsKid / SettingsTheme / SettingsWallpaper,
// G5; replaces the G1 placeholder). Wires the member's own settings (`settings.set`), the admin's parent code,
// the family count and the owner's connected accounts into SettingsContent, and opens its three sheets. Sign
// out lives here (PLAN.md → Sign-in): the auth gate reacts to the session ending on its own.
import { useRef, useState } from 'react';
import { router } from '@/features/shell/navigation';
import type { ThemeName } from '@shared/domain/enums';
import { G5_UI_COPY as U } from '@shared/config/copy';
import { useViewer } from '@/data/useViewer';
import { useFamilyMembers, useMyRules } from '@/data/useFamily';
import { useIntegrations } from '@/data/useAccounts';
import { useParentCode, useSetSettings } from '@/data/useSettings';
import { signOut, useSignedInEmail } from '@/services/auth';
import { MegaLoader } from '@/features/walkers';
import { SettingsContent, type Accent, type Notify, type Wallpaper } from '@/features/settings/SettingsContent';
import { NotifySheet, ThemeSheet, WallpaperSheet } from '@/features/settings/SettingsSheets';
import { Sheet } from '@/ui/Sheet';
import { useTokens } from '@/ui/theme';
import type { StickerId } from '@shared/config/looks';
import { errorCopyFor } from '@/data/errorCopy';
import { Text } from '@/ui/Text';

export default function SettingsRoute() {
  const tokens = useTokens();
  const viewer = useViewer();
  const members = useFamilyMembers();
  const integrations = useIntegrations();
  const setSettings = useSetSettings();
  const email = useSignedInEmail();
  const isAdmin = viewer?.member.role === 'admin';
  const parentCode = useParentCode(isAdmin);
  const myRules = useMyRules(viewer?.member.role === 'kid');
  const [sheet, setSheet] = useState<'theme' | 'wallpaper' | 'notify' | null>(null);
  const [notifySection, setNotifySection] = useState<'alerts' | 'quiet' | 'limit' | undefined>();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
  const save = async (patch: Parameters<typeof setSettings>[0]) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true); setError(null); setSaved(false);
    try { await setSettings(patch); setSaved(true); }
    catch (err) { setError(errorCopyFor(err)); }
    finally { saving.current = false; setBusy(false); }
  };
  const openSheet = (next: typeof sheet) => { setError(null); setSaved(false); setSheet(next); };
  const feedback = { busy, error, saved };

  return (
    <Sheet title={U.settingsTitle} onClose={() => router.back()}>
      {!sheet && error ? <Text style={{ color: tokens.danger }} accessibilityRole="alert">{error}</Text> : null}
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
        parentsCanReadChat={myRules ? myRules.parentsCanReadChat : undefined}
        on={{
          openTheme: () => openSheet('theme'),
          openWallpaper: () => openSheet('wallpaper'),
          openNotify: (section) => { setNotifySection(section); openSheet('notify'); },
          openMembers: () => router.toTab('/family'),
          openAccounts: () => router.push('/accounts' as never),
          openPlaces: () => router.push('/places' as never),
          signOut: () => { if (!saving.current) void signOut().catch((err) => setError(errorCopyFor(err))); },
          openRules: role === 'kid' && myRules ? () => router.push('/mega-profile/rules' as never) : undefined,
        }}
      />
      <ThemeSheet
        {...feedback}
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
      <WallpaperSheet {...feedback} open={sheet === 'wallpaper'} onClose={() => setSheet(null)} wallpaper={wallpaper} megaHex={megaHex} kid={role === 'kid'} onPick={(id) => { void save({ wallpaper: { kind: 'preset', id } }); }} />
      {role === 'kid' ? null : <NotifySheet {...feedback} section={notifySection} open={sheet === 'notify'} onClose={() => setSheet(null)} notify={notify} onChange={(n) => { void save({ notify: { ...settings.notify, ...n } }); }} />}
    </Sheet>
  );
}
