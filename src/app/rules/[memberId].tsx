// A kid's Rules and limits for their parents (canvas Screen 16, board ProfileRules), opened from the kid's
// member page. `family.member` returns `kidControls` only to the kid's parents; anyone else gets the read-only
// line instead of the page. Changes apply at once through `kidControls.set` (the server re-checks parenthood).
// The kid's own read-only version (board ProfileRulesKid) is /mega-profile/rules. "Buzzes a day" shows once the
// server reports the kid's cap (`kidControls.notifyCap`, CONTRACT v0.17b pending).
import { router, useLocalSearchParams } from 'expo-router';
import type { Id } from '@shared/domain/validators';
import { G5_UI_COPY as U, KIDS_COPY } from '@shared/config/copy';
import { LIMITS } from '@shared/config/limits';
import type { StickerId } from '@shared/config/looks';
import { useFamilyMembers, useKidDailyCap, useMemberDetail, useSetKidControls, useSetKidDailyCap } from '@/data/useFamily';
import { joinNames } from '@/features/holidays/HolidayCard';
import { RulesContent } from '@/features/settings/RulesContent';
import { AdultOnly } from '@/features/shell/RoleGate';
import { MegaLoader } from '@/features/walkers';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

/** Adults only (G5 UX review): a kid reads their own rules from their MEGA profile instead (/mega-profile/rules). */
export default function RulesRoute() {
  return (
    <AdultOnly>
      <RulesScreen />
    </AdultOnly>
  );
}

function RulesScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const id = memberId as Id<'members'>;
  const detail = useMemberDetail(id);
  const members = useFamilyMembers();
  const setKidControls = useSetKidControls();
  const buzzCap = useKidDailyCap(id);
  const setBuzzCap = useSetKidDailyCap();

  if (detail === undefined) return <MegaLoader />;
  const controls = detail?.kidControls;
  const parents = joinNames((members ?? []).filter((m) => m.member.role !== 'kid').map((m) => m.member.name));

  return (
    <Sheet title={U.rulesTitle} onClose={() => router.back()}>
      {detail && controls ? (
        <RulesContent
          controls={controls}
          kidName={detail.member.name}
          mega={detail.mega ? { name: detail.mega.name, hex: detail.mega.look.hex, sticker: detail.mega.look.sticker as StickerId } : null}
          parents={parents}
          editable
          onPatch={(patch) => void setKidControls({ memberId: id, patch }).catch(() => null)}
          buzzCap={buzzCap !== undefined ? { value: buzzCap, ...LIMITS.push.kidDailyCapRange } : undefined}
          onBuzzCap={(dailyCap) => void setBuzzCap({ memberId: id, dailyCap }).catch(() => null)}
        />
      ) : (
        <Text color="muted">{KIDS_COPY.notReady}</Text>
      )}
    </Sheet>
  );
}
