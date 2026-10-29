// MEGA profile (PLAN §3, Profile board), opened by tapping the MEGA in the chat header. Owner, Oct 28: it's
// where you customize your MEGA and handle your own profile concerns. Top to bottom: the MEGA itself (its full
// look including Store parts, its name with a rename control, its status), the Look & personality row (color,
// sticker, antenna, eyes, personality), What it shares (adults), and You: notifications and quiet hours,
// theme, and what it remembers (with forget; not for kids). What each role may do is ROLES_CONFIG.profile.
// G5 (Screen 16): the admin's Activity row (board ProfileActivity). A kid's Rules and limits open from that kid's
// Family page (board ProfileRules), where their parents edit them.
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { megaDoc } from '@shared/domain/api';
import type { Role, ShareLevel } from '@shared/domain/enums';
import { G5_FIX_COPY, G5_UI_COPY, PROFILE_COPY as C, fillCopy } from '@shared/config/copy';
import { ROLES_CONFIG } from '@shared/config/roles';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { faceFor } from '@/features/shell/megaInfo';

export type MegaDoc = Infer<typeof megaDoc>;
export type Sharing = { schedule: ShareLevel; lists: ShareLevel; hqActivity: ShareLevel };

export type ProfileContentProps = {
  mega: MegaDoc;
  role: Role;
  statusLine: string;
  isAdmin: boolean;
  sharing?: Sharing;
  onRename: (name: string) => void;
  onOpenLookPersonality: () => void;
  onOpenNotifications: () => void;
  onOpenTheme: () => void;
  onChangeSharing?: (patch: Partial<Sharing>) => void;
  onOpenMemories?: () => void;
  /** G5 (admin): what the family's MEGAs did, and why (board ProfileActivity). */
  onOpenActivity?: () => void;
  /** A kid's own Rules and limits, read-only (G5 UX review; board ProfileRulesKid). */
  onOpenRules?: () => void;
  /** G6 walkthrough fix (P2): a direct row to Settings (sign out lives there) — one tap instead of the
   * three it took via the "Theme" row, which keeps its own separate behavior. */
  onOpenSettings: () => void;
};

const SHARE_LEVELS: ShareLevel[] = ['me', 'partner', 'family'];
const SHARE_LABEL: Record<ShareLevel, string> = { me: 'Only me', partner: 'Partner', family: 'Family' };

export function ProfileContent({ mega, role, statusLine, sharing, onRename, onOpenLookPersonality, onOpenNotifications, onOpenTheme, onOpenSettings, onChangeSharing, onOpenMemories, onOpenActivity, onOpenRules }: ProfileContentProps) {
  const tokens = useTokens();
  const access = ROLES_CONFIG[role].profile;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(mega.name);
  const save = () => {
    const next = name.trim();
    if (next && next !== mega.name) onRename(next);
    setEditing(false);
  };
  const { hex, sticker, antenna, eyes, eyeColor } = mega.look;

  return (
    <>
      <View style={{ alignItems: 'center', gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}>
        <MegaSprite hex={hex} sticker={sticker} parts={{ antenna, eyes, eyeColor }} face={faceFor(mega.personality)} scale={5} accessibilityLabel={mega.name} />
        {editing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
            <TextInput
              value={name}
              onChangeText={setName}
              onSubmitEditing={save}
              autoFocus
              style={{ color: tokens.text, fontSize: tokens.type.title.fontSize, fontWeight: '700', borderBottomWidth: 1, borderColor: tokens.line, minWidth: 160, minHeight: tokens.touchTarget, textAlign: 'center' }}
              accessibilityLabel={C.nameLabel}
            />
            <Button label={C.save} onPress={save} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
            <Text variant="headline">{mega.name}</Text>
            {access.rename ? (
              <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel={C.rename(mega.name)} style={{ width: tokens.touchTarget, height: tokens.touchTarget, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="title" color="muted">
                  ✎
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
        {statusLine ? <Text color="muted">{statusLine}</Text> : null}
      </View>

      <Row label={C.lookLabel} title={C.lookTitle} onPress={onOpenLookPersonality}>
        <MegaSprite hex={hex} sticker={sticker} parts={{ antenna, eyes, eyeColor }} badge scale={1} accessibilityLabel={mega.name} />
      </Row>

      {access.sharing && sharing ? (
        <Card style={{ marginTop: tokens.spacing.lg }}>
          <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
            {C.shares(mega.name)}
          </Text>
          {(['schedule', 'lists', 'hqActivity'] as const).map((key) => (
            <View key={key} style={{ marginBottom: tokens.spacing.sm }}>
              <Text variant="caption" color="muted" style={{ marginBottom: 4, textTransform: 'capitalize' }}>
                {key === 'hqActivity' ? 'HQ activity' : key}
              </Text>
              <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
                {SHARE_LEVELS.map((level) => (
                  <Chip key={level} label={SHARE_LABEL[level]} selected={sharing[key] === level} onPress={() => onChangeSharing?.({ [key]: level })} />
                ))}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Text variant="caption" color="muted" weight="600" style={{ marginTop: tokens.spacing.lg, marginBottom: tokens.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {C.you}
      </Text>
      <View style={{ gap: tokens.spacing.sm }}>
        <Row label={C.notifications} title={C.notifications} hint={C.notificationsHint} onPress={onOpenNotifications} />
        <Row label={C.theme} title={C.theme} hint={C.themeHint} onPress={onOpenTheme} />
        <Row label={C.settings} title={C.settings} hint={C.settingsHint} onPress={onOpenSettings} />
        {access.memories && onOpenMemories ? <Row label={C.remembers(mega.name)} title={C.remembers(mega.name)} hint={C.remembersHint} onPress={onOpenMemories} /> : null}
        {onOpenRules ? <Row label={G5_UI_COPY.rulesRow} title={G5_UI_COPY.rulesRow} hint={G5_FIX_COPY.kidRulesHint} onPress={onOpenRules} /> : null}
        {onOpenActivity ? <Row label={G5_UI_COPY.activityRow} title={G5_UI_COPY.activityRow} hint={fillCopy(G5_UI_COPY.activityRowHint, { mega: mega.name })} onPress={onOpenActivity} /> : null}
      </View>
    </>
  );
}

/** One tappable profile row: an optional picture, a title and hint, and a chevron (the board's rows). */
function Row({ label, title, hint, onPress, children }: { label: string; title: string; hint?: string; onPress: () => void; children?: React.ReactNode }) {
  const tokens = useTokens();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, minHeight: tokens.touchTarget }}>
        {children}
        <View style={{ flex: 1 }}>
          <Text variant="label">{title}</Text>
          {hint ? (
            <Text variant="caption" color="muted">
              {hint}
            </Text>
          ) : null}
        </View>
        <Text color="muted">›</Text>
      </Card>
    </Pressable>
  );
}
