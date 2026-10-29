// Rules and limits (canvas Screen 16, boards ProfileRules / ProfileRulesKid): a kid's controls (`kidControls`).
// A parent edits them — MEGA intro card, then Notifications (quiet hours; a daily time limit), Searching and
// homework (web search, homework mode, blocked topics as one line of chips) and Tell parents (safety always on,
// blocked searches, a None / Daily / Weekly summary, parents can read chats) — and every change applies at once
// (`kidControls.set`). The kid's version shows the same rows read-only, each with a lock and "Set by a parent",
// in kid sizes (the theme follows the role). Board difference, noted: the board's "Buzzes a day" is a kid's
// notification cap, which lives in the kid's own `settings.notify` and has no parent-side setter in the contract;
// the parent's page sets the contract's daily time limit (`dailyMinutes`) instead.
import { View } from 'react-native';
import type { Infer } from 'convex/values';
import type { kidControlsDoc } from '@shared/domain/api';
import { G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { SETTINGS_UI } from '@shared/config/settingsUi';
import type { StickerId } from '@shared/config/looks';
import { MegaBadge } from '@/ui/MegaBadge';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { ChipLine, LockedRow, SegmentRow, SettingsSection, StepperRow, SwitchRow, ValueRow, clockLabel, shiftClock } from './rows';

export type KidControls = Infer<typeof kidControlsDoc>;
export type KidControlsPatch = Partial<Pick<KidControls, 'homeworkMode' | 'quietHours' | 'dailyMinutes' | 'tellsParents' | 'parentsCanReadChat' | 'webSearch'>>;

export function minutesText(n: number | undefined): string {
  return n ? fillCopy(U.rulesTimeLimitValue, { n }) : U.rulesNoLimit;
}

export function RulesContent({
  controls,
  kidName,
  mega,
  parents,
  editable,
  onPatch,
}: {
  controls: KidControls;
  kidName: string;
  mega: { name: string; hex: string; sticker: StickerId } | null;
  /** "Admin and Partner", for the intro. */
  parents: string;
  editable: boolean;
  onPatch: (patch: KidControlsPatch) => void;
}) {
  const tokens = useTokens();
  const c = controls;
  const quiet = `${clockLabel(c.quietHours.start)} – ${clockLabel(c.quietHours.end)}`;
  const onOff = (v: boolean) => (v ? U.rulesOn : U.rulesOff);
  const { min, max, step } = SETTINGS_UI.kidMinutes;
  const minutes = c.dailyMinutes ?? 0;
  const lock = (label: string, value: string, hint?: string) => <LockedRow label={label} locked={U.setByParent} value={value} hint={hint} />;
  const summaries = [
    { id: 'none' as const, label: U.rulesSummaryNone },
    { id: 'daily' as const, label: U.rulesSummaryDaily },
    { id: 'weekly' as const, label: U.rulesSummaryWeekly },
  ];
  const quietStep = SETTINGS_UI.quietStepMinutes;
  const moveQuiet = (key: 'start' | 'end', d: number) => onPatch({ quietHours: { ...c.quietHours, [key]: shiftClock(c.quietHours[key], d) } });

  return (
    <View style={{ gap: tokens.spacing.xl }} testID="rules-content">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.lg, borderRadius: tokens.radii.xl, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.line }}>
        {mega ? <MegaBadge hex={mega.hex} sticker={mega.sticker} size={44} accessibilityLabel={mega.name} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title">{mega ? `${kidName} · ${mega.name}` : kidName}</Text>
          <Text color="muted">{fillCopy(U.rulesIntroParent, { parents, kid: kidName })}</Text>
        </View>
      </View>

      <SettingsSection title={U.rulesNotifications}>
        {editable ? (
          <>
            <StepperRow label={U.quietFrom} hint={fillCopy(U.rulesQuietHint, { start: clockLabel(c.quietHours.start), end: clockLabel(c.quietHours.end) })} value={clockLabel(c.quietHours.start)} onLess={() => moveQuiet('start', -quietStep)} onMore={() => moveQuiet('start', quietStep)} lessLabel={fillCopy(U.earlier, { label: U.quietFrom })} moreLabel={fillCopy(U.later, { label: U.quietFrom })} />
            <StepperRow label={U.quietUntil} value={clockLabel(c.quietHours.end)} onLess={() => moveQuiet('end', -quietStep)} onMore={() => moveQuiet('end', quietStep)} lessLabel={fillCopy(U.earlier, { label: U.quietUntil })} moreLabel={fillCopy(U.later, { label: U.quietUntil })} />
            <StepperRow
              label={U.rulesTimeLimit}
              hint={fillCopy(U.rulesTimeLimitHint, { mega: mega?.name ?? 'MEGA' })}
              value={minutesText(minutes)}
              onLess={() => onPatch({ dailyMinutes: Math.max(min, minutes - step) })}
              onMore={() => onPatch({ dailyMinutes: Math.min(max, minutes + step) })}
              canLess={minutes > min}
              canMore={minutes < max}
              lessLabel={fillCopy(U.rulesFewer, { label: U.rulesTimeLimit })}
              moreLabel={fillCopy(U.rulesMore, { label: U.rulesTimeLimit })}
            />
          </>
        ) : (
          <>
            {lock(U.quietHours, quiet)}
            {lock(U.rulesTimeLimit, minutesText(minutes))}
          </>
        )}
      </SettingsSection>

      <SettingsSection title={U.rulesSearch}>
        {editable ? <SwitchRow label={U.rulesWebSearch} hint={U.rulesWebSearchHint} value={c.webSearch} onChange={(v) => onPatch({ webSearch: v })} /> : lock(U.rulesWebSearch, onOff(c.webSearch), U.rulesWebSearchHint)}
        {editable ? <SwitchRow label={U.rulesHomework} hint={U.rulesHomeworkHint} value={c.homeworkMode} onChange={(v) => onPatch({ homeworkMode: v })} /> : lock(U.rulesHomework, onOff(c.homeworkMode), U.rulesHomeworkHint)}
        <View style={{ gap: tokens.spacing.sm, padding: tokens.spacing.lg }}>
          <Text variant="label">{U.rulesBlockedTopics}</Text>
          <Text variant="caption" color="muted">
            {c.blockedTopics.length ? fillCopy(U.rulesBlockedHint, { n: c.blockedTopics.length }) : U.rulesBlockedNone}
            {editable ? '' : ` · ${U.setByParent}`}
          </Text>
          {c.blockedTopics.length ? <ChipLine chips={c.blockedTopics.map((t) => ({ id: t, label: t }))} /> : null}
        </View>
      </SettingsSection>

      <SettingsSection title={U.rulesTellParents} note={editable ? fillCopy(U.rulesFoot, { kid: kidName }) : undefined}>
        <ValueRow label={U.rulesSafety} hint={U.rulesSafetyHint} value={U.rulesAlways} />
        {editable ? (
          <SwitchRow label={U.rulesBlockedSearches} hint={U.rulesBlockedSearchesHint} value={c.tellsParents.blockedSearches} onChange={(v) => onPatch({ tellsParents: { ...c.tellsParents, blockedSearches: v } })} />
        ) : (
          lock(U.rulesBlockedSearches, onOff(c.tellsParents.blockedSearches))
        )}
        {editable ? (
          <SegmentRow label={U.rulesSummary} options={summaries} value={c.tellsParents.summary} onChange={(v) => onPatch({ tellsParents: { ...c.tellsParents, summary: v } })} />
        ) : (
          lock(U.rulesSummary, summaries.find((s) => s.id === c.tellsParents.summary)?.label ?? '')
        )}
        {editable ? (
          <SwitchRow label={U.rulesReadChats} hint={fillCopy(U.rulesReadChatsHint, { kid: kidName })} value={c.parentsCanReadChat} onChange={(v) => onPatch({ parentsCanReadChat: v })} />
        ) : (
          lock(U.rulesReadChats, onOff(c.parentsCanReadChat))
        )}
      </SettingsSection>
    </View>
  );
}
