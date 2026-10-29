// A kid's own Rules and limits, read-only (canvas Screen 16, board ProfileRulesKid; G5 UX review): every row
// locked "Set by a parent", in the MEGA profile's stack. Kids only — an adult changes a kid's rules from that
// kid's Family page (/rules/[memberId]). The data is `kidControls.mine` (CONTRACT v0.17b): the kid's control
// fields, buzzes a day and their parents' names; until it answers, the page says the rules aren't ready.
import { Redirect, router } from 'expo-router';
import { KIDS_COPY, G5_UI_COPY as U } from '@shared/config/copy';
import { LIMITS } from '@shared/config/limits';
import type { StickerId } from '@shared/config/looks';
import { useMyRules } from '@/data/useFamily';
import { useViewer } from '@/data/useViewer';
import { joinNames } from '@/features/holidays/HolidayCard';
import { RulesContent } from '@/features/settings/RulesContent';
import { MegaLoader } from '@/features/walkers';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

export default function KidRulesRoute() {
  const viewer = useViewer();
  const isKid = viewer?.member.role === 'kid';
  const mine = useMyRules(isKid);

  if (viewer === undefined) return <MegaLoader />;
  if (!viewer || !isKid) return <Redirect href="/chat" />;
  const parents = joinNames(mine?.parents ?? []);

  return (
    <Sheet title={U.rulesTitle} onClose={() => router.back()}>
      {mine ? (
        <>
          <RulesContent
            controls={mine}
            kidName={viewer.member.name}
            mega={viewer.mega ? { name: viewer.mega.name, hex: viewer.mega.look.hex, sticker: viewer.mega.look.sticker as StickerId } : null}
            parents={parents}
            editable={false}
            onPatch={() => undefined}
            buzzCap={{ value: mine.dailyCap, ...LIMITS.push.kidDailyCapRange }}
          />
        </>
      ) : (
        <Text color="muted">{KIDS_COPY.notReady}</Text>
      )}
    </Sheet>
  );
}
