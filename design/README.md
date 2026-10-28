# Design canvas (mockups)

The approved screen mockups, published as a private Design-canvas artifact:
https://claude.ai/artifact/Wa23YjuTXtEhL3hy8PvZZV (version 36 after the Oct 28 search, weather and travel row, Screen 14).

- `mega-screens/project/*.dc.html` — one board per screen state; `canvas.json` places the boards (rows per
  screen: Chat, HQ, Profile, Family, Onboarding, Push, Settings, Widgets, Sign in, Kids, Store,
  Calendar).
- `mega-screens/assets/` — exported sprite data (`looks/looks.json`) and room assets.
- `build/` — board sources: `*.template.html` plus shared snippets (`sprite-live.js`, `themes.js`,
  `family-data.js`, `walker.js`). Build with `cd design/build && python3 build.py ..` (it writes into
  `../mega-screens/project/`).
- Publishing an update: Artifact publish with `url` = the link above, `root` = `design/mega-screens`,
  `file_path` = `project/<Board>.dc.html`, the `files` map for changed boards plus `canvas.json`.

Boards draw MEGAs live from code (the same pixel engine as `shared/sprite`); no generated images.

Sign-in row (Screen 9): `build/Login.template.html` → `Login.dc.html` plus thin wrappers generated from
`LOGIN_BOARDS` in `build.py` (which also writes their canvas.json row). MEGAs walk on *ledges* (the top edge
of a button, card, headline or the scanner reticle), dip buttons they stand on, react to presses, and say hi
when tapped; the `motion: reduced` tweak shows the reduced-motion behavior (they stand still).

Onboarding chat row (Screen 13, Oct 28): `build/OnboardChat.template.html` on the shared thread, with wrappers
from `ONBOARD_CHAT_BOARDS` in `build.py`: sign up → "What should I call you?" → Gmail, calendar and .ics cards
(each with Not now; findings go to the private layer with a share suggestion) → hand-off to the Screen 5 family
steps.

Search, weather and travel row (Screen 14, G4, Oct 28): `build/Integrations.template.html` (its own cards:
search with sources and kid rephrased/blocked states, weather with pixel icons drawn in code and an NWS alert
variant, leave-by travel and its not-set-up state), plus Places (adults edit, kids read-only), a parent's view of a
kid's blocked/changed searches and the event place picker; wrappers from `INTEGRATION_BOARDS` in `build.py`.

Kids, Store and Calendar rows (Screens 10–12, Oct 27): `build/Kids.template.html`, `Store.template.html` and
`Calendar.template.html`, with wrappers from `KIDS_BOARDS`, `STORE_BOARDS` and `CAL_BOARDS` in `build.py`
(which also writes each row's title and a "Defaults to confirm" sticky). The chat boards share
`build/thread.html` + `thread.js` (header, messages and one data-driven card: chips, checklist, stepper,
before/after, choices, ideas). `store-live.js` draws a MEGA with a bought antenna shape, eye design and eye
colour from `assets/looks/store.json` (written by `prototypes/megasprite/export-looks.mjs`; `ANTENNAS`,
`EYE_STYLES`, `EYE_COLORS`, `ANIME_EYE` and `STORE_COLORS` in `mega-template.mjs`, defaults unchanged) and the
pixel Mega Bucks coin. The anime eyes were generated once with Muse Image (`muse-image-1.0`, Oct 27, $0.01;
source `assets/looks/source/anime-eyes-muse.png`) and downscaled by hand-checked nearest-colour sampling to
one 7x6 eye drawn twice on the visor.

Sign-in wordmark (owner, Oct 27): the Welcome board shows "MEGA" in large letters and the only tagline on any
sign-in screen, "A little help for the whole family". The capitals' top edge (y 411) is the `head` ledge.

Sign-in redesign (owner feedback, Oct 28; research on Mobbin): the Welcome brand block (Hub in a spotlight,
the wordmark, the tagline) is centered above the buttons, which sit in the thumb zone; the sheet offers Apple
and Google, then email + password (Create account / Sign in toggle, Show, Forgot password); loading is your
MEGA pacing on centered "Opening chats" (never blank); the invite screen puts the paste field and Continue
right under the instructions; adults and kids get separate invite screens (`who` prop), each showing the MEGA
the admin made for them (adults keep or change it, kids can't change it at join). Ledges moved: floor 341,
head 388, make 628, opening 414.

Kid composer (Oct 28): `thread.html` has one kid bar for every kid board (72pt Talk button + 72pt keyboard
toggle; typing swaps in a full-width field with a mic to go back), matching the Kid board. `KidsIntro` shows a
kid's first open: their MEGA says hi and how it helps, so a thread is never empty.
