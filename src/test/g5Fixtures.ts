// G5 (CONTRACT v0.17) fixtures for the Screen 13 onboarding chat, Settings → Connected accounts and found mail,
// shaped exactly like the contract's cards and view models. Synthetic only: sample labels (Admin, Partner, Twin 1,
// Twin 2), a made-up Gmail address on example.com, and made-up school, dentist and bill emails (board
// OnboardGmailFound).
import type { DeviceEventInput, IntegrationView, MailItemView, OfferView, OnboardingView } from '@shared/domain/api';
import type { Card } from '@shared/domain/messages';

const id = <T,>(s: string) => s as unknown as T;
export const IDS = { admin: 'm_admin', partner: 'm_partner', twin1: 'm_twin1', twin2: 'm_twin2' } as const;
/** Thu Oct 29 2026, 2:00 PM New York. */
export const T0 = Date.UTC(2026, 9, 29, 18, 0);
const H = 60 * 60 * 1000;

// ---------- onboarding.state, step by step (boards OnboardChat … OnboardNext) ----------

export const ONBOARDING_NAME: OnboardingView = { step: 'name', outcomes: {} };
export const ONBOARDING_GMAIL: OnboardingView = { step: 'gmail', outcomes: {}, callMe: 'Admin' };
export const ONBOARDING_CALENDAR: OnboardingView = { step: 'calendar', outcomes: { gmail: 'connected' }, callMe: 'Admin' };
export const ONBOARDING_ICS: OnboardingView = { step: 'ics', outcomes: { gmail: 'connected', calendar: 'skipped' }, callMe: 'Admin' };
export const ONBOARDING_FAMILY: OnboardingView = { step: 'family', outcomes: { gmail: 'connected', calendar: 'connected', ics: 'connected' }, callMe: 'Admin' };
export const ONBOARDING_DONE: OnboardingView = { ...ONBOARDING_FAMILY, step: 'done' };

// ---------- integrations ----------

export const GMAIL_CONNECTED: IntegrationView = {
  integrationId: id('in_gmail'),
  kind: 'gmail',
  status: 'connected',
  label: 'mega.demo.family@example.com',
  connectedAt: T0 - 2 * H,
  lastSyncAt: T0 - 5 * 60_000,
  countThisMonth: 3,
};
export const GMAIL_NEEDS_RECONNECT: IntegrationView = { ...GMAIL_CONNECTED, status: 'needs_reconnect', lastFailure: 'unauthorized' };
export const GOOGLE_CAL_CONNECTED: IntegrationView = { integrationId: id('in_gcal'), kind: 'googleCalendar', status: 'connected', label: 'mega.demo.family@example.com', connectedAt: T0 - 2 * H, lastSyncAt: T0 - 20 * 60_000, countThisMonth: 24 };
export const PHONE_CAL_CONNECTED: IntegrationView = { integrationId: id('in_device'), kind: 'deviceCalendar', status: 'connected', label: 'iPhone calendars', connectedAt: T0 - H, lastSyncAt: T0 - 10 * 60_000, countThisMonth: 24 };
export const ICS_CONNECTED: IntegrationView = { integrationId: id('in_ics'), kind: 'ics', status: 'connected', label: 'Soccer · Fall season', host: 'calendar.example-league.test', connectedAt: T0 - H, lastSyncAt: T0 - 15 * 60_000, countThisMonth: 9 };
export const ICS_ERROR: IntegrationView = { ...ICS_CONNECTED, integrationId: id('in_ics2'), label: 'Maple Elementary', host: 'maple-elementary.example.org', status: 'error', lastFailure: 'error' };
export const INTEGRATIONS: IntegrationView[] = [GMAIL_CONNECTED, GOOGLE_CAL_CONNECTED, ICS_CONNECTED];

// ---------- integrations.offer (the `connect` card's live state) ----------

export const OFFER_GMAIL: OfferView = { offer: 'gmail', state: 'offered', integrations: [], available: { google: true } };
export const OFFER_GMAIL_CONNECTED: OfferView = { ...OFFER_GMAIL, state: 'connected', integrations: [GMAIL_CONNECTED] };
export const OFFER_GMAIL_SKIPPED: OfferView = { ...OFFER_GMAIL, state: 'skipped' };
export const OFFER_GMAIL_FAILED: OfferView = { ...OFFER_GMAIL, state: 'failed', failure: 'error' };
/** Google env not set on this deployment: the card says it isn't set up (never a broken button). */
export const OFFER_GMAIL_UNAVAILABLE: OfferView = { ...OFFER_GMAIL, available: { google: false } };
export const OFFER_CALENDAR: OfferView = { offer: 'calendar', state: 'offered', integrations: [], available: { google: true } };
export const OFFER_CALENDAR_PHONE: OfferView = { ...OFFER_CALENDAR, state: 'connected', integrations: [PHONE_CAL_CONNECTED] };
export const OFFER_ICS: OfferView = { offer: 'ics', state: 'offered', integrations: [], available: { google: true } };
export const OFFER_ICS_ADDED: OfferView = { ...OFFER_ICS, state: 'connected', integrations: [ICS_CONNECTED] };

// ---------- mail.items (board OnboardGmailFound) ----------

export const MAIL_ITEMS: MailItemView[] = [
  { itemId: id('mi_1'), kind: 'event', title: 'Picture day', sourceLabel: 'From the school office', when: '2026-11-06', status: 'added', eventId: id('ev_picture') },
  { itemId: id('mi_2'), kind: 'reminder', title: 'Dentist reminder', sourceLabel: 'From the dental office', when: '2026-11-03T15:30', status: 'added', reminderId: id('re_dentist') },
  { itemId: id('mi_3'), kind: 'bill', title: 'Water bill due', sourceLabel: 'From the city', when: '2026-11-12', amountCents: 4800, status: 'added', reminderId: id('re_water') },
];
export const MAIL_ITEM_DISMISSED: MailItemView = { ...MAIL_ITEMS[2], status: 'dismissed' };

// ---------- cards in the admin's thread ----------

export const CARD_CONNECT_GMAIL: Card = { kind: 'connect', offer: 'gmail' };
export const CARD_CONNECT_CALENDAR: Card = { kind: 'connect', offer: 'calendar' };
export const CARD_CONNECT_ICS: Card = { kind: 'connect', offer: 'ics' };
export const CARD_MAIL_FOUND: Card = { kind: 'mailFound', integrationId: id('in_gmail'), itemIds: MAIL_ITEMS.map((m) => m.itemId) };
export const CARD_RECONNECT: Card = { kind: 'reconnect', integrationId: id('in_gmail') };

// ---------- integrations.syncDevice input (what the app reads with expo-calendar) ----------

export const DEVICE_EVENTS: DeviceEventInput[] = [
  { externalId: 'dev-1', calendarId: 'cal-home', title: 'Parent-teacher conference', start: T0 + 26 * H, end: T0 + 27 * H },
  { externalId: 'dev-2', calendarId: 'cal-home', title: 'Grandma visits', start: Date.UTC(2026, 10, 7, 4, 0), allDay: '2026-11-07' },
];
