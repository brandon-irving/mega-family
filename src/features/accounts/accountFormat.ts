// Small pure helpers shared by the G5 connect cards and Settings → Connected accounts (canvas Screen 16):
// what each kind is called, its status pill, "Checked 5 min ago", and the found-mail row lines. Copy comes
// from config (G5_COPY / G5_UI_COPY); the status tone maps to theme tokens in the components.
import type { IntegrationView, MailItemView } from '@shared/domain/api';
import { G5_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { formatPriceCents } from '@shared/config/shopping';
import type { GoogleProduct } from '@/data/useAccounts';
import type { GlyphName } from '@/features/integrations/glyphs';

export type Tone = 'ok' | 'warn' | 'danger' | 'muted';

/** "Gmail", "Google Calendar", "This phone's calendar", or a schedule link's own title. */
export function kindName(i: Pick<IntegrationView, 'kind' | 'label'>): string {
  switch (i.kind) {
    case 'gmail':
      return U.gmail;
    case 'googleCalendar':
      return U.googleCalendar;
    case 'deviceCalendar':
      return U.phoneCalendar;
    default:
      return i.label || U.sectionLinks;
  }
}

export const KIND_GLYPH: Record<IntegrationView['kind'], GlyphName> = { gmail: 'mail', googleCalendar: 'calendar', deviceCalendar: 'phone', ics: 'link', weather: 'sun' };

export function statusPill(status: IntegrationView['status']): { text: string; tone: Tone } {
  switch (status) {
    case 'needs_reconnect':
      return { text: G5_COPY.accountNeedsReconnect, tone: 'warn' };
    case 'error':
      return { text: G5_COPY.accountError, tone: 'danger' };
    case 'disconnected':
      return { text: U.off, tone: 'muted' };
    case 'connecting':
      return { text: U.connecting, tone: 'muted' };
    default:
      return { text: G5_COPY.accountConnected, tone: 'ok' };
  }
}

/** "just now", "5 min ago", "2 h ago", "3 d ago" between two instants (`now` is the family clock's). */
export function agoText(now: number, at: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return U.agoJustNow;
  if (minutes < 60) return fillCopy(U.agoMinutes, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return fillCopy(U.agoHours, { n: hours });
  return fillCopy(U.agoDays, { n: Math.floor(hours / 24) });
}

/** "Checked 5 min ago", or for a feed that's failing, "Last worked yesterday" style; never a raw timestamp. */
export function checkedLine(i: Pick<IntegrationView, 'lastSyncAt' | 'status'>, now: number | undefined): string {
  if (!i.lastSyncAt || now === undefined) return U.notCheckedYet;
  const ago = agoText(now, i.lastSyncAt);
  return i.status === 'error' ? fillCopy(U.lastWorked, { ago }) : fillCopy(G5_COPY.accountLastChecked, { ago });
}

/** What a lapsed Google grant can't check right now ("your Gmail and Google Calendar"). */
export function reconnectWhat(kinds: IntegrationView['kind'][]): string {
  const gmail = kinds.includes('gmail');
  const cal = kinds.includes('googleCalendar');
  if (gmail && cal) return U.reconnectWhatBoth;
  return cal ? U.reconnectWhatCalendar : U.reconnectWhatGmail;
}

/** The Google products behind integrations (Reconnect asks for all of them again in one consent). */
export function googleProductsOf(kinds: IntegrationView['kind'][]): GoogleProduct[] {
  const out: GoogleProduct[] = [];
  if (kinds.includes('gmail')) out.push('gmail');
  if (kinds.includes('googleCalendar')) out.push('googleCalendar');
  return out.length ? out : ['gmail'];
}

const DAY_FMT: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' };

/** A mail item's local `when` ("2026-11-06" or "2026-11-06T15:30") as "Fri, Nov 6" / "Tue, Nov 3 · 3:30 PM".
 * The value is already the family's local date and time, so it's formatted as-is (UTC fields), never shifted. */
export function whenText(when: string | undefined): string {
  if (!when) return '';
  const m = when.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return '';
  const [, y, mo, d, hh, mm] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0)));
  const day = date.toLocaleDateString('en-US', DAY_FMT);
  if (hh === undefined) return day;
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  return `${day} · ${time}`;
}

export const MAIL_GLYPH: Record<MailItemView['kind'], GlyphName> = { event: 'calendar', reminder: 'bell', bill: 'bill', delivery: 'box' };

/** Board MailFoundRemove: "Water bill $48" / "Due Thu, Nov 12 · From the city". */
export function mailRow(item: MailItemView): { title: string; sub: string } {
  const title = item.amountCents !== undefined ? `${item.title} ${formatPriceCents(item.amountCents)}` : item.title;
  const when = whenText(item.when);
  const date = item.kind === 'bill' && when ? fillCopy(U.foundDue, { date: when }) : when;
  return { title, sub: [date, item.sourceLabel].filter(Boolean).join(' · ') };
}
