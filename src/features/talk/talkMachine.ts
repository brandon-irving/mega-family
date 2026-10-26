// Talk mode's state machine (PLAN "Talk mode", decided Oct 24), as a pure reducer so it's testable
// without rendering anything: idle -> recording -> (locked) -> transcribing -> review (removable
// @ chips) -> sending -> speaking -> idle, plus interrupt and cancel from anywhere. talk.tsx owns the
// side effects (voice, speaker, haptics, the chat.send/answerBlock calls); this file only owns *what
// state comes next*.
import type { SpokenMention } from '@shared/domain/messages';

export type TalkPhase = 'idle' | 'recording' | 'locked' | 'transcribing' | 'review' | 'sending' | 'speaking';

export type TalkState = {
  phase: TalkPhase;
  /** The transcript shown as captions once transcribing finishes (PLAN: "the MEGA's reply shows as
   * large captions" reuses the same caption area for the user's own words while reviewing). */
  caption: string;
  mentions: SpokenMention[];
  /** The MEGA's streamed reply text, shown as large captions while speaking. */
  reply: string;
  error: string | null;
};

export const initialTalkState: TalkState = { phase: 'idle', caption: '', mentions: [], reply: '', error: null };

export type TalkAction =
  | { type: 'holdStart' } // press the mic: starts a new turn, or interrupts a speaking reply
  | { type: 'lock' } // slide up while recording: hands-free, tap to send later
  | { type: 'release' } // let go (or tap while locked): stop recording, start transcribing
  | { type: 'transcribed'; text: string; mentions: SpokenMention[] }
  | { type: 'transcribeFailed'; error: string }
  | { type: 'removeMention'; index: number } // tap an @ chip in review to drop it before sending
  | { type: 'send' } // review -> sending
  | { type: 'sendFailed'; error: string }
  | { type: 'sent' } // the message landed; now waiting on/streaming the reply
  | { type: 'replyChunk'; text: string }
  | { type: 'replyDone' }
  | { type: 'replyFailed'; error: string } // chat.streamBody came back status "error"/"timeout"
  | { type: 'cancel' }; // ✕ or swipe down

export function talkReducer(state: TalkState, action: TalkAction): TalkState {
  switch (action.type) {
    case 'holdStart':
      // From idle *or* while the MEGA is speaking (PLAN: "pressing while the MEGA talks interrupts
      // it") — either way a fresh turn starts recording. Anywhere else (already recording/locked/
      // transcribing/review/sending) a stray press is a no-op.
      return state.phase === 'idle' || state.phase === 'speaking' ? { ...initialTalkState, phase: 'recording' } : state;
    case 'lock':
      return state.phase === 'recording' ? { ...state, phase: 'locked' } : state;
    case 'release':
      return state.phase === 'recording' || state.phase === 'locked' ? { ...state, phase: 'transcribing', error: null } : state;
    case 'transcribed':
      return state.phase === 'transcribing' ? { ...state, phase: 'review', caption: action.text, mentions: action.mentions } : state;
    case 'transcribeFailed':
      return state.phase === 'transcribing' ? { ...initialTalkState, error: action.error } : state;
    case 'removeMention':
      return state.phase === 'review' ? { ...state, mentions: state.mentions.filter((_, i) => i !== action.index) } : state;
    case 'send':
      return state.phase === 'review' ? { ...state, phase: 'sending', error: null } : state;
    case 'sendFailed':
      return state.phase === 'sending' ? { ...state, phase: 'review', error: action.error } : state;
    case 'sent':
      return state.phase === 'sending' ? { ...state, phase: 'speaking', reply: '' } : state;
    case 'replyChunk':
      return state.phase === 'speaking' ? { ...state, reply: action.text } : state;
    case 'replyDone':
      return state.phase === 'speaking' ? { ...initialTalkState } : state;
    case 'replyFailed':
      return state.phase === 'speaking' ? { ...initialTalkState, error: action.error } : state;
    case 'cancel':
      return { ...initialTalkState };
    default:
      return state;
  }
}
