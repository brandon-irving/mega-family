// PLAN "Talk mode" / G2: idle -> recording -> locked -> transcribing -> review -> sending -> speaking,
// plus interrupt (holding while the MEGA talks) and cancel from anywhere.
import { initialTalkState, talkReducer, type TalkState } from './talkMachine';

const MENTION = { megaId: 'megas_zap' as never, heard: 'Zap', start: 0, end: 3, confidence: 0.9 };

function step(state: TalkState, ...actions: Parameters<typeof talkReducer>[1][]): TalkState {
  return actions.reduce(talkReducer, state);
}

describe('talkReducer', () => {
  test('hold to talk, release to send: idle -> recording -> transcribing -> review -> sending -> speaking', () => {
    let state = step(initialTalkState, { type: 'holdStart' });
    expect(state.phase).toBe('recording');

    state = talkReducer(state, { type: 'release' });
    expect(state.phase).toBe('transcribing');

    state = talkReducer(state, { type: 'transcribed', text: 'Ask Zap about homework', mentions: [MENTION] });
    expect(state).toMatchObject({ phase: 'review', caption: 'Ask Zap about homework', mentions: [MENTION] });

    state = talkReducer(state, { type: 'send' });
    expect(state.phase).toBe('sending');

    state = talkReducer(state, { type: 'sent' });
    expect(state.phase).toBe('speaking');

    state = talkReducer(state, { type: 'replyChunk', text: 'Sure,' });
    expect(state.reply).toBe('Sure,');

    state = talkReducer(state, { type: 'replyDone' });
    expect(state).toEqual(initialTalkState);
  });

  test('slide up to lock: recording -> locked, then tap (release) -> transcribing', () => {
    let state = step(initialTalkState, { type: 'holdStart' }, { type: 'lock' });
    expect(state.phase).toBe('locked');
    state = talkReducer(state, { type: 'release' });
    expect(state.phase).toBe('transcribing');
  });

  test('cannot lock before recording starts', () => {
    const state = talkReducer(initialTalkState, { type: 'lock' });
    expect(state.phase).toBe('idle');
  });

  test('removing a mention chip in review drops only that one', () => {
    let state = step(initialTalkState, { type: 'holdStart' }, { type: 'release' });
    state = talkReducer(state, { type: 'transcribed', text: 'Ask Zap and Sunny', mentions: [MENTION, { ...MENTION, heard: 'Sunny' }] });
    state = talkReducer(state, { type: 'removeMention', index: 0 });
    expect(state.mentions).toEqual([{ ...MENTION, heard: 'Sunny' }]);
  });

  test('interrupt: pressing while the MEGA is speaking starts a fresh recording and clears the reply', () => {
    let state: TalkState = { ...initialTalkState, phase: 'speaking', reply: 'Here is the weather…' };
    state = talkReducer(state, { type: 'holdStart' });
    expect(state).toEqual({ ...initialTalkState, phase: 'recording' });
  });

  test('cancel from any phase returns to idle with no leftover caption/mentions/error', () => {
    for (const phase of ['recording', 'locked', 'transcribing', 'review', 'sending', 'speaking'] as const) {
      const dirty: TalkState = { phase, caption: 'leftover', mentions: [MENTION], reply: 'leftover', error: 'leftover' };
      expect(talkReducer(dirty, { type: 'cancel' })).toEqual(initialTalkState);
    }
  });

  test('a transcribe failure drops back to idle and surfaces the friendly error', () => {
    let state = step(initialTalkState, { type: 'holdStart' }, { type: 'release' });
    state = talkReducer(state, { type: 'transcribeFailed', error: 'Something went wrong on my end.' });
    expect(state).toEqual({ ...initialTalkState, error: 'Something went wrong on my end.' });
  });

  test('a send failure returns to review (so the chips/caption are not lost) with the error set', () => {
    let state = step(
      initialTalkState,
      { type: 'holdStart' },
      { type: 'release' },
      { type: 'transcribed', text: 'hi', mentions: [] },
      { type: 'send' },
    );
    state = talkReducer(state, { type: 'sendFailed', error: "I've used up today's budget for the family. Try again tomorrow." });
    expect(state.phase).toBe('review');
    expect(state.caption).toBe('hi');
    expect(state.error).toBe("I've used up today's budget for the family. Try again tomorrow.");
  });

  test('a streaming reply failure (error/timeout) drops back to idle with the friendly error', () => {
    const state: TalkState = { ...initialTalkState, phase: 'speaking', reply: 'partial' };
    expect(talkReducer(state, { type: 'replyFailed', error: 'That took too long to come back.' })).toEqual({
      ...initialTalkState,
      error: 'That took too long to come back.',
    });
  });

  test('stray actions outside their valid phase are ignored', () => {
    expect(talkReducer(initialTalkState, { type: 'send' })).toEqual(initialTalkState);
    expect(talkReducer(initialTalkState, { type: 'removeMention', index: 0 })).toEqual(initialTalkState);
    expect(talkReducer({ ...initialTalkState, phase: 'recording' }, { type: 'holdStart' }).phase).toBe('recording');
  });
});
