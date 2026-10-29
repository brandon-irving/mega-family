// The `mailFound` card (CONTRACT v0.17 §3; boards OnboardGmailFound, MailFoundRemove, MailFoundNone): what MEGA
// found in the owner's Gmail, already on their PRIVATE calendar. Rows come from `mail.items` (owner only): a
// kind icon, the title (a bill shows its amount), the date and who it's from, and a 44pt × that removes the item
// and the private event/reminder it made (`mail.dismiss`). A removed row collapses to one line, and the title's
// count follows. With nothing left it's a full card ("Nothing needs you…"), never empty. Sharing is a separate
// suggestion card the server posts (shareSuggestion); this card never shares anything.
import type { Id } from '@shared/domain/validators';
import type { MailItemView } from '@shared/domain/api';
import { G5_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { ONBOARDING } from '@shared/config/onboarding';
import { useAccountActions, useMailItems } from '@/data/useAccounts';
import { useRunAction } from '@/features/shell/useRunAction';
import { CardFallback } from '@/features/kids/CardFallback';
import { IconCard } from '@/features/integrations/G4Card';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { View } from 'react-native';
import { MAIL_GLYPH, mailRow } from './accountFormat';
import { ListRow, RemoveButton } from './parts';

const TILE: Record<MailItemView['kind'], 'household' | 'accent' | 'bucks' | 'danger'> = { event: 'household', reminder: 'accent', bill: 'bucks', delivery: 'danger' };

export function foundTitle(live: number): string {
  if (live === 0) return fillCopy(G5_COPY.foundNone, { days: ONBOARDING.gmailFirstLookDays });
  return live === 1 ? G5_COPY.foundIntroOne : fillCopy(G5_COPY.foundIntro, { count: live });
}

export function MailFoundCardView({ items, megaName, busy, error, onRemove }: { items: MailItemView[]; megaName: string; busy?: string | null; error?: string | null; onRemove: (itemId: Id<'mailItems'>) => void }) {
  const tokens = useTokens();
  const live = items.filter((i) => i.status === 'added').length;
  const from = fillCopy(U.fromFound, { mega: megaName });
  if (live === 0 && items.every((i) => i.status !== 'dismissed')) {
    return <IconCard from={from} icon="mail" title={foundTitle(0)} body={U.foundNoneBody} foot={G5_COPY.privateFoot} testID="mail-found-card" />;
  }
  return (
    <IconCard from={from} icon="mail" title={foundTitle(live)} status={error ? { text: error, color: tokens.warn } : null} foot={G5_COPY.foundFoot} testID="mail-found-card">
      <View>
        {items.map((item, i) => {
          if (item.status === 'dismissed') {
            return (
              <Text key={item.itemId} variant="caption" color="muted" style={{ paddingVertical: tokens.spacing.sm, borderTopWidth: i ? 1 : 0, borderTopColor: tokens.line }}>
                {fillCopy(U.foundRemovedRow, { title: item.title })}
              </Text>
            );
          }
          const row = mailRow(item);
          return (
            <ListRow
              key={item.itemId}
              first={i === 0}
              icon={MAIL_GLYPH[item.kind]}
              tile={TILE[item.kind]}
              title={row.title}
              sub={row.sub}
              trailing={<RemoveButton label={fillCopy(G5_COPY.foundRemove, { title: item.title })} onPress={() => onRemove(item.itemId)} disabled={busy === item.itemId} />}
            />
          );
        })}
      </View>
    </IconCard>
  );
}

export function MailFoundCard({ itemIds, megaName }: { itemIds: Id<'mailItems'>[]; megaName: string }) {
  const state = useMailItems(itemIds);
  const { dismissMail } = useAccountActions();
  const { busy, error, run } = useRunAction();
  if (itemIds.length === 0) return <MailFoundCardView items={[]} megaName={megaName} onRemove={() => {}} />;
  if (state.status !== 'ok') return <CardFallback state={state} from={fillCopy(U.fromFound, { mega: megaName })} />;
  return <MailFoundCardView items={state.data} megaName={megaName} busy={busy} error={error} onRemove={(itemId) => void run(itemId, () => dismissMail({ itemId }))} />;
}
