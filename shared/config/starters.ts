// How a MEGA starts a member's chat (owner, Oct 28: "There should never be 'No messages yet, say hello'.
// MEGAs are proactive"). `chat.start` (convex/chat.ts) writes these into an empty thread. `{slots}` are
// filled with fillCopy: `{name}` the member, `{mega}` their MEGA, `{admin}` the family admin.

/** A kid's first open (board KidsIntro, canvas v33). Written as-is, no model call, so it's always kid-safe. */
export const KID_INTRO = {
  hello: 'Hi {name}! I’m {mega}, your MEGA. {admin} made me just for you.',
  card: { from: '{mega} · How I help', title: 'Here’s what we can do' },
  /** Each row's "Show me" sends `ask` to the MEGA as the kid's own message, so the MEGA explains it live. */
  rows: [
    { id: 'chores', title: 'Chores and reminders', why: 'I remind you, you tap Done', act: 'Show me', ask: 'Show me how chores and reminders work.' },
    { id: 'homework', title: 'Homework practice', why: 'Hints, never the answers', act: 'Show me', ask: 'Show me how homework practice works.' },
    { id: 'tomorrow', title: 'Ready for tomorrow', why: 'A checklist from the family calendar', act: 'Show me', ask: 'Show me how getting ready for tomorrow works.' },
  ],
  tip: 'Tap Talk to {mega} and ask me anything. Or tap the keyboard to type.',
} as const;

/** An adult's first open: the MEGA writes a short greeting (the agent loop, which already knows what the
 * family's admin shared about them), then asks one question with these choices. */
export const ADULT_STARTER = {
  /** The turn's instruction to the agent loop, in place of a member message. */
  prompt:
    'The member just opened MEGA for the first time. Greet them by name in one or two short sentences, in your own voice. Mention one thing you already know about them or the family, if you know something, so they can see you have started learning. Do not ask a question yet and do not use any tools: the question comes next as buttons.',
  /** Used if the model gives nothing back. */
  fallbackGreeting: 'Hi {name}, I’m {mega}, your MEGA. I already know a little about the family, and I’d like to learn more about you.',
  question: 'What should I learn about you first?',
  options: [
    { id: 'week', label: 'My usual week' },
    { id: 'likes', label: 'What I like' },
    { id: 'reminders', label: 'How I like reminders' },
  ],
} as const;
