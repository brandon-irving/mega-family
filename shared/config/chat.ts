/** Shared chat behavior and action copy; native chat and previews use the same choices. */
export const CHAT_UX = {
  maxComposerLines: 5,
  maxQuotedCharacters: 1200,
  bubbleMaxWidth: '90%' as const,
  actions: { title: 'Message', close: 'Close', copy: 'Copy', select: 'Select text', reply: 'Reply', cancelReply: 'Cancel reply' },
  reactions: [
    { id: 'up' as const, label: 'Like', selected: 'Liked' },
    { id: 'down' as const, label: 'Needs improvement', selected: 'Needs improvement' },
  ],
} as const;
