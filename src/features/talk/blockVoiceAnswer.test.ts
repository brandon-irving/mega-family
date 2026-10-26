// G2 scope: "Voice can answer a block: choice -> match option labels loosely; text -> as is; otherwise
// fall back to a normal message."
import { BLOCKS_BY_KIND } from '@/test/fixtures';
import { mapVoiceBlockAnswer } from './blockVoiceAnswer';

describe('mapVoiceBlockAnswer', () => {
  test('text block: the transcript is used as is', () => {
    expect(mapVoiceBlockAnswer(BLOCKS_BY_KIND.text, 'Call me Bee')).toEqual({ value: 'Call me Bee' });
  });

  test('choice block: loosely matches a spoken option label', () => {
    // BLOCKS_BY_KIND.choice: "Who is Anela to you?" options daughter/son, allowOther: true
    expect(mapVoiceBlockAnswer(BLOCKS_BY_KIND.choice, 'Daughter')).toEqual({ optionIds: ['daughter'] });
    expect(mapVoiceBlockAnswer(BLOCKS_BY_KIND.choice, "she's my daughter")).toEqual({ optionIds: ['daughter'] });
    expect(mapVoiceBlockAnswer(BLOCKS_BY_KIND.choice, 'SON')).toEqual({ optionIds: ['son'] });
  });

  test('choice block with allowOther: an unmatched transcript becomes "other"', () => {
    expect(mapVoiceBlockAnswer(BLOCKS_BY_KIND.choice, 'my niece')).toEqual({ optionIds: [], other: 'my niece' });
  });

  test('choice block without allowOther: an unmatched transcript falls back to a normal message', () => {
    const noOther = { ...BLOCKS_BY_KIND.choice, allowOther: false };
    expect(mapVoiceBlockAnswer(noOther, 'my niece')).toBeNull();
  });

  test('choice multi: matches more than one spoken option', () => {
    const multi = { ...BLOCKS_BY_KIND.choice, multi: true, options: [{ id: 'a', label: 'Pizza' }, { id: 'b', label: 'Tacos' }] };
    expect(mapVoiceBlockAnswer(multi, 'pizza and tacos')).toEqual({ optionIds: ['a', 'b'] });
  });

  test('every other block kind falls back to a normal message (null)', () => {
    for (const kind of ['toggle', 'number', 'date', 'fields', 'look', 'questions', 'invite', 'confirm'] as const) {
      expect(mapVoiceBlockAnswer(BLOCKS_BY_KIND[kind], 'yes please')).toBeNull();
    }
  });

  test('an empty transcript never answers a block', () => {
    expect(mapVoiceBlockAnswer(BLOCKS_BY_KIND.text, '   ')).toBeNull();
  });
});
