// Shared sample family week (Family board, widgets). Times are minutes after midnight.
// Sample week. Times are minutes after midnight; "now" is set by the board's tweak.
const WHO = { You: '#2FB8B0', Partner: '#F2766B', Twins: '#8E6CE0', Family: '#9AA1AB' };
const WEEK = [
  { dow: 'Sun', num: 25, full: 'Sunday, October 25', events: [[16 * 60 + 50, 'Soccer pickup', 'You'], [17 * 60 + 30, 'Soccer practice ends', 'Twins'], [19 * 60, 'Dinner', 'Family'], [20 * 60 + 30, 'Reading time', 'Twins']] },
  { dow: 'Mon', num: 26, full: 'Monday, October 26', events: [[8 * 60, 'School drop-off', 'Partner'], [18 * 60, 'Soccer practice', 'Twins']] },
  { dow: 'Tue', num: 27, full: 'Tuesday, October 27', events: [[19 * 60 + 30, 'Recycling out', 'You']] },
  { dow: 'Wed', num: 28, full: 'Wednesday, October 28', events: [[18 * 60, 'Soccer practice', 'Twins'], [19 * 60, 'Dinner out', 'Family']] },
  { dow: 'Thu', num: 29, full: 'Thursday, October 29', events: [] },
  { dow: 'Fri', num: 30, full: 'Friday, October 30', events: [[18 * 60 + 30, 'Movie night', 'Family']] },
  { dow: 'Sat', num: 31, full: 'Saturday, October 31', events: [[17 * 60, 'Halloween costumes on', 'Family'], [18 * 60, 'Trick-or-treating', 'Family']] },
];
const NOW = { afternoon: 16 * 60 + 42, evening: 21 * 60 + 10 };
const SOON_WINDOW = 120;
const clock = (m) => { const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0'); return ((h + 11) % 12 + 1) + ':' + mm + (h < 12 ? ' AM' : ' PM'); };
const inMinutes = (d) => (d < 60 ? 'in ' + d + ' min' : 'in ' + Math.floor(d / 60) + ' hr ' + (d % 60 ? (d % 60) + ' min' : '')).trim();
