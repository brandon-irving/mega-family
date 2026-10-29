// G8 (CONTRACT v0.18, G8.md invariants 6 and 7; boards KidsSnap, SnapStarting, SnapDenied, SnapFailed):
// the parent's homework photo with a live viewfinder. expo-camera is mocked: the CameraView stand-in records
// its props (so a test can fire onCameraReady / onMountError) and exposes a takePictureAsync spy on its ref.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { G8_COPY, G8_UI_COPY, KIDS_COPY } from '@shared/config/copy';
import { HOMEWORK } from '@shared/config/kids';
import { collectSourceFiles, readSourceFile, relativeToSrc } from '@/test/sourceFiles';
import { renderWithTheme } from '@/test/renderWithTheme';
import { HomeworkSnap } from './HomeworkSnap';

type Perm = { granted: boolean; canAskAgain: boolean; status: string } | null;
let mockPermission: Perm = { granted: true, canAskAgain: true, status: 'granted' };
const mockRequest = jest.fn(async () => mockPermission);
const mockTakePicture = jest.fn(async (_opts?: unknown) => ({ uri: 'file:///cache/hw.jpg', width: 1000, height: 1400 }));
let mockCameraProps: { onCameraReady?: () => void; onMountError?: (e: { message: string }) => void; accessibilityLabel?: string } = {};
let mockCameraMounts = 0;

jest.mock('expo-camera', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const { forwardRef: mockForwardRef, useImperativeHandle: mockUseImperativeHandle, useEffect: mockUseEffect } = jest.requireActual('react');
  return {
    useCameraPermissions: () => [mockPermission, mockRequest, mockRequest],
    CameraView: mockForwardRef((props: Record<string, unknown>, ref: unknown) => {
      mockCameraProps = props as typeof mockCameraProps;
      mockUseImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
      mockUseEffect(() => {
        mockCameraMounts += 1;
      }, []);
      return <MockView testID="camera" accessibilityLabel={props.accessibilityLabel as string} />;
    }),
  };
});
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));
const mockUploadUrl = jest.fn(async () => 'https://upload.example/abc');
const mockSubmit = jest.fn(async () => null);
jest.mock('@/data/useKids', () => ({ useHomeworkActions: () => ({ uploadUrl: mockUploadUrl, submit: mockSubmit, makePractice: jest.fn() }) }));
jest.mock('@/data/uploadToStorage', () => ({ uploadToStorage: jest.fn(async () => 'storage_1') }));

const press = (el: Parameters<typeof fireEvent.press>[0]) =>
  act(async () => {
    fireEvent.press(el);
  });
const ready = () =>
  act(async () => {
    mockCameraProps.onCameraReady?.();
  });

beforeEach(() => {
  mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
  mockRequest.mockClear();
  mockTakePicture.mockClear();
  mockSubmit.mockClear();
  mockUploadUrl.mockClear();
  mockCameraProps = {};
  mockCameraMounts = 0;
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockClear();
});

describe('HomeworkSnap (phone: live viewfinder)', () => {
  test('starting: the camera is in the frame, "Starting the camera…", and the shutter waits until it is ready', async () => {
    await renderWithTheme(<HomeworkSnap megaName="Teal" onDone={jest.fn()} />);
    expect(screen.getByTestId('camera')).toBeTruthy();
    expect(screen.getByLabelText(G8_COPY.viewfinderLabel)).toBeTruthy();
    expect(screen.getByText(G8_COPY.viewfinderStarting)).toBeTruthy();
    const shutter = screen.getByRole('button', { name: KIDS_COPY.takePhoto });
    expect(shutter.props.accessibilityState?.disabled).toBe(true);
    await press(shutter);
    expect(mockTakePicture).not.toHaveBeenCalled();
  });

  test('ready: the shutter takes the photo with HOMEWORK.capture (no EXIF), uploads it and submits it', async () => {
    const onDone = jest.fn();
    await renderWithTheme(<HomeworkSnap megaName="Teal" onDone={onDone} />);
    await ready();
    expect(screen.queryByText(G8_COPY.viewfinderStarting)).toBeNull();
    await press(screen.getByRole('button', { name: KIDS_COPY.takePhoto }));
    expect(mockTakePicture).toHaveBeenCalledWith(HOMEWORK.capture);
    expect((mockTakePicture.mock.calls[0][0] as { exif: boolean }).exif).toBe(false);
    expect(mockSubmit).toHaveBeenCalledWith({ storageId: 'storage_1' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('"Choose a photo instead" stays under the shutter and opens the photo picker', async () => {
    await renderWithTheme(<HomeworkSnap megaName="Teal" onDone={jest.fn()} />);
    await ready();
    await press(screen.getByRole('button', { name: KIDS_COPY.choosePhoto }));
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });

  test('denied: the honest copy, Choose a photo instead and Open Settings, and no camera', async () => {
    mockPermission = { granted: false, canAskAgain: false, status: 'denied' };
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderWithTheme(<HomeworkSnap megaName="Teal" onDone={jest.fn()} />);
    expect(screen.queryByTestId('camera')).toBeNull();
    expect(screen.getByText(KIDS_COPY.cameraDenied)).toBeTruthy();
    expect(screen.queryByRole('button', { name: KIDS_COPY.takePhoto })).toBeNull();
    await press(screen.getByRole('button', { name: G8_UI_COPY.snapOpenSettings }));
    expect(settings).toHaveBeenCalledTimes(1);
    await press(screen.getByRole('button', { name: KIDS_COPY.choosePhoto }));
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    settings.mockRestore();
  });

  test('not asked yet: asks once when the sheet opens', async () => {
    mockPermission = { granted: false, canAskAgain: true, status: 'undetermined' };
    await renderWithTheme(<HomeworkSnap megaName="Teal" onDone={jest.fn()} />);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  test('the camera fails to start: says so, offers the picker and "Try the camera again" (which remounts it)', async () => {
    await renderWithTheme(<HomeworkSnap megaName="Teal" onDone={jest.fn()} />);
    await act(async () => mockCameraProps.onMountError?.({ message: 'busy' }));
    expect(screen.getByText(G8_COPY.viewfinderFailed)).toBeTruthy();
    expect(screen.queryByTestId('camera')).toBeNull();
    expect(screen.getByRole('button', { name: KIDS_COPY.choosePhoto })).toBeTruthy();
    const before = mockCameraMounts;
    await press(screen.getByRole('button', { name: G8_UI_COPY.snapTryAgain }));
    expect(screen.getByTestId('camera')).toBeTruthy();
    expect(mockCameraMounts).toBe(before + 1);
  });
});

describe('HomeworkSnap (web: no live camera)', () => {
  test('keeps the worksheet frame and the picker-based shutter (decision 6)', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web');
    await renderWithTheme(<HomeworkSnap megaName="Teal" onDone={jest.fn()} />);
    expect(screen.queryByTestId('camera')).toBeNull();
    await press(screen.getByRole('button', { name: KIDS_COPY.takePhoto }));
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
    restore.restore();
  });
});

describe('the photo goes only to the upload (invariant 7)', () => {
  test('nothing in the homework flow saves to the camera roll or media library', () => {
    const offenders = collectSourceFiles()
      .filter((f) => /features\/kids\/HomeworkSnap|app\/homework/.test(relativeToSrc(f)) && !/\.test\./.test(f))
      .filter((f) => /expo-media-library|MediaLibrary|saveToLibrary|CameraRoll/.test(readSourceFile(f)));
    expect(offenders).toEqual([]);
  });
});
