import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { AddFamilyPerson } from './AddFamilyPerson';
const mockAdd = jest.fn().mockResolvedValue({ memberId: 'new-person' });
jest.mock('@/data/useFamily', () => ({ useAddFamilyMember: () => mockAdd }));
beforeEach(() => mockAdd.mockClear());
test('context-only member saves age and relationship without a MEGA or invite', async () => {
  const done = jest.fn(); const create = jest.fn();
  await renderWithTheme(<AddFamilyPerson onDone={done} onCreateMega={create} />);
  await fireEvent.press(screen.getByText('Add without a MEGA'));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Maya');
  await fireEvent.press(screen.getByText('Teen · 13–17'));
  await fireEvent.press(screen.getByText('Daughter'));
  await fireEvent.press(screen.getByText('Add family member'));
  expect(mockAdd).toHaveBeenCalledWith({ name: 'Maya', role: 'kid', ageGroup: 'teen', relationship: 'daughter' });
  expect(done).toHaveBeenCalledTimes(1);
  expect(create).not.toHaveBeenCalled();
});
test('MEGA creation remains an explicit alternative', async () => {
  const create = jest.fn();
  await renderWithTheme(<AddFamilyPerson onDone={jest.fn()} onCreateMega={create} />);
  await fireEvent.press(screen.getByText('Create their MEGA in chat'));
  expect(create).toHaveBeenCalledTimes(1);
  expect(mockAdd).not.toHaveBeenCalled();
});
