// G2 BLOCKER fix: full-screen white flash (~0.6s) on cold load and sign-in, between the dark loading
// states (frames a_coldload f0068–f0069, a_signin_admin f0083–f0105). Customizes the web root HTML
// document (Expo Router server rendering, docs.expo.dev/router/web/server-rendering) so the very first
// paint — before any JS runs, let alone hydrates — already shows the theme's dark background instead of
// an unstyled (default white) canvas.
//
// This runs in Node during server rendering, before a signed-in viewer (and their real theme) is known,
// so it paints shared/config/theme.ts THEMES[DEFAULT_THEME].bg — a token, not a literal, and the same
// one app.config.ts bakes into the splash screen / Android adaptive icon background, so every layer
// agrees. Every screen (src/ui/Screen.tsx) also paints its *current* theme's bg the instant it mounts, so
// a Light-theme viewer briefly sees DEFAULT_THEME's dark background for one frame, never raw white — the
// same trade a native splash screen already makes.
import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { ReactNode } from 'react';
import { DEFAULT_THEME, THEMES } from '@shared/config/theme';

const BG = THEMES[DEFAULT_THEME].bg;

export default function Root({ children }: { children: ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content={BG} />

        {/* Disable body scrolling on web so ScrollView components behave closer to native. */}
        <ScrollViewStyleReset />

        {/* Inline (not a linked stylesheet, so there's no extra request blocking first paint) and ahead
            of every other stylesheet in `headNodes` — the dark background has to be the very first thing
            the browser paints, not something that arrives after expo-router's own CSS loads. */}
        <style id="expo-reset-bg" dangerouslySetInnerHTML={{ __html: `html, body, #root { background-color: ${BG}; }` }} />

        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
