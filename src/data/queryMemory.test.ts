import { clearQueryMemory, recallQuery, rememberQuery } from './queryMemory';

beforeEach(clearQueryMemory);

test('a long signed-in session retains only the most recent 128 card queries', () => {
  for (let i = 0; i < 5000; i++) rememberQuery(`card:${i}`, { text: `Card ${i}` });

  const retained = Array.from({ length: 5000 }, (_, i) => recallQuery(`card:${i}`)).filter((value) => value !== undefined);
  expect(retained).toHaveLength(128);
  expect(recallQuery('card:0')).toBeUndefined();
  expect(recallQuery('card:4999')).toEqual({ text: 'Card 4999' });
});

test('reading an older card keeps it available for the next remount', () => {
  for (let i = 0; i < 128; i++) rememberQuery(`card:${i}`, i);
  expect(recallQuery('card:0')).toBe(0);
  rememberQuery('new', 'new');
  expect(recallQuery('card:0')).toBe(0);
  expect(recallQuery('card:1')).toBeUndefined();
});

test('an updated query takes one slot and clearing releases every value', () => {
  rememberQuery('card', { version: 1 });
  rememberQuery('card', { version: 2 });
  expect(recallQuery('card')).toEqual({ version: 2 });
  clearQueryMemory();
  expect(recallQuery('card')).toBeUndefined();
});
