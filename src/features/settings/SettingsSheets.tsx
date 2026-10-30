// The three sheets Settings opens (boards SettingsTheme, SettingsWallpaper, PushQuiet): theme + accent with a
// live preview line, the wallpaper presets (a parent-added photo or a made one shows as the current choice;
// kids are told to ask a parent for a new picture), and the adult's notifications (what wakes the phone, quiet
// hours, a daily limit). Each one closes every way (ModalSheet) and saves as you tap (`settings.set`).
import { Pressable, View } from 'react-native';
import { NOTIFICATION_KINDS } from '@shared/domain/enums';
import { G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { COLORS } from '@shared/config/looks';
import { THEMES, WALLPAPER_PRESETS, readableOn } from '@shared/config/theme';
import type { ThemeName } from '@shared/domain/enums';
import { SETTINGS_UI, WALLPAPER_SWATCHES } from '@shared/config/settingsUi';
import { MegaBadge } from '@/ui/MegaBadge';
import { ModalSheet } from '@/ui/ModalSheet';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import type { StickerId } from '@shared/config/looks';
import type { Accent, Notify, Wallpaper } from './SettingsContent';
import { SettingsSection, StepperRow, SwitchRow, clockLabel, shiftClock } from './rows';

const sameAccent = (a: Accent, b: Accent) => (typeof a === 'string' || typeof b === 'string' ? a === b : a.hex.toLowerCase() === b.hex.toLowerCase());

export function ThemeSheet({ open, onClose, theme, accent, megaName, megaHex, megaSticker, onTheme, onAccent, busy, error, saved }: { open: boolean; onClose: () => void; theme: ThemeName; accent: Accent; megaName: string; megaHex: string; megaSticker: StickerId; onTheme: (t: ThemeName) => void; onAccent: (a: Accent) => void } & SaveFeedbackProps) {
  const tokens = useTokens();
  const swatches: { accent: Accent; label: string; hex: string }[] = [
    { accent: 'theme', label: U.defaultAccent, hex: THEMES[theme].accent },
    ...Object.entries(COLORS)
      .filter(([, hex]) => hex.toLowerCase() !== THEMES[theme].accent.toLowerCase())
      .map(([id, hex]) => ({ accent: { hex } as Accent, label: id[0].toUpperCase() + id.slice(1), hex })),
  ];
  return (
    <ModalSheet open={open} title={U.theme} closeLabel={U.close} onClose={onClose} testID="theme-sheet">
      <SaveFeedback busy={busy} error={error} saved={saved} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.md, borderRadius: tokens.radii.lg, borderWidth: 1, borderColor: tokens.line, backgroundColor: tokens.bg }} accessibilityLabel={U.previewLabel}>
        <MegaBadge hex={megaHex} sticker={megaSticker} size={36} accessibilityLabel={megaName} />
        <View style={{ flex: 1, paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderRadius: tokens.radii.lg, backgroundColor: tokens.accent }}>
          <Text style={{ color: readableOn(tokens.accent) }}>{U.previewYes}</Text>
        </View>
      </View>
      <Text variant="caption" weight="700" color="muted">
        {U.theme.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel={U.theme}>
        {(Object.keys(THEMES) as ThemeName[]).map((t) => {
          const on = t === theme;
          return (
            <Pressable
              key={t}
              disabled={busy}
              onPress={() => onTheme(t)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, selected: on, disabled: !!busy }}
              accessibilityLabel={THEMES[t].label}
              style={{ flex: 1, height: 56, borderRadius: tokens.radii.lg, borderWidth: on ? 3 : 1, borderColor: on ? tokens.accent : tokens.line, backgroundColor: THEMES[t].bg, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text variant="label" style={{ color: THEMES[t].text }}>
                {THEMES[t].label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" weight="700" color="muted">
        {U.accentColor.toUpperCase()}
      </Text>
      <Pressable
        disabled={busy}
        onPress={() => onAccent('mega')}
        accessibilityRole="radio"
        accessibilityState={{ checked: accent === 'mega', selected: accent === 'mega', disabled: !!busy }}
        accessibilityLabel={fillCopy(U.matchMega, { mega: megaName })}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingHorizontal: tokens.spacing.md, borderRadius: tokens.radii.lg, borderWidth: accent === 'mega' ? 3 : 1, borderColor: accent === 'mega' ? tokens.accent : tokens.line }}
      >
        <MegaBadge hex={megaHex} sticker={megaSticker} size={32} />
        <View style={{ flex: 1 }}>
          <Text variant="label">{fillCopy(U.matchMega, { mega: megaName })}</Text>
          <Text variant="caption" color="muted">
            {fillCopy(U.matchMegaSub, { mega: megaName })}
          </Text>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel={U.accentColor}>
        {swatches.map((s) => {
          const on = sameAccent(accent, s.accent);
          return (
            <Pressable
              key={s.label}
              disabled={busy}
              onPress={() => onAccent(s.accent)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, selected: on, disabled: !!busy }}
              accessibilityLabel={s.label}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: s.hex, borderWidth: 3, borderColor: on ? tokens.text : 'transparent' }}
            />
          );
        })}
      </View>
    </ModalSheet>
  );
}

export function WallpaperSheet({ open, onClose, wallpaper, megaHex, kid, onPick, busy, error, saved }: { open: boolean; onClose: () => void; wallpaper: Wallpaper; megaHex: string; kid: boolean; onPick: (id: (typeof WALLPAPER_PRESETS)[number]['id']) => void } & SaveFeedbackProps) {
  const tokens = useTokens();
  return (
    <ModalSheet open={open} title={U.wallpaper} closeLabel={U.close} onClose={onClose} testID="wallpaper-sheet">
      <SaveFeedback busy={busy} error={error} saved={saved} />
      <Text color="muted">{U.wallpaperUsed}</Text>
      <Text variant="caption" weight="700" color="muted">
        {U.presets.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel={U.presets}>
        {WALLPAPER_PRESETS.map((p) => {
          const on = wallpaper?.kind === 'preset' && wallpaper.id === p.id;
          const sw = WALLPAPER_SWATCHES[p.id];
          return (
            <Pressable
              key={p.id}
              disabled={busy}
              onPress={() => onPick(p.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, selected: on, disabled: !!busy }}
              accessibilityLabel={p.label}
              style={{ flexBasis: '47%', flexGrow: 1, height: 112, borderRadius: tokens.radii.lg, overflow: 'hidden', borderWidth: on ? 3 : 1, borderColor: on ? tokens.accent : tokens.line }}
            >
              <View style={{ flex: 1, backgroundColor: sw.top === 'mega' ? megaHex : sw.top }} />
              <View style={{ flex: 1, backgroundColor: sw.bottom, justifyContent: 'flex-end', padding: tokens.spacing.sm }}>
                <Text variant="caption" weight="700" style={{ color: readableOn(sw.bottom) }}>
                  {p.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {kid ? <Text color="muted">{U.kidWallpaperNote}</Text> : null}
    </ModalSheet>
  );
}

export function NotifySheet({ open, onClose, notify, onChange, section, busy, error, saved }: { open: boolean; onClose: () => void; notify: Notify; onChange: (n: Notify) => void; section?: 'alerts' | 'quiet' | 'limit' } & SaveFeedbackProps) {
  const step = SETTINGS_UI.quietStepMinutes;
  const { min, max } = SETTINGS_UI.dailyCap;
  const set = (patch: Partial<Notify>) => onChange({ ...notify, ...patch });
  const quiet = (key: 'start' | 'end', d: number) => set({ quietHours: { ...notify.quietHours, [key]: shiftClock(notify.quietHours[key], d) } });
  return (
    <ModalSheet open={open} title={section === 'quiet' ? U.quietHours : section === 'limit' ? U.dailyLimit : U.notifySheet} closeLabel={U.close} onClose={onClose} testID="notify-sheet">
      <SaveFeedback busy={busy} error={error} saved={saved} />
      {(!section || section === 'alerts') ? <><Text color="muted">{U.notifyWakesBody}</Text>
      <SettingsSection title={U.wakesPhone}>
        {NOTIFICATION_KINDS.map((k) => (
          <SwitchRow
            key={k}
            disabled={busy}
            label={U.kindLabels[k]}
            value={notify.loudKinds.includes(k)}
            onChange={(v) => set({ loudKinds: v ? [...notify.loudKinds, k] : notify.loudKinds.filter((x) => x !== k) })}
          />
        ))}
      </SettingsSection></> : null}
      {(!section || section === 'quiet') ? <SettingsSection title={U.quietHours}>
        <StepperRow
          canLess={!busy} canMore={!busy}
          label={U.quietFrom}
          value={clockLabel(notify.quietHours.start)}
          onLess={() => quiet('start', -step)}
          onMore={() => quiet('start', step)}
          lessLabel={fillCopy(U.earlier, { label: U.quietFrom })}
          moreLabel={fillCopy(U.later, { label: U.quietFrom })}
        />
        <StepperRow
          canLess={!busy} canMore={!busy}
          label={U.quietUntil}
          value={clockLabel(notify.quietHours.end)}
          onLess={() => quiet('end', -step)}
          onMore={() => quiet('end', step)}
          lessLabel={fillCopy(U.earlier, { label: U.quietUntil })}
          moreLabel={fillCopy(U.later, { label: U.quietUntil })}
        />
      </SettingsSection> : null}
      {(!section || section === 'limit') ? <SettingsSection>
        <StepperRow
          label={U.dailyLimit}
          value={fillCopy(U.dailyLimitValue, { n: notify.dailyCap })}
          onLess={() => set({ dailyCap: Math.max(min, notify.dailyCap - 1) })}
          onMore={() => set({ dailyCap: Math.min(max, notify.dailyCap + 1) })}
          canLess={!busy && notify.dailyCap > min}
          canMore={!busy && notify.dailyCap < max}
          lessLabel={fillCopy(U.fewer, { label: U.dailyLimit })}
          moreLabel={fillCopy(U.more, { label: U.dailyLimit })}
        />
      </SettingsSection> : null}
    </ModalSheet>
  );
}


type SaveFeedbackProps = { busy?: boolean; error?: string | null; saved?: boolean };
function SaveFeedback({ busy, error, saved }: SaveFeedbackProps) {
  const tokens = useTokens();
  if (error) return <Text style={{ color: tokens.danger }} accessibilityRole="alert">{error} Try again.</Text>;
  return busy || saved ? <Text color="muted" variant="caption" accessibilityLiveRegion="polite">{busy ? 'Saving…' : 'Saved'}</Text> : null;
}
