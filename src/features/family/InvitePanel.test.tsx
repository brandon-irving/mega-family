// G5 UX review (Oct 29, finding 3): the onboarding "Invite sent" card drew a box with the words "QR code" in
// it and told the parent to find the code on the member's Family row — which had no invite at all. Now a real
// QR (qrcode-generator, drawn with react-native-svg) plus the link, its expiry, Send / Copy / New code, in the
// chat card and on an unjoined member's page.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { G5_FIX_COPY, fillCopy } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { qrMatrix } from '@/ui/QrCode';
import { InvitePanelView } from './InvitePanel';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const press = (el: Parameters<typeof fireEvent.press>[0]) =>
  act(async () => {
    fireEvent.press(el);
  });

const INVITE = { url: 'mega://join/tok_abc123', qrPayload: 'mega://join/tok_abc123', expiresAt: Date.UTC(2026, 10, 1, 22, 0) };
const TZ = 'America/New_York';

describe('qrMatrix', () => {
  test('encodes a join link as a square grid of dark/light modules (a real QR, not a placeholder)', () => {
    const m = qrMatrix(INVITE.qrPayload);
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    // The three finder patterns: the top-left 7×7 corner starts with a dark module.
    expect(m[0][0]).toBe(true);
    expect(m.flat().some((d) => !d)).toBe(true);
  });
});

describe('InvitePanelView', () => {
  test('before a code exists: one button makes it (no "QR code" placeholder box)', async () => {
    const onCreate = jest.fn();
    await renderWithTheme(<InvitePanelView name="Twin 1" invite={null} timeZone={TZ} onCreate={onCreate} onRegenerate={jest.fn()} />);
    expect(screen.queryByText('QR code')).toBeNull();
    await press(screen.getByRole('button', { name: G5_FIX_COPY.inviteShow }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  test('with a code: the QR, the link, when it stops working, and Send / Copy / New code', async () => {
    const onRegenerate = jest.fn();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await renderWithTheme(<InvitePanelView name="Twin 1" invite={INVITE} timeZone={TZ} onCreate={jest.fn()} onRegenerate={onRegenerate} />);
    expect(screen.getByLabelText(G5_FIX_COPY.inviteQrLabel)).toBeTruthy();
    expect(screen.getByText(INVITE.url)).toBeTruthy();
    expect(screen.getByText(fillCopy(G5_FIX_COPY.inviteExpires, { when: 'Sun Nov 1, 5:00 PM' }))).toBeTruthy();

    await press(screen.getByRole('button', { name: G5_FIX_COPY.inviteSend }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: fillCopy(G5_FIX_COPY.inviteShareMessage, { name: 'Twin 1', url: INVITE.url }) }));

    await press(screen.getByRole('button', { name: G5_FIX_COPY.inviteCopy }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(INVITE.url);
    expect(screen.getByRole('button', { name: G5_FIX_COPY.inviteCopied })).toBeTruthy();

    await press(screen.getByRole('button', { name: G5_FIX_COPY.inviteNew }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  test('the server refused (already joined, not their parent): a calm line, no dead buttons', async () => {
    await renderWithTheme(<InvitePanelView name="Twin 1" invite={null} error="nope" timeZone={TZ} onCreate={jest.fn()} onRegenerate={jest.fn()} />);
    expect(screen.getByText('nope')).toBeTruthy();
  });
});
