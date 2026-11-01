/** Shared chat behavior and action copy; native chat and previews use the same choices. */
export const CHAT_UX = {
  entrance: {
    spriteScale: 2,
    badgeSize: 32,
    dockMs: 1000,
    typingMs: 500,
    reducedMs: 450,
    maxHistory: 30,
    walkMs: 1800,
    waveFrames: 6,
    greetingMs: 1800,
    fallbackMs: 12000,
    greeting: (name: string) => `Hi, I’m ${name}!`,
    typing: (name: string) => `${name} is typing…`,
  },
  stopResponse: 'Stop response',
  stopping: 'Stopping response…',
  maxComposerLines: 5,
  maxQuotedCharacters: 1200,
  bubbleMaxWidth: '90%' as const,
  actions: { title: 'Message', close: 'Close', copy: 'Copy', select: 'Select text', reply: 'Reply', cancelReply: 'Cancel reply' },
  reactions: [
    { id: 'up' as const, label: 'Like', selected: 'Liked' },
    { id: 'down' as const, label: 'Needs improvement', selected: 'Needs improvement' },
  ],
} as const;
