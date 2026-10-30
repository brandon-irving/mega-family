// Settings (canvas Screen 7 boards Settings / SettingsAdult / SettingsKid): Look (theme with its accent swatch,
// wallpaper), Notifications (adults change theirs; a kid's are locked, "Set by a parent"), Family (admin only:
// members, the parent code behind Show/Hide, inviting), Connected accounts and Places (G5, Screen 16), and
// Account (sign out; a kid's is "Switch person"). Presentational: the route wires the data and opens the sheets.
import { useState } from 'react';
import { View } from 'react-native';
import { G5_FIX_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { THEMES, WALLPAPER_PRESETS } from '@shared/config/theme';
import type { NotificationKind, Role, ThemeName } from '@shared/domain/enums';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { useTokens } from '@/ui/theme';
import { LinkRow, LockedRow, SettingsSection, ValueRow, clockLabel } from './rows';

export type Accent = 'theme' | 'mega' | { hex: string };
export type Wallpaper = { kind: 'preset'; id: (typeof WALLPAPER_PRESETS)[number]['id'] } | { kind: 'photo' } | { kind: 'generated' } | null;
export type Notify = { loudKinds: NotificationKind[]; quietHours: { start: string; end: string }; dailyCap: number };

export type SettingsContentProps = {
  role: Role;
  megaName: string;
  theme: ThemeName;
  accent: Accent;
  accentHex: string;
  wallpaper: Wallpaper;
  notify: Notify;
  email?: string | null;
  /** Admin only. */
  parentCode?: string | null;
  memberCount?: number;
  connectedCount?: number;
  /** A kid's: whether their parents can read their chats (`kidControls.mine`); undefined = not known, hidden. */
  parentsCanReadChat?: boolean;
  on: {
    openTheme: () => void;
    openWallpaper: () => void;
    openNotify: (section?: 'alerts' | 'quiet' | 'limit') => void;
    openMembers: () => void;
    openAccounts: () => void;
    openPlaces: () => void;
    signOut: () => void;
    /** A kid's own Rules and limits, read-only (board ProfileRulesKid). Shown when given. */
    openRules?: () => void;
  };
};

export function accentText(accent: Accent, megaName: string): string {
  if (accent === 'mega') return fillCopy(U.accentMega, { mega: megaName });
  if (accent === 'theme') return U.accentTheme;
  return U.accentCustom;
}

export function wallpaperText(w: Wallpaper, megaName: string): string {
  if (!w) return U.wallpaperNone;
  if (w.kind === 'preset') return WALLPAPER_PRESETS.find((p) => p.id === w.id)?.label ?? U.wallpaperNone;
  return w.kind === 'photo' ? U.wallpaperPhoto : fillCopy(U.wallpaperMade, { mega: megaName });
}

export function loudText(kinds: NotificationKind[]): string {
  const labels = kinds.map((k) => U.kindLabels[k]);
  if (labels.length === 0) return U.wakesNone;
  return labels.map((l, i) => (i ? l.toLowerCase() : l)).join(', ');
}

export function SettingsContent({ role, megaName, theme, accent, accentHex, wallpaper, notify, email, parentCode, memberCount, connectedCount, parentsCanReadChat, on }: SettingsContentProps) {
  const tokens = useTokens();
  const [codeShown, setCodeShown] = useState(false);
  const kid = role === 'kid';
  const quiet = `${clockLabel(notify.quietHours.start)} – ${clockLabel(notify.quietHours.end)}`;
  const swatch = <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accentHex, borderWidth: 2, borderColor: tokens.line }} />;

  return (
    <View style={{ gap: tokens.spacing.xl }} testID="settings-content">
      <SettingsSection title={U.sectionLook}>
        <LinkRow label={U.theme} value={fillCopy(U.themeValue, { theme: THEMES[theme].label, accent: accentText(accent, megaName) })} leading={swatch} onPress={on.openTheme} />
        <LinkRow label={U.wallpaper} value={wallpaperText(wallpaper, megaName)} onPress={on.openWallpaper} />
      </SettingsSection>

      {kid ? (
        <SettingsSection title={U.sectionNotifications} note={U.kidNotifyNote}>
          <LockedRow label={U.quietHours} locked={U.setByParent} value={quiet} />
          <LockedRow label={U.dailyLimit} locked={U.setByParent} value={fillCopy(U.dailyLimitValue, { n: notify.dailyCap })} />
          {parentsCanReadChat !== undefined ? <LockedRow label={G5_FIX_COPY.kidReadChats} locked={U.setByParent} value={parentsCanReadChat ? U.rulesOn : U.rulesOff} /> : null}
          {on.openRules ? <LinkRow label={U.rulesRow} hint={G5_FIX_COPY.kidRulesHint} onPress={on.openRules} /> : null}
        </SettingsSection>
      ) : (
        <SettingsSection title={U.sectionNotifications}>
          <LinkRow label={U.wakesPhone} hint={U.wakesPhoneHint} value={loudText(notify.loudKinds)} onPress={() => on.openNotify('alerts')} />
          <LinkRow label={U.quietHours} value={quiet} onPress={() => on.openNotify('quiet')} />
          <LinkRow label={U.dailyLimit} value={fillCopy(U.dailyLimitValue, { n: notify.dailyCap })} onPress={() => on.openNotify('limit')} />
        </SettingsSection>
      )}

      {role === 'admin' ? (
        <SettingsSection title={U.sectionFamily} note={U.familyNote}>
          <LinkRow label={U.members} value={memberCount === 1 ? U.membersValueOne : memberCount !== undefined ? fillCopy(U.membersValue, { n: memberCount }) : undefined} onPress={on.openMembers} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, minHeight: 52, paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.sm }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">{U.parentCode}</Text>
              <Text variant="caption" color="muted">
                {U.parentCodeHint}
              </Text>
            </View>
            <Text variant="title" accessibilityLabel={codeShown && parentCode ? `${U.parentCode} ${parentCode.split('').join(' ')}` : U.parentCode} style={{ letterSpacing: 2, fontVariant: ['tabular-nums'] }}>
              {codeShown && parentCode ? parentCode.split('').join(' ') : U.parentCodeHidden}
            </Text>
            <Button
              label={codeShown ? U.hide : U.show}
              accessibilityLabel={codeShown ? U.hideCodeLabel : U.showCodeLabel}
              variant="secondary"
              pill
              disabled={!parentCode}
              onPress={() => setCodeShown((s) => !s)}
              style={{ minHeight: 44 }}
            />
          </View>
        </SettingsSection>
      ) : null}

      {kid ? (
        <SettingsSection>
          <LinkRow label={U.places} onPress={on.openPlaces} />
        </SettingsSection>
      ) : (
        <SettingsSection title={U.connectedAccounts}>
          <LinkRow label={U.connectedAccounts} value={connectedCount ? fillCopy(U.connectedValue, { n: connectedCount }) : U.connectedNone} onPress={on.openAccounts} />
          <LinkRow label={U.places} onPress={on.openPlaces} />
        </SettingsSection>
      )}

      <SettingsSection title={U.sectionAccount}>
        {!kid && email ? <ValueRow label={U.signedIn} value={email} /> : null}
        <LinkRow label={kid ? U.switchPerson : U.signOut} onPress={on.signOut} />
      </SettingsSection>
    </View>
  );
}
