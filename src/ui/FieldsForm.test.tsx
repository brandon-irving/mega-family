import { act, fireEvent, screen } from '@testing-library/react-native';
import { ASSISTANT_BRIEF as C } from '@shared/config/assistantBrief';
import { briefFieldsBlock } from '@shared/assistantBrief';
import { renderWithTheme } from '@/test/renderWithTheme';
import { FieldsForm } from './FieldsForm';

test('review edits preserve prefilled fields and submit the changed brief', async () => {
  const onAnswer = jest.fn();
  await renderWithTheme(<FieldsForm block={briefFieldsBlock(C.editPrompt, { context: 'Busy parent', goal: 'Promote a book', firstTask: 'Draft three posts', proactive: '' }, true)} onAnswer={onAnswer} />);
  expect(screen.getByDisplayValue('Promote a book')).toBeTruthy();
  await act(async () => fireEvent.changeText(screen.getByLabelText('What would make life easier?'), 'Organize my week'));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: C.save })));
  expect(onAnswer).toHaveBeenCalledWith({ fields: { context: 'Busy parent', goal: 'Organize my week', firstTask: 'Draft three posts', proactive: '' } });
});

test('brief fields are accessible, bounded, and disabled during a save', async () => {
  const onAnswer = jest.fn();
  await renderWithTheme(<FieldsForm block={briefFieldsBlock(C.title)} onAnswer={onAnswer} busy />);
  for (const field of C.fields) {
    const input = screen.getByLabelText(field.label);
    expect(input.props.maxLength).toBe(C.maxFieldLength);
    expect(input.props.multiline).toBe(true);
    expect(input.props.editable).toBe(false);
  }
  await act(async () => fireEvent.press(screen.getByRole('button', { name: C.save })));
  expect(onAnswer).not.toHaveBeenCalled();
});

test('skipping a suggested brief does not submit its content', async () => {
  const onAnswer = jest.fn();
  await renderWithTheme(<FieldsForm block={briefFieldsBlock(C.title)} onAnswer={onAnswer} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: C.skip })));
  expect(onAnswer).toHaveBeenCalledWith({ skipped: true });
});
