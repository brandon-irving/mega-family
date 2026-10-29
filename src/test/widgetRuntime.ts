// Runs a widget layout the way the expo-widgets runtime does (G8). babel-preset-expo's widgets plugin turns a
// `'widget'` function into its source text; the runtime evaluates that text with only the @expo/ui SwiftUI
// components and modifiers as globals (node_modules/expo-widgets/bundle/ui-globals.ts) plus the JSX helpers.
// Here those globals are plain recorders, so a test can read the tree a layout returns — and a layout that
// reaches for anything outside its own function (a module constant, an import, a babel helper) throws a
// ReferenceError, exactly as it would on the phone.
import * as SwiftUI from '@expo/ui/swift-ui';
import * as Modifiers from '@expo/ui/swift-ui/modifiers';

export type WidgetNode = { type: string; props: Record<string, unknown> };
export type ModifierCall = { modifier: string; args: unknown[] };

const COMPONENT_NAMES = Object.keys(SwiftUI).filter((k) => /^[A-Z]/.test(k));
const MODIFIER_NAMES = Object.keys(Modifiers).filter((k) => /^[a-z]/.test(k));

function jsx(type: unknown, props: Record<string, unknown>): WidgetNode {
  return { type: String(type), props: props ?? {} };
}

/** Evaluate `layout` (a widget function's source, as the widgets plugin leaves it) with `props` and `env`. */
export function renderWidget<P>(layout: unknown, props: P, env: Record<string, unknown>): WidgetNode {
  if (typeof layout !== 'string') throw new Error('Expected a stringified widget layout (is the widgets babel plugin on?)');
  const names = ['_jsx', '_jsxs', '_Fragment', ...COMPONENT_NAMES, ...MODIFIER_NAMES];
  const values = [jsx, jsx, 'Fragment', ...COMPONENT_NAMES, ...MODIFIER_NAMES.map((name) => (...args: unknown[]): ModifierCall => ({ modifier: name, args }))];
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const make = new Function(...names, `"use strict"; return (${layout});`) as (...v: unknown[]) => (p: P, e: Record<string, unknown>) => WidgetNode;
  return make(...values)(props, env);
}

function childrenOf(node: unknown): unknown[] {
  if (Array.isArray(node)) return node.flat(Infinity);
  if (node && typeof node === 'object' && 'props' in node) {
    const c = (node as WidgetNode).props.children;
    return c === undefined || c === null || c === false ? [] : Array.isArray(c) ? c.flat(Infinity) : [c];
  }
  return [];
}

/** Every node in the tree, depth first. */
export function allNodes(root: unknown): WidgetNode[] {
  const out: WidgetNode[] = [];
  const walk = (n: unknown) => {
    if (n && typeof n === 'object' && 'type' in n) out.push(n as WidgetNode);
    childrenOf(n).forEach(walk);
  };
  walk(root);
  return out;
}

/** The text of a Text node (its string/number children joined). */
export function textOf(node: WidgetNode): string {
  return childrenOf(node)
    .filter((c) => typeof c === 'string' || typeof c === 'number')
    .join('');
}

/** All visible strings in the tree (every Text node's text). */
export function textsIn(root: unknown): string[] {
  return allNodes(root)
    .filter((n) => n.type === 'Text')
    .map(textOf)
    .filter(Boolean);
}

export function modifiersOf(node: WidgetNode): ModifierCall[] {
  return ((node.props.modifiers as ModifierCall[] | undefined) ?? []).filter(Boolean);
}

/** The Text nodes marked `privacySensitive()` (redacted by iOS while the phone is locked). */
export function privacySensitiveTexts(root: unknown): string[] {
  return allNodes(root)
    .filter((n) => n.type === 'Text' && modifiersOf(n).some((m) => m.modifier === 'privacySensitive'))
    .map(textOf);
}

/** The tree's tap target (`widgetURL`), if any. */
export function widgetUrlOf(root: unknown): string | undefined {
  for (const n of allNodes(root)) {
    const m = modifiersOf(n).find((x) => x.modifier === 'widgetURL');
    if (m) return m.args[0] as string;
  }
  return undefined;
}
