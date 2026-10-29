// What the walking MEGAs do on each sign-in screen, ported from the approved Screen 9 boards (canvas v33,
// design/build/Login.template.html → `scene()`). The boards place MEGAs in a 390pt-wide frame with 24pt
// margins; `bx` converts those x values to a fraction along a ledge, so the same choreography plays on any
// width. Ledge ids match the <Ledge id> marks in the screens:
//   welcome: floor (where Hub stands, above the wordmark), head (the wordmark's capitals), make, invite,
//            signinRow (the "Already have an account?" row), signin (the lane under it), sheet (the sign-in
//            sheet's top edge)
//   invite:  field (the paste row), cont (Continue), help (the "No link yet?" card)
//   adult invite: card    kid invite: kidCard    expired: expiredCard    locked: lock
//   family:  start, join
//   scan:    reticle (the viewfinder's bottom edge), settings (Open Settings when the camera is denied)
// The loader's scene lives with the loader (src/features/walkers/MegaLoader.tsx).
import { at, freeze, FOREVER, HIDE, hop, ON_TOP, type Scene, script, SHOW, wait, walk } from '@/features/walkers';
import { SIGNIN_COPY } from '@shared/config/copy';
import { WALKER_CAST } from '@shared/config/walkers';

const BOARD = { margin: 24, width: 342 };
/** A board x (0–390) as a fraction along a margin-to-margin ledge. */
export const bx = (x: number) => (x - BOARD.margin) / BOARD.width;
const OUT_L = bx(-30);
const OUT_R = bx(420);

export type SignInScreen = 'welcome' | 'welcomeSheet' | 'invite' | 'inviteLinked' | 'adultInvite' | 'kidInvite' | 'expired' | 'locked' | 'family' | 'scan' | 'scanDenied' | 'scanFound';

export const SIGNIN_SCENES: Record<SignInScreen, Scene> = {
  welcome: {
    teal: script(
      [
        at('floor', OUT_L, 'right'), SHOW, walk(bx(96)), wait(2200, { happy: true, say: SIGNIN_COPY.sayHi(WALKER_CAST.teal.name) }), walk(bx(300)),
        wait(900, { face: 'right' }), walk(OUT_R), at('make', OUT_R, 'left'), hop('make', bx(316)), wait(2600, { emote: '!', poke: 'make' }),
        walk(bx(56)), wait(1300), hop('invite', OUT_L),
      ],
      0,
    ),
    violet: script(
      [
        HIDE, wait(2600), at('floor', OUT_R, 'left'), SHOW, walk(bx(268)), wait(700, { face: 'left' }), hop('head', bx(232)),
        wait(2400, { happy: true, emote: '♪' }), walk(bx(104)), wait(1200, { emote: '…' }), hop('floor', bx(60)), walk(OUT_L), HIDE, wait(3000),
      ],
      2,
    ),
    coral: script(
      [
        HIDE, wait(5200), at('signin', OUT_R, 'left'), SHOW, walk(bx(336)), wait(2600, { face: 'left', emote: '!', poke: 'signinRow' }),
        wait(1400, { happy: true }), walk(OUT_R), at('floor', OUT_R, 'left'), walk(bx(300)), wait(1800, { face: 'left', emote: '♪' }), walk(OUT_R), HIDE, wait(2000),
      ],
      2,
    ),
  },
  // The sign-in (or demo) sheet is up: Teal hops onto it; anyone the sheet slid over stays hidden.
  welcomeSheet: {
    teal: script([SHOW, ON_TOP, hop('sheet', bx(300)), wait(2400), walk(bx(92)), wait(1800, { emote: '…' }), walk(bx(300))], 3),
    violet: script([freeze('sheet')]),
    coral: script([freeze('sheet')]),
  },
  invite: {
    teal: script([at('cont', bx(330)), SHOW, wait(2600, { emote: '…' }), walk(bx(250)), wait(2000, { face: 'left' }), walk(bx(330))], 2),
    violet: script([at('help', bx(300), 'left'), SHOW, wait(1400, { emote: '?' }), walk(bx(92)), wait(1600, { poke: 'help' }), walk(bx(300))], 2),
    coral: script([HIDE]),
  },
  inviteLinked: {
    teal: script([SHOW, wait(500, { happy: true, emote: '!' }), walk(bx(195)), wait(FOREVER, { happy: true, poke: 'cont' })]),
    violet: script([SHOW, hop('cont', bx(110)), wait(1600, { face: 'right', emote: '♪' }), wait(FOREVER, { happy: true })]),
    coral: script([HIDE]),
  },
  // Adult invite: Teal welcomes them from the top of their new MEGA's card.
  adultInvite: {
    teal: script([at('card', OUT_R, 'left'), SHOW, walk(bx(300)), wait(2200, { happy: true, say: SIGNIN_COPY.join.greeting }), walk(bx(90)), wait(1600), walk(bx(300))], 2),
    violet: script([HIDE]),
    coral: script([HIDE]),
  },
  // Kid invite: their big MEGA is the star, so Teal and Coral wait on the grown-up card instead.
  kidInvite: {
    teal: script([at('kidCard', OUT_R, 'left'), SHOW, walk(bx(310)), wait(2200, { face: 'left', emote: '…' }), walk(bx(250)), wait(1800), walk(bx(310))], 2),
    coral: script([HIDE, wait(1800), at('kidCard', OUT_L, 'right'), SHOW, walk(bx(70)), wait(2400, { happy: true, emote: '♪' }), walk(bx(120)), wait(1600), walk(bx(70))], 5),
    violet: script([HIDE]),
  },
  expired: {
    teal: script([at('expiredCard', bx(300)), SHOW, wait(FOREVER, { emote: '…' })]),
    violet: script([HIDE]),
    coral: script([HIDE]),
  },
  locked: {
    violet: script([at('lock', OUT_L, 'right'), SHOW, walk(bx(140)), wait(1800, { face: 'right', emote: '…' }), wait(FOREVER)]),
    teal: script([HIDE]),
    coral: script([HIDE]),
  },
  family: {
    teal: script([at('start', bx(296)), SHOW, wait(2000, { happy: true }), walk(bx(236)), wait(1600, { emote: '!' }), walk(bx(296))], 2),
    coral: script([at('join', bx(96)), SHOW, wait(1600), walk(bx(160)), wait(2200, { emote: '♪' }), walk(bx(96))], 2),
    violet: script([HIDE]),
  },
  // G8 (boards LoginScan, ScanDenied, ScanFound): Teal paces the viewfinder's bottom edge watching the code;
  // with the camera denied there's no viewfinder, so Teal waits on Open Settings' top edge, never over text.
  scan: {
    teal: script([at('reticle', bx(195), 'back'), SHOW, wait(1400, { face: 'back', emote: '…' }), walk(bx(120)), wait(1400, { face: 'back' }), walk(bx(270)), wait(1600, { face: 'back', emote: '?' }), walk(bx(195))], 2),
    violet: script([HIDE]),
    coral: script([HIDE]),
  },
  scanDenied: {
    teal: script([at('settings', bx(300), 'left'), SHOW, wait(2200, { emote: '?' }), walk(bx(240)), wait(FOREVER, { face: 'front' })]),
    violet: script([HIDE]),
    coral: script([HIDE]),
  },
  scanFound: {
    teal: script([at('reticle', bx(195)), SHOW, wait(FOREVER, { happy: true, emote: '!' })]),
    violet: script([HIDE]),
    coral: script([HIDE]),
  },
};
