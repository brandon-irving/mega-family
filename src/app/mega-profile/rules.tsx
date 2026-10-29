// A kid's own Rules and limits, read-only (canvas Screen 16, board ProfileRulesKid; G5 UX review): every row
// locked "Set by a parent", in the MEGA profile's stack. Kids only — an adult changes a kid's rules from that
// kid's Family page (/rules/[memberId]). The data is `kidControls.mine` (CONTRACT v0.17b, pending): until the
// backend has it, the page says the rules aren't ready instead of guessing.
import { Redirect, router } from 'expo-router';
import { G5_FIX_COPY, KIDS_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
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
          <Text color="muted">{fillCopy(G5_FIX_COPY.kidRulesIntro, { parents })}</Text>
          <RulesContent
            controls={mine.controls}
            kidName={viewer.member.name}
            mega={viewer.mega ? { name: viewer.mega.name, hex: viewer.mega.look.hex, sticker: viewer.mega.look.sticker as StickerId } : null}
            parents={parents}
            editable={false}
            onPatch={() => undefined}
          />
        </>
      ) : (
        <Text color="muted">{KIDS_COPY.notReady}</Text>
      )}
    </Sheet>
  );
}
