// The GD thread card (Screens 10–12, design/build/thread.html's card section): a "from" line (with an AI
// tag for Hub's proposals), optional progress dots, a title and body, then whichever parts a card needs —
// chip rows, a before/after compare, a hint note, "based on" tags, a checklist, idea rows, the Mega Bucks
// stepper, big 2-up answer choices, action buttons, a status line and a lock footnote. Every card kind in
// src/features/{kids,calendar} composes these; none draws its own frame. Colors and sizes come from tokens
// only (kid sizing included: `tokens.buttonSize`, `tokens.type` and `tokens.touchTarget` follow the role).
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { readableOn } from '@shared/config/theme';
import { BucksCoin } from './BucksCoin';
import { Button } from './Button';
import { buttonLines } from './ButtonRow';
import { Text } from './Text';
import { useTokens, type Tokens } from './theme';
import { hiddenFromA11y } from './a11y';

export type StatusTone = 'success' | 'warn' | 'muted' | 'hint' | 'household' | 'bucks';

export function toneColor(tokens: Tokens, tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return tokens.success;
    case 'warn':
      return tokens.warn;
    case 'hint':
      return tokens.hint;
    case 'household':
      return tokens.household;
    case 'bucks':
      return tokens.bucks;
    default:
      return tokens.muted;
  }
}

export type ProgressDot = 'done' | 'current' | 'todo';

export type ThreadCardProps = {
  from: string;
  fromColor?: string;
  ai?: boolean;
  aiLabel?: string;
  progress?: { dots: ProgressDot[]; label: string };
  title: string;
  big?: boolean;
  body?: string;
  children?: ReactNode;
  status?: { text: string; tone: StatusTone };
  foot?: string;
  testID?: string;
};

export function ThreadCard({ from, fromColor, ai, aiLabel = 'AI', progress, title, big, body, children, status, foot, testID }: ThreadCardProps) {
  const tokens = useTokens();
  const reducedMotion = useReducedMotion();
  return (
    <View
      testID={testID}
      accessibilityLabel={`${from}. ${title}`}
      style={{ backgroundColor: tokens.surface, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg, gap: tokens.spacing.md }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
        <Text variant="caption" weight="700" style={{ color: fromColor ?? tokens.muted, flexShrink: 1 }}>
          {from}
        </Text>
        {ai && (
          <View style={{ paddingHorizontal: 6, borderRadius: tokens.radii.sm, borderWidth: 1, borderColor: tokens.line }} accessibilityLabel="Written by AI">
            <Text variant="caption" weight="700" color="muted">
              {aiLabel}
            </Text>
          </View>
        )}
      </View>
      {progress && <ProgressDots dots={progress.dots} label={progress.label} />}
      <View style={{ gap: tokens.spacing.xs }}>
        <Text variant={big ? 'headline' : 'title'} accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text color="muted">{body}</Text> : null}
      </View>
      {children}
      {status && (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(tokens.durations.base)} accessibilityRole="text" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: toneColor(tokens, status.tone) }} />
          <Text variant="label" style={{ color: toneColor(tokens, status.tone), flex: 1 }}>
            {status.text}
          </Text>
        </Animated.View>
      )}
      {foot ? <LockNote text={foot} /> : null}
    </View>
  );
}

/** A card's first load (G4 UX review, Oct 28: never a bare "Loading…" line): the card's frame and "from"
 * line with two placeholder bars where the title and body will be. */
export function CardSkeleton({ from, label }: { from: string; label: string }) {
  const tokens = useTokens();
  const bar = (width: `${number}%`, height: number) => <View style={{ width, height, borderRadius: height / 2, backgroundColor: tokens.line }} />;
  return (
    <View
      testID="card-skeleton"
      accessibilityLabel={from ? `${from}. ${label}` : label}
      style={{ backgroundColor: tokens.surface, borderColor: tokens.line, borderWidth: 1, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg, gap: tokens.spacing.md }}
    >
      {from ? (
        <Text variant="caption" weight="700" color="muted">
          {from}
        </Text>
      ) : null}
      <View style={{ gap: tokens.spacing.sm }} {...hiddenFromA11y()}>
        {bar('60%', 18)}
        {bar('85%', 12)}
      </View>
    </View>
  );
}

export function ProgressDots({ dots, label }: { dots: ProgressDot[]; label: string }) {
  const tokens = useTokens();
  const fill = (d: ProgressDot) => (d === 'done' ? tokens.hintLine : d === 'current' ? tokens.hint : tokens.line);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={label}>
      {dots.map((d, i) => (
        <View key={i} style={{ width: 28, height: 6, borderRadius: 3, backgroundColor: fill(d) }} />
      ))}
      <Text variant="caption" color="muted" style={{ marginLeft: tokens.spacing.xs }}>
        {label}
      </Text>
    </View>
  );
}

/** The small lock line under a card ("Only shared info is used…", "MEGA never shares anything…"). */
export function LockNote({ text }: { text: string }) {
  const tokens = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.xs }}>
      <LockGlyph color={tokens.muted} />
      <Text variant="caption" color="muted" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** A tiny code-drawn padlock (the boards' lock icon) — two Views, no icon font. */
export function LockGlyph({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', marginTop: 2 }} {...hiddenFromA11y()}>
      <View style={{ width: size * 0.6, height: size * 0.45, borderWidth: 1.5, borderBottomWidth: 0, borderColor: color, borderTopLeftRadius: size, borderTopRightRadius: size }} />
      <View style={{ width: size, height: size * 0.55, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

export type CardAction = { id: string; label: string; onPress: () => void; variant?: 'primary' | 'ghost'; loading?: boolean; disabled?: boolean };

/** The card's action buttons, sized from the role (BUTTON_SIZES), laid out in the same explicit lines as
 * ButtonRow (owner, Oct 28: stacked buttons are full width, pairs split evenly); `cols={1}` always stacks. */
export function CardActions({ actions, cols = 2 }: { actions: CardAction[]; cols?: 1 | 2 }) {
  const tokens = useTokens();
  if (actions.length === 0) return null;
  const lines = cols === 1 ? actions.map((a) => [a]) : buttonLines(actions);
  return (
    <View style={{ alignSelf: 'stretch', gap: tokens.spacing.sm }}>
      {lines.map((line) => (
        <View key={line.map((a) => a.id).join('|')} testID="button-row-line" style={{ width: '100%', flexDirection: 'row', gap: tokens.spacing.sm }}>
          {line.map((a) => (
            <Button
              key={a.id}
              label={a.label}
              variant={a.variant === 'ghost' ? 'secondary' : 'primary'}
              onPress={a.onPress}
              loading={a.loading}
              disabled={a.disabled}
              size={tokens.buttonSize}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** A labelled row of pickable chips (the homework card's For / Questions). */
export function ChipRow({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  const tokens = useTokens();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="caption" weight="700" color="muted">
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <Pressable
              key={o.id}
              onPress={() => onChange(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={`${label}: ${o.label}`}
              style={{
                minHeight: tokens.touchTarget - 4,
                paddingHorizontal: tokens.spacing.md,
                borderRadius: tokens.radii.pill,
                borderWidth: 1,
                borderColor: on ? tokens.accent : tokens.line,
                backgroundColor: on ? tokens.accent : 'transparent',
                justifyContent: 'center',
              }}
            >
              <Text variant="label" style={on ? { color: readableOn(tokens.accent) } : undefined}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Before / after boxes on a clash proposal ("Now" vs "After you approve"). */
export function CompareBoxes({ beforeLabel, before, beforeSub, afterLabel, after, afterSub }: { beforeLabel: string; before: string; beforeSub: string; afterLabel: string; after: string; afterSub: string }) {
  const tokens = useTokens();
  const box = (bg: string, border: string) => ({ flex: 1, borderRadius: tokens.radii.md, backgroundColor: bg, borderWidth: 1, borderColor: border, padding: 10, gap: 3 });
  return (
    <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
      <View style={box(tokens.bg, tokens.line)} accessibilityLabel={`${beforeLabel}: ${before}, ${beforeSub}`}>
        <Text variant="caption" weight="700" color="muted">
          {beforeLabel.toUpperCase()}
        </Text>
        <Text variant="label">{before}</Text>
        <Text variant="caption" color="muted">
          {beforeSub}
        </Text>
      </View>
      <View style={box(tokens.householdSurface, tokens.household)} accessibilityLabel={`${afterLabel}: ${after}, ${afterSub}`}>
        <Text variant="caption" weight="700" style={{ color: tokens.householdText }}>
          {afterLabel.toUpperCase()}
        </Text>
        <Text variant="label">{after}</Text>
        <Text variant="caption" style={{ color: tokens.householdText }}>
          {afterSub}
        </Text>
      </View>
    </View>
  );
}

/** The practice hint: a guiding question in a soft purple note (never the answer — the server guarantees it). */
export function HintNote({ text }: { text: string }) {
  const tokens = useTokens();
  return (
    <View accessibilityRole="text" accessibilityLabel={`Hint: ${text}`} style={{ flexDirection: 'row', gap: 10, borderRadius: tokens.radii.md, backgroundColor: tokens.hintSurface, borderWidth: 1, borderColor: tokens.hintLine, padding: tokens.spacing.md }}>
      <Text variant="label" style={{ color: tokens.hint }}>
        ?
      </Text>
      <Text style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}

/** "Based on what's shared" tags on gift ideas. */
export function TagList({ label, tags }: { label: string; tags: string[] }) {
  const tokens = useTokens();
  if (tags.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="caption" weight="700" color="muted">
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {tags.map((t) => (
          <View key={t} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: tokens.radii.md, backgroundColor: tokens.householdSurface, borderWidth: 1, borderColor: tokens.householdLine }}>
            <Text variant="caption" style={{ color: tokens.householdText }}>
              {t}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export type CheckItem = { id: string; label: string; sub?: string; done: boolean };

/** Bedtime prep's tappable checklist — big rows, a checkbox each. */
export function CheckList({ items, onToggle }: { items: CheckItem[]; onToggle: (id: string, done: boolean) => void }) {
  const tokens = useTokens();
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {items.map((k) => (
        <Pressable
          key={k.id}
          onPress={() => onToggle(k.id, !k.done)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: k.done }}
          accessibilityLabel={k.sub ? `${k.label}, ${k.sub}` : k.label}
          style={{
            minHeight: tokens.buttonSize.height,
            paddingHorizontal: tokens.spacing.md,
            paddingVertical: tokens.spacing.sm,
            borderRadius: tokens.radii.lg,
            borderWidth: 1,
            borderColor: k.done ? tokens.hintLine : tokens.line,
            backgroundColor: k.done ? tokens.hintSurface : tokens.bg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: tokens.spacing.md,
          }}
        >
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: tokens.radii.sm,
              borderWidth: 2,
              borderColor: k.done ? tokens.hintLine : tokens.muted,
              backgroundColor: k.done ? tokens.hintLine : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {k.done && (
              <Text variant="label" style={{ color: readableOn(tokens.hintLine) }}>
                ✓
              </Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="label" style={{ fontSize: tokens.buttonSize.fontSize, textDecorationLine: k.done ? 'line-through' : 'none' }}>
              {k.label}
            </Text>
            {k.sub ? (
              <Text variant="caption" color="muted">
                {k.sub}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** One gift idea with its Add to list button. */
export function IdeaRow({ title, why, actionLabel, done, onPress, loading }: { title: string; why: string; actionLabel: string; done: boolean; onPress: () => void; loading?: boolean }) {
  const tokens = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, borderRadius: tokens.radii.md, backgroundColor: tokens.bg, borderWidth: 1, borderColor: tokens.line, padding: 10, paddingLeft: tokens.spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{title}</Text>
        <Text variant="caption" color="muted">
          {why}
        </Text>
      </View>
      <Pressable
        onPress={onPress}
        disabled={done || loading}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel}: ${title}`}
        accessibilityState={{ disabled: done || !!loading }}
        hitSlop={tokens.hitSlop}
        // Kid-sized for kids (BUTTON_SIZES via the theme), never under the 44pt floor (UX review, Oct 28).
        style={{
          height: tokens.buttonSize.height,
          paddingHorizontal: tokens.spacing.md,
          borderRadius: tokens.radii.pill,
          borderWidth: 1,
          borderColor: done ? tokens.success : tokens.line,
          justifyContent: 'center',
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Text variant="caption" weight="700" style={{ fontSize: tokens.buttonSize.fontSize, color: done ? tokens.success : tokens.text }}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

/** The parent's Mega Bucks amount: coin, label, − amount + (bounds from config MEGA_BUCKS). */
export function BucksStepper({ value, min, max, onChange, label, fewerLabel, moreLabel }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string; fewerLabel: string; moreLabel: string }) {
  const tokens = useTokens();
  const step = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  const round = { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: tokens.line, backgroundColor: tokens.surface, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: `${value} ${label}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, borderRadius: tokens.radii.lg, backgroundColor: tokens.bg, borderWidth: 1, borderColor: tokens.line, padding: tokens.spacing.sm, paddingLeft: tokens.spacing.md }}
    >
      <BucksCoin size={24} />
      <Text color="muted" style={{ flex: 1 }}>
        {label}
      </Text>
      <Pressable onPress={() => step(-1)} disabled={value <= min} accessibilityRole="button" accessibilityLabel={fewerLabel} style={[round, { opacity: value <= min ? 0.4 : 1 }]}>
        <Text variant="title">−</Text>
      </Pressable>
      <Text variant="headline" style={{ minWidth: 32, textAlign: 'center', color: tokens.bucks }}>
        {value}
      </Text>
      <Pressable onPress={() => step(1)} disabled={value >= max} accessibilityRole="button" accessibilityLabel={moreLabel} style={[round, { opacity: value >= max ? 0.4 : 1 }]}>
        <Text variant="title">+</Text>
      </Pressable>
    </View>
  );
}

/** The kid's big 2-up answer buttons; a wrong pick is marked until the next try. */
export function ChoiceGrid({ choices, onPick, missIndex, disabled }: { choices: string[]; onPick: (index: number) => void; missIndex?: number | null; disabled?: boolean }) {
  const tokens = useTokens();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {choices.map((c, i) => {
        const miss = i === missIndex;
        return (
          <Pressable
            key={`${i}:${c}`}
            onPress={() => onPick(i)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={miss ? `${c}, not quite` : c}
            style={({ pressed }) => ({
              flexBasis: '45%',
              flexGrow: 1,
              minHeight: 64,
              borderRadius: tokens.radii.lg,
              borderWidth: 2,
              borderColor: miss ? tokens.danger : tokens.line,
              backgroundColor: miss ? tokens.dangerSurface : tokens.bg,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant="headline" style={{ color: miss ? tokens.dangerText : tokens.text }}>
              {c}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A coin + label pill ("You have 12 Mega Bucks"). */
export function BucksPill({ label }: { label: string }) {
  const tokens = useTokens();
  return (
    <View accessibilityRole="text" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: tokens.spacing.sm, minHeight: 44, paddingHorizontal: tokens.spacing.lg, borderRadius: 22, backgroundColor: tokens.bg, borderWidth: 1, borderColor: tokens.line }}>
      <BucksCoin size={22} />
      <Text color="muted">{label}</Text>
    </View>
  );
}
