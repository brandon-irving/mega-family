// Shared by boards that draw a chat thread (thread.html). Needs sprite-live.js and store-live.js.
// Sample MEGAs; people are labelled by role only.
const MEGAS = {
  teal: { name: 'Teal', hex: '#2FB8B0', face: 'open', owner: 'Admin', mine: '#123B39' },
  coral: { name: 'Coral', hex: '#F2766B', face: 'happy', owner: 'Partner', mine: '#3F1F1C' },
  zap: { name: 'Zap', hex: '#8E6CE0', face: 'happy', owner: 'Twin 1', mine: '#2A2147', kid: true },
  sunny: { name: 'Sunny', hex: '#F2B33D', face: 'happy', owner: 'Twin 2', mine: '#3A2B10', kid: true },
  hub: { name: 'Hub', hex: '#5B8DEF', face: 'open', owner: 'the family', mine: '#10243F' },
};
// Kids get bigger text and targets, same as thread UI blocks in the app.
const SIZES = { adult: { font: 17, btnH: 44, btnFont: 15, title: 17, body: 15 }, kid: { font: 20, btnH: 54, btnFont: 18, title: 21, body: 17 } };
const SHEET = [
  { n: 1, text: '1/2 + 1/4 =' }, { n: 2, text: '1/3 + 1/3 =' }, { n: 3, text: '3/4 − 1/4 =' },
  { n: 4, text: '1/2 + 3/8 =' }, { n: 5, text: '2/5 + 1/10 =' }, { n: 6, text: '5/6 − 1/3 =' },
];
const BTN = {
  primary: { bg: '#EDEFF2', fg: '#0C0E11', border: '#EDEFF2' },
  ghost: { bg: 'transparent', fg: '#EDEFF2', border: '#3A414B' },
};
const btn = (label, pick, kind) => Object.assign({ label, pick }, BTN[kind || 'primary']);

// The header, sizes and composer for one person's chat with their MEGA.
function thread(megaId, items, extra) {
  const m = MEGAS[megaId], size = SIZES[m.kid ? 'kid' : 'adult'];
  return Object.assign({
    head: sprite(m.hex, m.face, 'none', 1, 27), name: m.name, sub: m.kid ? m.owner + '’s MEGA' : 'Your MEGA',
    accent: m.hex, mine: m.mine, font: size.font, btnH: size.btnH, btnFont: size.btnFont,
    showCoin: false, coin: coin(2), balance: 0, camera: false, openCamera: () => {}, sheet: SHEET,
    items: items.map((it) => card(it, size)),
  }, extra || {});
}

// Fill every flag thread.html reads, so a card only names what it has.
function card(it, size) {
  const base = { isDay: false, isText: false, isMine: false, isPhoto: false, isCard: false };
  if (it.day) return Object.assign(base, { isDay: true, text: it.day });
  if (it.mine) return Object.assign(base, { isMine: true, text: it.mine });
  if (it.photo) return Object.assign(base, { isPhoto: true, text: it.photo });
  if (it.say) return Object.assign(base, { isText: true, who: MEGAS[it.from].name, whoColor: MEGAS[it.from].hex, text: it.say });
  const c = Object.assign({ from: '', fromColor: '#9AA1AB', isAi: false, title: '', body: '', titleSize: size.title, bodySize: size.body, cols: 2 }, it.card);
  return Object.assign(base, c, {
    isCard: true, hasBody: !!c.body, hasProgress: !!c.dots, hasCompare: !!c.before, hasHint: !!c.hint, hasChips: !!c.chipRows, hasTags: !!c.tags,
    hasChecks: !!c.checks, hasRows: !!c.rows, hasStepper: c.amount !== undefined, hasChoices: !!c.choices,
    hasActions: !!(c.actions && c.actions.length), hasStatus: !!c.status, hasFoot: !!c.foot, statusColor: c.statusColor || '#9AA1AB',
  });
}
// A chip row: options with one selected.
function chipRow(label, options, selected, pick) {
  return { label, chips: options.map((o) => ({ label: o, pressed: String(o === selected), pick: () => pick(o),
    bg: o === selected ? '#EDEFF2' : 'transparent', fg: o === selected ? '#0C0E11' : '#EDEFF2', border: o === selected ? '#EDEFF2' : '#3A414B' })) };
}
// A checklist row.
function check(label, sub, done, toggle, accent) {
  return { label, sub, done, checked: String(done), toggle, strike: done ? 'line-through' : 'none',
    bg: done ? '#14201F' : '#0C0E11', border: done ? accent : '#2E343D', boxBorder: done ? accent : '#6B727D', boxBg: done ? accent : 'transparent' };
}
