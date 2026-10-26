# Design canvas (mockups)

The approved screen mockups, published as a private Design-canvas artifact:
https://claude.ai/artifact/Wa23YjuTXtEhL3hy8PvZZV (version 19 when copied here on Oct 26).

- `mega-screens/project/*.dc.html` — one board per screen state; `canvas.json` places the boards (rows per
  screen: Chat, HQ, Profile, Family, Onboarding, Push, Settings, Widgets).
- `mega-screens/assets/` — exported sprite data (`looks/looks.json`) and room assets.
- `build/` — board sources: `*.template.html` plus shared snippets (`sprite-live.js`, `themes.js`,
  `family-data.js`, `walker.js`). Build with `cd design/build && python3 build.py ..` (it writes into
  `../mega-screens/project/`).
- Publishing an update: Artifact publish with `url` = the link above, `root` = `design/mega-screens`,
  `file_path` = `project/<Board>.dc.html`, the `files` map for changed boards plus `canvas.json`.

Boards draw MEGAs live from code (the same pixel engine as `shared/sprite`); no generated images.
