import { furnitureSpot } from './PersonalRoom';

test('placement reserves every tile occupied by a piece, including head-to-foot beds and wide desks', () => {
  const room = { size: { w: 3, h: 4 }, furniture: [{ kind: 'bed', x: 0, y: 2 }, { kind: 'desk', x: 1, y: 2 }] };
  expect(furnitureSpot(room, 'lamp')).toEqual({ x: 1, y: 3 });
  expect(furnitureSpot(room, 'bed')).toBeNull();
});

test('a full room has no fallback spot that would overwrite other furniture', () => {
  expect(furnitureSpot({ size: { w: 1, h: 3 }, furniture: [{ kind: 'lamp', x: 0, y: 2 }] }, 'lamp')).toBeNull();
});
