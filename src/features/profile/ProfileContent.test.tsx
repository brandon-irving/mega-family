// Owner, Oct 28: "Pressing the MEGA profile should open up the screen for customizing it and other profile
// concerns". The profile (Profile board, design/build/Profile.template.html) leads with the MEGA itself
// (look with its Store parts, name, status), then a Look & personality row, then the person's own concerns:
// notifications and quiet hours, theme, and what the MEGA remembers (with forget). Kids customize only with
// what they own and don't rename unless config allows it.
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ROLES_CONFIG } from '@shared/config/roles';
import { ProfileContent, type ProfileContentProps } from './ProfileContent';

const MEGA = { _id: 'megas_teal', name: 'Teal', look: { hex: '#2FB8B0', sticker: 'star', antenna: 'star' }, personality: 'calm' } as unknown as ProfileContentProps['mega'];

function props(over: Partial<ProfileContentProps> = {}): ProfileContentProps {
  return {
    mega: MEGA,
    role: 'adult',
    statusLine: 'Available',
    isAdmin: false,
    onRename: jest.fn(),
    onOpenLookPersonality: jest.fn(),
    onOpenNotifications: jest.fn(),
    onOpenTheme: jest.fn(),
    onOpenMemories: jest.fn(),
    ...over,
  };
}

describe('MEGA profile', () => {
  test('leads with the MEGA: its name, a rename control and the Look & personality row', async () => {
    const p = props();
    await renderWithTheme(<ProfileContent {...p} />);
    expect(screen.getByText('Teal')).toBeTruthy();
    expect(screen.getByLabelText('Rename Teal')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Look and personality'));
    expect(p.onOpenLookPersonality).toHaveBeenCalled();
  });

  test('has the person’s own concerns: notifications and quiet hours, theme, and what it remembers', async () => {
    const p = props();
    await renderWithTheme(<ProfileContent {...p} />);
    await fireEvent.press(screen.getByLabelText('Notifications and quiet hours'));
    await fireEvent.press(screen.getByLabelText('Theme'));
    await fireEvent.press(screen.getByLabelText('What Teal remembers'));
    expect(p.onOpenNotifications).toHaveBeenCalled();
    expect(p.onOpenTheme).toHaveBeenCalled();
    expect(p.onOpenMemories).toHaveBeenCalled();
  });

  test('a kid: no rename (unless config allows) and no memory controls, but still the look and theme', async () => {
    await renderWithTheme(<ProfileContent {...props({ role: 'kid' })} />, { role: 'kid' });
    expect(screen.queryByLabelText('Rename Teal')).toBeNull();
    expect(ROLES_CONFIG.kid.profile.rename).toBe(false);
    expect(screen.queryByLabelText('What Teal remembers')).toBeNull();
    expect(screen.getByLabelText('Look and personality')).toBeTruthy();
    expect(screen.getByLabelText('Theme')).toBeTruthy();
  });
});
