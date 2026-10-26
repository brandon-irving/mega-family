# Design canvas (mockups)

The approved screen mockups, published as a private Design-canvas artifact:
https://claude.ai/artifact/Wa23YjuTXtEhL3hy8PvZZV (version 23 after the Sign-in row on Oct 26).

- `mega-screens/project/*.dc.html` — one board per screen state; `canvas.json` places the boards (rows per
  screen: Chat, HQ, Profile, Family, Onboarding, Push, Settings, Widgets, Sign in).
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
