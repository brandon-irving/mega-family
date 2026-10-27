# Design canvas (mockups)

The approved screen mockups, published as a private Design-canvas artifact:
https://claude.ai/artifact/Wa23YjuTXtEhL3hy8PvZZV (version 30 after the Store eyes, Admin-approves-clashes and sign-in wordmark updates on Oct 27).

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
