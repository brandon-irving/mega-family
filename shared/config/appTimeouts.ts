// How long the app waits on a server call before it stops spinning and says so (G5 UX review, Oct 29). The
// server keeps its own limits (ICS.fetch…); these only decide when the person gets their buttons back.
export const APP_TIMEOUTS = {
  /** "Add link" for a schedule link: the server fetch + parse, with room to spare. */
  icsAddMs: 25_000,
  /** Paste: reading the clipboard (the web's navigator.clipboard can hang without permission; G8 UX review). */
  clipboardReadMs: 4_000,
} as const;
