// The profile keeps identity compact and gives customization and privacy their own focused editors.
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { megaDoc } from '@shared/domain/api';
import type { Role, ShareLevel } from '@shared/domain/enums';
import { PROFILE_COPY as C } from '@shared/config/copy';
import { ROLES_CONFIG } from '@shared/config/roles';
import { Button } from '@/ui/Button';
import { MegaSprite } from '@/ui/MegaSprite';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { faceFor } from '@/features/shell/megaInfo';
import { LinkRow, SettingsSection } from '@/features/settings/rows';
import { errorCopyFor } from '@/data/errorCopy';

export type MegaDoc = Infer<typeof megaDoc>;
export type Sharing = { schedule: ShareLevel; lists: ShareLevel; hqActivity: ShareLevel };
export type ProfileContentProps = {
  mega: MegaDoc;
  role: Role;
  statusLine: string;
  isAdmin: boolean;
  sharing?: Sharing;
  onRename: (name: string) => Promise<unknown> | void;
  onOpenLookPersonality: () => void;
  onOpenSharing?: () => void;
  onOpenMemories?: () => void;
  onOpenActivity?: () => void;
  onOpenRules?: () => void;
  settingsAction?: ReactNode;
};

export function ProfileContent({ mega, role, statusLine, sharing, onRename, onOpenLookPersonality, onOpenSharing, onOpenMemories, onOpenActivity, onOpenRules, settingsAction }: ProfileContentProps) {
  const tokens = useTokens();
  const access = ROLES_CONFIG[role].profile;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(mega.name);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const next = name.trim();
    if (!next || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      if (next !== mega.name) await onRename(next);
      setEditing(false);
    } catch (err) {
      setError(errorCopyFor(err));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const { hex, sticker, antenna, eyes, eyeColor } = mega.look;
  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
        <View style={{ padding: tokens.spacing.sm, borderRadius: tokens.radii.xl, backgroundColor: tokens.surface }}>
          <MegaSprite hex={hex} sticker={sticker} parts={{ antenna, eyes, eyeColor }} face={faceFor(mega.personality)} scale={2} accessibilityLabel={mega.name} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: tokens.spacing.xs }}>
          <Text variant="headline">{mega.name}</Text>
          {statusLine ? <Text variant="caption" color="muted">{statusLine}</Text> : null}
          <Button label="Customize" accessibilityLabel={C.lookLabel} variant="secondary" onPress={onOpenLookPersonality} style={{ alignSelf: 'flex-start' }} />
        </View>
        {settingsAction}
      </View>
      {editing ? (
        <View style={{ gap: tokens.spacing.sm }}>
          <TextInput value={name} onChangeText={setName} onSubmitEditing={() => void save()} autoFocus editable={!busy} maxLength={60} accessibilityLabel={C.nameLabel}
            style={{ color: tokens.text, borderWidth: 1, borderColor: tokens.line, borderRadius: tokens.radii.md, padding: tokens.spacing.md, minHeight: tokens.touchTarget }} />
          {error ? <Text accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
            <Button label={C.save} onPress={() => void save()} loading={busy} disabled={!name.trim()} />
            <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => setEditing(false)} />
          </View>
        </View>
      ) : access.rename ? (
        <Pressable onPress={() => { setName(mega.name); setError(null); setEditing(true); }} accessibilityRole="button" accessibilityLabel={C.rename(mega.name)} style={{ minHeight: tokens.touchTarget, justifyContent: 'center' }}>
          <Text color="accent">Rename {mega.name}</Text>
        </Pressable>
      ) : null}
      <SettingsSection title="Your MEGA">
        {access.memories && onOpenMemories ? <LinkRow label="Memories" hint="Review and forget what your MEGA remembers." onPress={onOpenMemories} /> : null}
        {access.sharing && sharing && onOpenSharing ? <LinkRow label="Privacy & sharing" hint="Choose who sees your schedule, lists, and HQ activity." onPress={onOpenSharing} /> : null}
        {role === 'kid' && onOpenRules ? <LinkRow label="Rules and limits" hint="See the rules your grown-ups set." onPress={onOpenRules} /> : null}
        {role === 'admin' && onOpenActivity ? <LinkRow label="Activity" hint="See what your family's MEGAs did and why." onPress={onOpenActivity} /> : null}
      </SettingsSection>
    </View>
  );
}
