import { act, fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Button as MockButton } from '@/ui/Button';
import { useAttachments } from './Attachments';

const mockPick = jest.fn();
const mockUpload = jest.fn();
const mockSend = jest.fn();
jest.mock('@/services/pickDocument', () => ({ pickDocument: () => mockPick() }));
jest.mock('expo-image-picker', () => ({}));
// Modal gestures have their own suite; this harness exercises picker/upload resource ownership.
jest.mock('@/ui/ModalSheet', () => ({ ModalSheet: ({ open, children, closeLabel, onClose }: { open: boolean; children: React.ReactNode; closeLabel: string; onClose: () => void }) => open ? <>{children}<MockButton label={closeLabel} onPress={onClose} /></> : null }));
jest.mock('convex/react', () => ({ useMutation: () => async () => 'https://upload.example.test' }));
jest.mock('@/data/uploadToStorage', () => ({ uploadToStorage: (...args: unknown[]) => mockUpload(...args) }));

function Harness() {
  const attachments = useAttachments(mockSend);
  return <><MockButton label="Attach" onPress={attachments.open} />{attachments.sheets}</>;
}
const originalOS = Platform.OS;
const originalRevoke = URL.revokeObjectURL;
const asset = { uri: 'blob:synthetic-file', name: 'Test.txt', mimeType: 'text/plain', size: 100 };
beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'web';
  URL.revokeObjectURL = jest.fn();
  mockPick.mockResolvedValue({ canceled: false, assets: [asset] });
  mockUpload.mockResolvedValue('storage-test');
  mockSend.mockResolvedValue(undefined);
});
afterEach(() => { Platform.OS = originalOS; URL.revokeObjectURL = originalRevoke; });

async function chooseFile() {
  await fireEvent.press(screen.getByRole('button', { name: 'Attach' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Files' }));
}

test('closing a preview releases its file URL and allows another selection', async () => {
  await renderWithTheme(<Harness />);
  await chooseFile();
  expect(mockPick).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Test.txt')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Close attachment preview'));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(asset.uri);
  await chooseFile();
  expect(mockPick).toHaveBeenCalledTimes(2);
});

test('oversized files are released without being uploaded', async () => {
  mockPick.mockResolvedValue({ canceled: false, assets: [{ ...asset, size: 11 * 1024 * 1024 }] });
  await renderWithTheme(<Harness />);
  await chooseFile();
  expect(await screen.findByText('Choose a file smaller than 10 MB.')).toBeTruthy();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(asset.uri);
  expect(mockUpload).not.toHaveBeenCalled();
});

test('a picker resolving after unmount releases the file without sending', async () => {
  let finish!: (value: unknown) => void;
  mockPick.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = await renderWithTheme(<Harness />);
  await chooseFile();
  await view.unmount();
  await act(async () => finish({ canceled: false, assets: [asset] }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(asset.uri);
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});

test('a failed send retains one upload for retry and releases the preview after success', async () => {
  mockSend.mockRejectedValueOnce(new Error('offline'));
  await renderWithTheme(<Harness />);
  await chooseFile();
  await screen.findByText('Test.txt');
  await fireEvent.press(screen.getByRole('button', { name: 'Send attachment' }));
  expect(await screen.findByText('Could not send this attachment. Please try again.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Send attachment' }));
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockSend).toHaveBeenCalledTimes(2);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(asset.uri);
});
