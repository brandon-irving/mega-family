// G4 Screen 14 chat cards (CONTRACT v0.15 §3): search (boards Integrations, SearchKid, SearchKidRephrased,
// SearchKidBlocked), weather (Weather, WeatherAlert) and travel (Travel, TravelNotSetUp). Their content lives on
// the card itself (written only into the asker's own thread), so each view is pure; the exported cards just add
// the viewer's timezone and role. Kid sizing comes from tokens (type scale, buttonSize), never a per-card number.
// Fail closed (G4 invariant 7): a travel card with `failure` never shows minutes; a weather card without data
// shows only its summary line.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Card as CardKind } from '@shared/domain/messages';
import { G4_COPY, G4B_COPY, G4B_UI_COPY, fillCopy } from '@shared/config/copy';
import { INTEGRATION_COPY } from '@shared/config/integrations';
import { WEATHER_CARD, weatherIconFor } from '@shared/config/weatherIcons';
import { formatLocalHour, formatLocalTime } from '@shared/time';
import { useTravelAnswer } from '@/data/useIntegrations';
import { useViewer } from '@/data/useViewer';
import { useRunAction } from '@/features/shell/useRunAction';
import { domainOf, openLink } from '@/services/openLink';
import { Text } from '@/ui/Text';
import { type CardAction, CardActions, LockNote } from '@/ui/ThreadCard';
import { useTokens, type Tokens } from '@/ui/theme';
import { Glyph, WeatherIcon } from './glyphs';
import { G4Card, IconCard } from './G4Card';
import { aqiLevel, type LevelInfo, toneColors, uvLevel } from './airLevels';

type SearchCard = Extract<CardKind, { kind: 'search' }>;
type WeatherCard = Extract<CardKind, { kind: 'weather' }>;
type TravelCard = Extract<CardKind, { kind: 'travel' }>;
type Severity = NonNullable<WeatherCard['alert']>['severity'];

// ---------- Search ----------

export function SearchCardView({ card, megaName, isKid, onOpenSource }: { card: SearchCard; megaName: string; isKid: boolean; onOpenSource: (url: string) => void }) {
  const tokens = useTokens();
  const blocked = card.outcome === 'blocked';
  const sources = blocked ? [] : card.sources;
  return (
    <G4Card label={fillCopy(G4_COPY.searchFrom, { mega: megaName })} from={fillCopy(G4_COPY.searchFrom, { mega: megaName })} fromIcon="search" testID="search-card">
      {card.outcome === 'rephrased' && card.rephrasedTo ? (
        <View style={{ borderRadius: tokens.radii.md, backgroundColor: tokens.bg, borderWidth: 1, borderColor: tokens.line, paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md, gap: 2 }}>
          <Text variant="label" weight="400" color="muted">
            {G4_COPY.searchRephrased}
          </Text>
          <Text variant="label">{fillCopy(G4_COPY.searchQuoted, { text: card.rephrasedTo })}</Text>
        </View>
      ) : null}
      <Text>{card.answer}</Text>
      {sources.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text variant="caption" weight="700" color="muted" style={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>
            {G4_COPY.searchSources}
          </Text>
          {sources.map((s) => (
            <SourceRow key={s.url} title={s.title} domain={domainOf(s.url)} onPress={() => onOpenSource(s.url)} />
          ))}
        </View>
      ) : null}
      {blocked && isKid && card.parentsTold === true ? <LockNote text={G4_COPY.searchKidBlockedNote} /> : null}
    </G4Card>
  );
}

function SourceRow({ title, domain, onPress }: { title: string; domain: string; onPress: () => void }) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={fillCopy(G4_COPY.searchOpenSource, { title, domain })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.md,
        minHeight: tokens.buttonSize.height,
        borderRadius: tokens.radii.md,
        backgroundColor: tokens.bg,
        borderWidth: 1,
        borderColor: tokens.line,
        paddingVertical: tokens.spacing.sm,
        paddingHorizontal: tokens.spacing.md,
      }}
    >
      <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: tokens.line, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption" weight="700" color="muted">
          {(domain[0] ?? '?').toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {domain}
        </Text>
      </View>
      <Glyph name="chevron" color={tokens.muted} size={16} />
    </Pressable>
  );
}

// ---------- Weather ----------

export function severityColors(tokens: Tokens, severity: Severity): { fg: string; bg: string } {
  if (severity === 'Extreme' || severity === 'Severe') return { fg: tokens.danger, bg: tokens.dangerSurface };
  if (severity === 'Moderate') return { fg: tokens.warn, bg: tokens.warnSurface };
  return { fg: tokens.muted, bg: tokens.bg };
}

export function WeatherCardView({ card, tz, megaName = 'MEGA' }: { card: WeatherCard; tz: string; megaName?: string }) {
  const tokens = useTokens();
  if (card.tip === 'uv' || card.tip === 'air') return <AirTipCardView card={card} tz={tz} megaName={megaName} />;
  const place = card.placeLabel ?? '';
  const hours = (card.hours ?? []).slice(0, WEATHER_CARD.hours);
  // "Now" is the live current temperature (v0.15a `nowF`, Open-Meteo's current block); older cards fall back to
  // the forecast hour the card was written in. Never a made-up reading.
  const nowTempF = card.nowF ?? hours[0]?.tempF;
  const alert = card.alert;
  const sev = alert ? severityColors(tokens, alert.severity) : null;
  return (
    <G4Card label={place ? fillCopy(G4_COPY.weatherLabel, { place }) : card.summary} testID="weather-card">
      {alert && sev ? (
        <View accessibilityRole="alert" style={{ borderRadius: tokens.radii.lg, backgroundColor: sev.bg, borderWidth: 1, borderColor: sev.fg, paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
            <Glyph name="alert" color={sev.fg} size={14} stroke={2.4} />
            <Text variant="caption" weight="700" style={{ color: sev.fg, letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 1 }}>
              {fillCopy(G4_COPY.weatherAlertTitle, { event: alert.event, severity: alert.severity })}
            </Text>
          </View>
          <Text variant="label">{alert.headline}</Text>
          {alert.ends ? (
            <Text variant="caption" color="muted">
              {fillCopy(G4_COPY.weatherAlertUntil, { time: formatLocalTime(alert.ends, tz) })}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          {place ? (
            <Text variant="caption" weight="700" color="muted">
              {fillCopy(G4_COPY.weatherNow, { place })}
            </Text>
          ) : null}
          <Text color="muted">{card.summary}</Text>
        </View>
        {nowTempF !== undefined ? (
          <Text variant="display" accessibilityLabel={`${Math.round(nowTempF)} degrees`}>
            {`${Math.round(nowTempF)}°`}
          </Text>
        ) : null}
      </View>
      {hours.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {hours.map((h) => {
            const { icon, label } = weatherIconFor(h.code);
            return (
              <View key={h.at} style={{ flex: 1, minWidth: 0, borderRadius: tokens.radii.md, backgroundColor: tokens.bg, borderWidth: 1, borderColor: tokens.line, paddingVertical: tokens.spacing.sm, alignItems: 'center', gap: 5 }}>
                <Text variant="caption" color="muted" numberOfLines={1}>
                  {formatLocalHour(h.at, tz)}
                </Text>
                <WeatherIcon icon={icon} label={label} />
                <Text variant="label">{`${Math.round(h.tempF)}°`}</Text>
                <Text variant="caption" style={{ color: h.precipPct >= WEATHER_CARD.rainHighlightPct ? tokens.household : tokens.muted }}>
                  {fillCopy(G4_COPY.weatherRain, { pct: Math.round(h.precipPct) })}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {card.highF !== undefined || hours.length > 0 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: tokens.spacing.sm }}>
          <Text variant="caption" color="muted" style={{ flexShrink: 1 }}>
            {card.highF !== undefined && card.lowF !== undefined ? fillCopy(G4_COPY.weatherHighLow, { high: Math.round(card.highF), low: Math.round(card.lowF) }) : ''}
          </Text>
          <Text variant="caption" color="muted">
            {alert ? G4_COPY.weatherSourceAlert : G4_COPY.weatherSourceForecast}
          </Text>
        </View>
      ) : null}
      <AirTiles air={card.air} />
    </G4Card>
  );
}

// ---------- Air quality and UV (G4b, boards WeatherAir / WeatherAirTips) ----------

/** The two tiles under the forecast (board WeatherAir): today's peak UV and the US AQI now, each a pixel
 * number, its level word in the level's color, and a small line under it. Missing numbers draw no tile (never
 * a guessed reading); no air at all (the air call failed or hasn't run) draws nothing. Board gap: the hourly
 * tiles keep the rain chance, because the card's hours carry no UV (CONTRACT v0.16 `weather.hours`). */
export function AirTiles({ air }: { air: WeatherCard['air'] }) {
  const tokens = useTokens();
  const tiles: { key: string; label: string; info: LevelInfo; sub: string; a11y: string }[] = [];
  if (air?.uvIndexMax !== undefined) {
    const info = uvLevel(air.uvIndexMax);
    tiles.push({ key: 'uv', label: G4B_UI_COPY.airUvTile, info, sub: fillCopy(G4B_COPY.airUv, { uv: info.value }), a11y: fillCopy(G4B_UI_COPY.airUvLabel, { uv: info.value, level: info.word }) });
  }
  if (air?.usAqi !== undefined) {
    const info = aqiLevel(air.usAqi);
    tiles.push({ key: 'aqi', label: G4B_UI_COPY.airAqiTile, info, sub: G4B_UI_COPY.airAqiUnit, a11y: fillCopy(G4B_UI_COPY.airAqiLabel, { aqi: info.value, level: info.word }) });
  }
  if (tiles.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
      {tiles.map((t) => (
        <LevelTile key={t.key} label={t.label} info={t.info} sub={t.sub} a11y={t.a11y} />
      ))}
    </View>
  );
}

function LevelTile({ label, info, sub, a11y }: { label: string; info: LevelInfo; sub: string; a11y: string }) {
  const tokens = useTokens();
  const c = toneColors(tokens, info.tone);
  return (
    <View accessible accessibilityLabel={a11y} testID="air-tile" style={{ flex: 1, minWidth: 0, borderRadius: tokens.radii.lg, backgroundColor: c.bg, borderWidth: 1, borderColor: c.fg, paddingVertical: 10, paddingHorizontal: tokens.spacing.md, gap: 2 }}>
      <Text variant="caption" weight="700" color="muted" numberOfLines={1} style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: tokens.spacing.sm }}>
        <Text variant="headline" style={{ fontVariant: ['tabular-nums'] }}>
          {info.value}
        </Text>
        <Text variant="label" numberOfLines={1} style={{ color: c.fg, flexShrink: 1 }}>
          {info.word}
        </Text>
      </View>
      <Text variant="caption" color="muted" numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

/** A UV or air-quality event tip (board WeatherAirTips): the tip line as the title, where and when as the body,
 * and the number + level in a chip matching the weather card's tile. Board gap: "Add to the bag list" / "Thanks"
 * have no function in CONTRACT v0.16, so the tip has no buttons. */
export function AirTipCardView({ card, tz, megaName }: { card: WeatherCard; tz: string; megaName: string }) {
  const tokens = useTokens();
  const uv = card.tip === 'uv';
  const value = uv ? (card.air?.uvAt ?? card.air?.uvIndexMax) : card.air?.usAqi;
  const info = value === undefined ? null : uv ? uvLevel(value) : aqiLevel(value);
  const c = info ? toneColors(tokens, info.tone) : null;
  const when = card.at !== undefined ? formatLocalTime(card.at, tz) : '';
  const body = [card.placeLabel, when].filter(Boolean).join(' · ');
  return (
    <IconCard from={fillCopy(uv ? G4B_UI_COPY.tipUvFrom : G4B_UI_COPY.tipAirFrom, { mega: megaName })} icon={uv ? 'sun' : 'air'} title={card.summary} body={body || undefined} testID="air-tip-card">
      {info && c ? (
        <View
          accessible
          accessibilityLabel={uv ? fillCopy(G4B_UI_COPY.airUvLabel, { uv: info.value, level: info.word }) : fillCopy(G4B_UI_COPY.airAqiLabel, { aqi: info.value, level: info.word })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: tokens.radii.lg, backgroundColor: c.bg, borderWidth: 1, borderColor: c.fg, paddingVertical: 10, paddingHorizontal: tokens.spacing.md }}
        >
          <Text variant="headline" style={{ fontVariant: ['tabular-nums'] }}>
            {info.value}
          </Text>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text variant="label" numberOfLines={1} style={{ color: c.fg }}>
              {info.word}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {uv ? G4B_UI_COPY.tipUvWhen : G4B_UI_COPY.tipAirWhen}
            </Text>
          </View>
        </View>
      ) : null}
    </IconCard>
  );
}

// ---------- Travel ----------

/** The travel card's buttons (CONTRACT v0.15a `travel.answer`). */
export type TravelAction = 'on_my_way' | 'snooze_5' | 'remind_30_before';

/** The line a failed travel check shows instead of numbers (fail closed, G4 invariant 7). With the event known
 * (v0.15a), the not-set-up line names it and its start ("Soccer pickup at 5:30 PM."). */
export function travelFailureText(failure: NonNullable<TravelCard['failure']>, event?: { title: string; start: string }): { title: string; body?: string } {
  if (failure === 'not_configured')
    return { title: INTEGRATION_COPY.travelNotConfigured, body: event ? fillCopy(G4_COPY.travelNotSetUpBodyEvent, { event: event.title, time: event.start }) : G4_COPY.travelNotSetUpBody };
  if (failure === 'no_result') return { title: G4_COPY.travelNoRoute };
  return { title: G4_COPY.travelTryLater };
}

/** The reply line under the buttons once `travel.answer` returns (board: the accent status dot). */
function TravelStatus({ text }: { text: string }) {
  const tokens = useTokens();
  return (
    <View accessibilityRole="text" style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.accent }} />
      <Text variant="label" style={{ color: tokens.accent, flexShrink: 1 }}>
        {text}
      </Text>
    </View>
  );
}

export function TravelCardView({
  card,
  tz,
  megaName,
  onAnswer,
  busy,
  status,
}: {
  card: TravelCard;
  tz: string;
  megaName: string;
  /** Wired by TravelResultCard to `travel.answer`; the buttons only show when the card has a check to answer. */
  onAnswer?: (action: TravelAction) => void;
  busy?: TravelAction | null;
  /** The server's reply (or a friendly error) after a tap. */
  status?: string | null;
}) {
  const tokens = useTokens();
  const from = fillCopy(G4_COPY.travelFrom, { mega: megaName });
  const canAnswer = !!onAnswer && !!card.checkId;
  const action = (id: TravelAction, label: string, variant?: 'ghost'): CardAction => ({ id, label, onPress: () => onAnswer?.(id), loading: busy === id, disabled: !!busy && busy !== id, variant });
  if (card.failure) {
    const event = card.eventTitle && card.eventStart !== undefined ? { title: card.eventTitle, start: formatLocalTime(card.eventStart, tz) } : undefined;
    const f = travelFailureText(card.failure, event);
    return (
      <G4Card label={f.title} from={from} fromIcon="car" testID="travel-card">
        <View style={{ gap: tokens.spacing.xs }}>
          <Text variant="title">{f.title}</Text>
          {f.body ? <Text color="muted">{f.body}</Text> : null}
        </View>
        {canAnswer && card.failure === 'not_configured' && !status ? <CardActions cols={1} actions={[action('remind_30_before', G4_COPY.travelRemind30)]} /> : null}
        {status ? <TravelStatus text={status} /> : null}
      </G4Card>
    );
  }
  const leaveBy = fillCopy(G4_COPY.travelLeaveBy, { time: formatLocalTime(card.leaveBy, tz) });
  const minutes =
    card.typicalMinutes !== undefined
      ? fillCopy(G4_COPY.travelMinutes, { minutes: card.minutes, typical: card.typicalMinutes })
      : fillCopy(G4_COPY.travelMinutesNoTypical, { minutes: card.minutes });
  const minutesLine = card.eventTitle ? fillCopy(G4_COPY.travelWithEvent, { line: minutes, event: card.eventTitle }) : minutes;
  return (
    <G4Card label={leaveBy} from={from} fromIcon="car" testID="travel-card">
      <View style={{ gap: tokens.spacing.xs }}>
        <Text variant="headline">{leaveBy}</Text>
        <Text color="muted">{minutesLine}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, borderRadius: tokens.radii.lg, backgroundColor: tokens.bg, borderWidth: 1, borderColor: tokens.line, paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md }}>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: tokens.muted }} />
          <View style={{ width: 2, height: 16, backgroundColor: tokens.line }} />
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.accent }} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: tokens.spacing.sm }}>
          {card.fromLabel ? (
            <Text variant="label" weight="400" color="muted" numberOfLines={1}>
              {card.fromLabel}
            </Text>
          ) : null}
          <Text variant="label" numberOfLines={2}>
            {card.to}
          </Text>
        </View>
      </View>
      {canAnswer ? <CardActions actions={[action('on_my_way', G4_COPY.travelOnMyWay), action('snooze_5', G4_COPY.travelSnooze, 'ghost')]} /> : null}
      {status ? <TravelStatus text={status} /> : null}
    </G4Card>
  );
}

// ---------- Connected (viewer's timezone and role) ----------

export function SearchResultCard({ card, megaName }: { card: SearchCard; megaName: string }) {
  const viewer = useViewer();
  return <SearchCardView card={card} megaName={megaName} isKid={viewer?.member.role === 'kid'} onOpenSource={(url) => void openLink(url)} />;
}

export function WeatherResultCard({ card, megaName }: { card: WeatherCard; megaName?: string }) {
  const viewer = useViewer();
  return <WeatherCardView card={card} tz={viewer?.family.timezone ?? 'UTC'} megaName={megaName} />;
}

export function TravelResultCard({ card, megaName }: { card: TravelCard; megaName: string }) {
  const viewer = useViewer();
  const answer = useTravelAnswer();
  const { busy, error, run } = useRunAction();
  const [reply, setReply] = useState<string | null>(null);
  const checkId = card.checkId;
  const onAnswer = checkId
    ? (action: TravelAction) => void run(action, async () => setReply((await answer({ travelCheckId: checkId, action })).message))
    : undefined;
  return <TravelCardView card={card} tz={viewer?.family.timezone ?? 'UTC'} megaName={megaName} onAnswer={onAnswer} busy={busy as TravelAction | null} status={reply ?? error} />;
}
