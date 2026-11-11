(() => {
  'use strict';

  const KEY = 'zuno.v1';
  const OLD_KEY = 'tally.v1'; // data saved before the rename
  const VERSION = '1.0.0';
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DOW1 = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  const DEFAULT_SETTINGS = { weekStart: 'mon', streaks: true, doneLast: false, scheme: 'classic' };
  const SCHEME_IDS = ['classic', 'vivid', 'soft', 'earth'];

  // Sections and their pages ([id, full label, short label for narrow screens]), shown as pills under the top bar.
  const NAV = [
    { id: 'today', label: 'Progress', subs: [
      ['day', 'Today', 'Today'],
      ['week', 'Past week', 'Past week'],
      ['month', 'Past month', 'Past month'],
    ] },
    { id: 'stats', label: 'Stats', subs: [
      ['overview', 'Overview', 'Overview'],
      ['byhabit', 'By habit', 'By habit'],
      ['bycat', 'By category', 'Categories'],
      ['trajectory', 'Trajectory', 'Trajectory'],
    ] },
    { id: 'habits', label: 'Habits', subs: [
      ['add', 'Add new habit', 'Add new'],
      ['change', 'Change current habits', 'Change'],
      ['list', 'Your habits', 'Your habits'],
    ] },
  ];

  // ---- dates (local, as YYYY-MM-DD strings so they compare lexically) ----
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const dow = s => (parse(s).getDay() + 6) % 7; // 0 = Monday (used for schedules)
  const today = () => iso(new Date());
  const shortDate = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
  const monthName = s => { const d = parse(s); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

  const daysBetween = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;

  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Markdown to one line of plain text: drop heading/list markers and emphasis, keep hyphens inside words.
  const plain = s => (s || '').replace(/^\s*(#{1,6}|[-*•]|\d+[.)])\s+/gm, '').replace(/[*`>_]+/g, '').replace(/\s+/g, ' ').trim();

  const DEFAULT_CATS = ['Sport', 'Health', 'Diet', 'Education', 'Religion', 'Mind', 'Sleep', 'Work', 'Social', 'Finance']
    .map(name => ({ id: name.toLowerCase(), name }));

  // ---- state ----
  // A habit: { id, name, cat, created, mode: 'days' | 'weekly', days: [0..6], times, hist, pauses: [{from, to}], archived }
  // mode/days/times are the schedule now; hist: [{ from, mode, days, times }] keeps every earlier one,
  // so editing a habit never rewrites its past.
  // Pauses hide a habit on those days without counting them as missed; archiving is an open-ended pause.
  function seed() {
    const t = today();
    const start = addDays(t, -34);
    const H = (name, cat, days, p, mode = 'days', times = 3) =>
      ({ id: uid(), name, cat, days, created: start, mode, times, pauses: [], archived: null, p });
    const habits = [
      H('Morning run', 'sport', [0, 2, 4], 0.7),
      H('Gym session', 'sport', ALL_DAYS, 0.45, 'weekly', 3),
      H('Stretch 10 min', 'sport', ALL_DAYS, 0.6),
      H('Drink 2 L of water', 'health', ALL_DAYS, 0.85),
      H('No added sugar', 'diet', ALL_DAYS, 0.55),
      H('Read 20 pages', 'education', ALL_DAYS, 0.75),
      H('Morning prayer', 'religion', ALL_DAYS, 0.9),
      H('Meditate', 'mind', [0, 1, 2, 3, 4], 0.5),
      H('In bed by 23:00', 'sleep', ALL_DAYS, 0.45),
    ];
    // Deterministic sample history so the stats screens have something to show.
    const log = {};
    const weekCounts = {};
    let s = 11;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let d = start; d < t; d = addDays(d, 1)) {
      const wk = addDays(d, -dow(d));
      for (const h of habits) {
        if (h.mode === 'weekly') {
          const k = h.id + wk;
          if ((weekCounts[k] || 0) < h.times && rnd() < h.p) {
            weekCounts[k] = (weekCounts[k] || 0) + 1;
            (log[d] ||= []).push(h.id);
          }
        } else if (h.days.includes(dow(d)) && rnd() < h.p) (log[d] ||= []).push(h.id);
      }
    }
    habits.forEach(h => delete h.p);
    return { v: 1, theme: null, settings: { ...DEFAULT_SETTINGS },
      categories: DEFAULT_CATS.map(c => ({ ...c })), habits, log, skips: {}, rest: {} };
  }

  function empty() {
    return { v: 1, theme: null, settings: { ...DEFAULT_SETTINGS },
      categories: DEFAULT_CATS.map(c => ({ ...c })), habits: [], log: {}, skips: {}, rest: {},
      notes: [], backupAt: null, backupSnooze: null };
  }
  const blank = () => ({ ...empty(), theme: state.theme, settings: state.settings });

  const valid = s => !!s && typeof s === 'object' && s.v === 1 && Array.isArray(s.habits) && Array.isArray(s.categories);
  const okId = s => typeof s === 'string' && /^[\w-]{1,48}$/.test(s);
  const cleanSched = x => {
    const mode = x.mode === 'weekly' ? 'weekly' : 'days';
    const days = [...new Set((Array.isArray(x.days) ? x.days : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    return {
      mode,
      days: mode === 'days' && days.length ? days : [...ALL_DAYS],
      times: Number.isInteger(x.times) && x.times >= 1 && x.times <= 7 ? x.times : 3,
    };
  };
  const stamp = s => { const d = new Date(typeof s === 'string' ? s : NaN); return isNaN(d) ? new Date().toISOString() : d.toISOString(); };

  // Rebuilds saved or imported data field by field, so a damaged or hand-edited file can't break the app.
  function sanitize(s) {
    const t = today();
    const now = new Date().toISOString();
    const categories = [];
    const catIds = new Map(); // id in the file -> id in use
    for (const c of s.categories) {
      if (!c || typeof c.name !== 'string' || !c.name.trim() || catIds.has(c.id)) continue;
      const id = okId(c.id) ? c.id : uid();
      catIds.set(c.id, id);
      categories.push({ id, name: c.name.trim().slice(0, 24) });
    }
    // Habits whose category is gone land in "Other" instead of disappearing from the lists.
    const other = () => {
      let c = categories.find(x => x.name.toLowerCase() === 'other');
      if (!c) categories.push(c = { id: 'other-' + uid().slice(0, 4), name: 'Other' });
      return c.id;
    };

    const habits = [];
    const habitIds = new Map();
    for (const h of s.habits) {
      if (!h || typeof h.name !== 'string' || !h.name.trim() || habitIds.has(h.id)) continue;
      const id = okId(h.id) ? h.id : uid();
      habitIds.set(h.id, id);
      const created = isDate(h.created) ? h.created : t;
      const cur = cleanSched(h);
      const hist = (Array.isArray(h.hist) ? h.hist : []).filter(x => x && isDate(x.from))
        .map(x => ({ from: x.from, ...cleanSched(x) })).sort((a, b) => (a.from < b.from ? -1 : 1));
      if (hist.length) Object.assign(hist[hist.length - 1], cur, { days: [...cur.days] });
      else hist.push({ from: created, ...cur, days: [...cur.days] });
      habits.push({
        id, name: h.name.trim().slice(0, 60), cat: catIds.get(h.cat) || other(), created, ...cur, hist,
        pauses: (Array.isArray(h.pauses) ? h.pauses : []).filter(p => p && isDate(p.from) && (p.to == null || isDate(p.to)))
          .map(p => ({ from: p.from, to: p.to || null })),
        archived: isDate(h.archived) ? h.archived : null,
      });
    }

    const dayMap = m => {
      const out = {};
      for (const [d, list] of Object.entries(m && typeof m === 'object' ? m : {})) {
        if (!isDate(d) || !Array.isArray(list)) continue;
        const ids = [...new Set(list.map(x => habitIds.get(x)).filter(Boolean))];
        if (ids.length) out[d] = ids;
      }
      return out;
    };
    const rest = {};
    for (const [d, v] of Object.entries(s.rest && typeof s.rest === 'object' ? s.rest : {})) if (isDate(d) && v) rest[d] = true;

    const sugg = list => {
      const out = (Array.isArray(list) ? list : []).filter(h => h && typeof h.name === 'string' && h.name.trim())
        .map(h => ({ name: h.name.trim().slice(0, 60), cat: catIds.get(h.cat) || '', ...cleanSched(h) }));
      return out.length ? out : null;
    };
    const notes = [];
    for (const n of Array.isArray(s.notes) ? s.notes : []) {
      if (!n || typeof n !== 'object' || !(typeof n.title === 'string' && n.title.trim()) && !(typeof n.body === 'string' && n.body.trim())) continue;
      notes.push({
        id: okId(n.id) && !notes.some(x => x.id === n.id) ? n.id : uid(),
        title: typeof n.title === 'string' ? n.title.slice(0, 80) : '',
        body: typeof n.body === 'string' ? n.body : '',
        created: stamp(n.created), updated: stamp(n.updated),
        source: n.source === 'ai' ? 'ai' : 'me', habits: sugg(n.habits), added: !!n.added,
      });
    }
    // Ask Zuno was removed in 1.0. Plans it wrote that were never saved move into Notes, so nothing is lost.
    for (const it of s.chat && Array.isArray(s.chat.items) ? s.chat.items : []) {
      if (!it || it.role !== 'assistant' || typeof it.text !== 'string') continue;
      const list = sugg(it.habits);
      if (it.text.length < 500 && !list) continue; // short replies were questions, not plans
      if (it.noteId && notes.some(n => n.id === it.noteId)) continue;
      const heading = (it.text.match(/^#{1,4}\s+(.+)$/m) || [])[1];
      notes.push({ id: uid(), title: plain(heading || it.text.split('\n')[0]).slice(0, 60), body: it.text,
        created: now, updated: now, source: 'ai', habits: list, added: !!it.added });
    }

    const st = s.settings && typeof s.settings === 'object' ? s.settings : {};
    return {
      v: 1,
      theme: ['light', 'dark', 'system'].includes(s.theme) ? s.theme : null,
      settings: {
        weekStart: st.weekStart === 'sun' ? 'sun' : 'mon',
        streaks: st.streaks !== false,
        doneLast: !!st.doneLast,
        scheme: SCHEME_IDS.includes(st.scheme) ? st.scheme : 'classic',
      },
      categories, habits, log: dayMap(s.log), skips: dayMap(s.skips), rest, notes,
      backupAt: isDate(s.backupAt) ? s.backupAt : null,
      backupSnooze: isDate(s.backupSnooze) ? s.backupSnooze : null,
    };
  }

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
      const s = JSON.parse(raw);
      if (valid(s)) return sanitize(s);
    } catch (e) { /* fall through */ }
    // Saved data that can't be read is set aside, not overwritten.
    if (raw) { try { localStorage.setItem(KEY + '.broken', raw); } catch (e) { /* no room */ } }
    return empty(); // first launch starts clean; sample data is one tap away in Settings
  }
  let saveFailed = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); saveFailed = false; }
    catch (e) { saveFailed = true; } // shown as a warning at the top of every page
  }

  let state = load();
  save();
  // Ask Zuno was removed in 1.0, so its API key has no use any more.
  try { localStorage.removeItem('zuno.ai.key'); } catch (e) { /* nothing stored */ }
  // Ask the browser not to clear Zuno's data when the device runs low on space.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const ui = {
    view: 'today',
    sub: { today: 'day', stats: 'overview', habits: 'add' },
    date: today(),
    range: 30,
    rep: { week: 0, month: 0 },
    edit: null,
    form: { name: '', cat: 'sport', days: [...ALL_DAYS], newCat: '', mode: 'days', times: 3, created: today(), scope: 'today' },
    catEdit: null,
    err: '',
    note: '',
    pop: null,
    noteId: null,
    noteEdit: false,
    sel: {},
  };

  // ---- queries ----
  const catName = id => (state.categories.find(c => c.id === id) || { name: '—' }).name;
  const isDone = (h, d) => (state.log[d] || []).includes(h.id);
  const isSkipped = (h, d) => (state.skips[d] || []).includes(h.id);
  const isRest = d => !!state.rest[d];
  const isPaused = (h, d) => h.pauses.some(p => p.from <= d && (!p.to || d <= p.to));
  const openPause = h => h.pauses.find(p => !p.to);

  // Week start as a Monday-based index (0 = Monday, 6 = Sunday) and the display order of weekdays.
  const ws = () => (state.settings.weekStart === 'sun' ? 6 : 0);
  const weekOrder = () => ALL_DAYS.map(i => (i + ws()) % 7);
  const weekStartOf = d => addDays(d, -((dow(d) - ws() + 7) % 7));

  // The schedule a habit had on day d: the latest entry that had started by then.
  function sched(h, d) {
    for (let i = h.hist.length - 1; i > 0; i--) if (h.hist[i].from <= d) return h.hist[i];
    return h.hist[0];
  }
  const schedKey = x => (x.mode === 'weekly' ? 'w' + x.times : 'd' + [...x.days].sort().join(''));

  // Shown on the day's list.
  function listed(h, d) {
    if (h.created > d || isPaused(h, d)) return false;
    const s = sched(h, d);
    return s.mode === 'weekly' || s.days.includes(dow(d));
  }
  const open = (h, d) => listed(h, d) && !isRest(d) && !isSkipped(h, d);

  function weekCount(h, d) {
    const s = weekStartOf(d);
    let n = 0;
    for (let i = 0; i < 7; i++) if (isDone(h, addDays(s, i))) n++;
    return n;
  }

  // Counts toward the day's total. Anything ticked counts. A weekly habit is only due on the days
  // you can no longer skip and still reach the target, so a week that ends at 1 of 3 records two misses.
  function due(h, d) {
    if (!listed(h, d)) return false;
    if (isDone(h, d)) return true;
    if (isRest(d) || isSkipped(h, d)) return false;
    const s = sched(h, d);
    if (s.mode !== 'weekly') return true;
    const start = weekStartOf(d);
    let before = 0;
    for (let x = start; x < d; x = addDays(x, 1)) if (isDone(h, x)) before++;
    const need = s.times - before;
    if (need <= 0) return false;
    let left = 0;
    for (let x = d, end = addDays(start, 6); x <= end; x = addDays(x, 1)) if (open(h, x)) left++;
    return need >= left;
  }

  function dayScore(d) {
    const hs = state.habits.filter(h => due(h, d));
    return { done: hs.filter(h => isDone(h, d)).length, total: hs.length };
  }

  // ---- streaks (the fire) ----
  // A missed day only breaks a streak once it is fully over: at 3 am the next morning.
  // So today is always still open, and so is yesterday until 3 am.
  const openFrom = () => (new Date().getHours() < 3 ? addDays(today(), -1) : today());
  const neutralDay = (h, d) => isPaused(h, d) || isRest(d) || isSkipped(h, d);

  // How many times in a row this habit was done.
  // Set days: days it isn't set for don't matter; a missed set day ends the streak.
  // X times a week: up to 8 - X missed days in a row are allowed; one more ends it.
  // Skipped, rest and paused days never count as missed.
  function habitStreak(h) {
    const from = openFrom();
    let count = 0, missed = 0;
    for (let d = today(), i = 0; d >= h.created && i < 3660; d = addDays(d, -1), i++) {
      const s = sched(h, d);
      if (s.mode !== 'weekly' && !s.days.includes(dow(d))) continue;
      if (isDone(h, d)) { count++; missed = 0; continue; }
      if (neutralDay(h, d) || d >= from) continue;
      if (++missed > (s.mode === 'weekly' ? 8 - s.times : 0)) break;
    }
    return count;
  }

  // Days in a row with at least half of the day's due habits done.
  // Rest days and days with nothing planned count too; the streak starts with the first habit.
  function dayStreak() {
    if (!state.habits.length) return 0;
    const first = state.habits.reduce((m, h) => (h.created < m ? h.created : m), today());
    const from = openFrom();
    let count = 0;
    for (let d = today(); d >= first; d = addDays(d, -1)) {
      const s = dayScore(d);
      if (isRest(d) || !s.total || s.done * 2 >= s.total) { count++; continue; }
      if (d >= from) continue;
      break;
    }
    return count;
  }

  const FLAME = '<path d="M12 2.5c.7 3.1 3.3 4.8 4.6 7.4 1.8 3.7-.2 9-4.6 9.6-4.5.5-7.3-3-6.4-6.9.4-1.8 1.5-3.1 2.7-4 .1 1.6.7 2.8 1.9 3.4-.6-3.4.5-6.8 1.8-9.5z" fill="url(#zuno-flame)"/>';
  const fire = (n, title) => `<span class="fire ${n ? '' : 'off'}" title="${title}"><svg viewBox="0 0 24 24" aria-hidden="true">${FLAME}</svg>${n}</span>`;
  const habitFire = h => { const n = habitStreak(h); return fire(n, `${n} in a row`); };

  // ---- category icons and colors ----
  const CAT_STYLE = {
    sport: ['red', '<path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/>'],
    health: ['pink', '<path d="M12 19s-7-4.3-7-9.1A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3C19 14.7 12 19 12 19z"/>'],
    diet: ['green', '<path d="M12 8.2c-3-1.6-6.6.4-6.6 4.4S8 20 10 20c1 0 1.3-.5 2-.5s1 .5 2 .5c2 0 4.6-3.4 4.6-7.4S15 6.6 12 8.2z"/><path d="M12 8.2c0-2.1 1-3.6 3-4.2"/>'],
    education: ['blue', '<path d="M12 7c-2-1.4-5-1.9-8-1.4v12.5c3-.5 6 0 8 1.4 2-1.4 5-1.9 8-1.4V5.6C17 5.1 14 5.6 12 7zM12 7v12.5"/>'],
    religion: ['indigo', '<path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z"/>'],
    mind: ['teal', '<circle cx="12" cy="12" r="7"/><path d="M8.8 12.6c1.1 1.1 2.1 1.1 3.2 0s2.1-1.1 3.2 0"/>'],
    sleep: ['purple', '<path d="M18.5 14.6A7 7 0 0 1 9.4 5.5a7 7 0 1 0 9.1 9.1z"/>'],
    work: ['gray', '<rect x="4" y="8" width="16" height="11" rx="2"/><path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8M4 13h16"/>'],
    social: ['orange', '<circle cx="9" cy="9" r="3"/><path d="M4 19c0-3 2.2-5 5-5s5 2 5 5"/><circle cx="17" cy="10" r="2.3"/><path d="M15.6 14.3c2.6-.4 4.4 1.4 4.4 4.2"/>'],
    finance: ['yellow', '<circle cx="12" cy="12" r="7.5"/><path d="M14.5 9.6c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 1.9 0 2.6 5 1.3 5 3.9 0 1.1-1 1.9-2.5 1.9-1.2 0-2.1-.5-2.6-1.3M12 7v1.4M12 15.6V17"/>'],
  };
  const COLOR_ORDER = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'gray'];
  // Categories you add yourself get a color picked from their name, so it never changes.
  function catStyle(id) {
    if (CAT_STYLE[id]) return CAT_STYLE[id];
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return [COLOR_ORDER[h % COLOR_ORDER.length], '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/>'];
  }
  const catColor = id => `var(--c-${catStyle(id)[0]})`;
  const catIcon = id => `<span class="cat-ic" style="--cc:${catColor(id)}"><svg viewBox="0 0 24 24" aria-hidden="true">${catStyle(id)[1]}</svg></span>`;

  const SCHEMES = [
    ['classic', 'Classic', 'Black and white'],
    ['vivid', 'Vivid', 'Bright colors, like iOS'],
    ['soft', 'Soft', 'Muted pastels'],
    ['earth', 'Earth', 'Greens and warm tones'],
  ];

  function habitPeriod(h, from, to) {
    let done = 0, total = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!due(h, d)) continue;
      total++;
      if (isDone(h, d)) done++;
    }
    return { done, total };
  }
  const habitRange = (h, days) => habitPeriod(h, addDays(today(), -(days - 1)), today());

  // Share of due check-ins done in the 7 days ending on d (null when nothing was due).
  // Today only counts once it's done, so an unfinished morning doesn't drag the line down.
  function rolling(habits, d) {
    const t = today();
    let done = 0, total = 0;
    for (let k = 0; k < 7; k++) {
      const x = addDays(d, -k);
      for (const h of habits) {
        if (!due(h, x)) continue;
        const ok = isDone(h, x);
        if (x === t && !ok) continue;
        total++;
        if (ok) done++;
      }
    }
    return total ? done / total : null;
  }

  function schedLabel(h) {
    if (h.mode === 'weekly') return `${h.times}× a week`;
    const k = [...h.days].sort().join('');
    if (k === '0123456') return 'Every day';
    if (k === '01234') return 'Weekdays';
    if (k === '56') return 'Weekends';
    return weekOrder().filter(i => h.days.includes(i)).map(i => DOW[i]).join(' ');
  }
  const statusLabel = h => (h.archived ? 'Archived' : isPaused(h, today()) ? 'Paused' : '');

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const pageHead = (section, title) => `<div class="page-h"><span class="lbl">${section}</span><h2>${title}</h2></div>`;
  const segHtml = (act, cur, opts) => `<div class="seg">${opts.map(([v, l]) =>
    `<button class="${v === cur ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;

  // A reminder on Today once there is a week of history and the last backup is a month old.
  function backupNudge() {
    const t = today();
    if (ui.date !== t || Object.keys(state.log).length < 7) return '';
    if (state.backupSnooze && state.backupSnooze > t) return '';
    if (state.backupAt && daysBetween(t, state.backupAt) < 30) return '';
    return `<div class="nudge">
      <span><b>Back up your data</b><small>${state.backupAt ? `Last backup: ${shortDate(state.backupAt)}.` : 'No backup yet.'} Your history lives only on this device.</small></span>
      <span class="nudge-a"><button class="btn sm primary" data-act="export">Back up</button><button class="linkbtn" data-act="snooze">Later</button></span>
    </div>`;
  }

  // ---- today: the day ----
  function viewDay() {
    const t = today();
    const d = ui.date;
    const rest = isRest(d);
    const hs = state.habits.filter(h => listed(h, d));
    const dueList = hs.filter(h => due(h, d));
    const n = dueList.filter(h => isDone(h, d)).length;
    const N = dueList.length;

    const label = d === t ? 'Today' : d === addDays(t, -1) ? 'Yesterday' : DOW_LONG[dow(d)];
    const dd = parse(d);
    const when = d === t ? ' today' : '';
    const caption = rest ? `Rest day. <span class="rest">Nothing counts against you.</span>`
      : !N ? 'Nothing due.'
      : `${n} of ${N} habits done${when}. <span class="rest">${n === N ? 'All done.' : `${N - n} to go.`}</span>`;

    const hero = `
      <section class="hero">
        <div class="daynav">
          <div class="date">
            <span class="k">${label}</span>
            <span class="v">${dd.getDate()} ${MONTHS[dd.getMonth()]} ${dd.getFullYear() !== new Date().getFullYear() ? dd.getFullYear() : ''}
              ${state.habits.length ? fire(dayStreak(), 'Days in a row with at least half of your habits done') : ''}</span>
          </div>
          <div class="arrows">
            <label class="arrow cal" title="Pick a date">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>
              <input type="date" id="jump" value="${d}" max="${t}" aria-label="Pick a date">
            </label>
            <button class="arrow" data-act="shift" data-n="-1" aria-label="Previous day">←</button>
            <button class="arrow" data-act="shift" data-n="1" aria-label="Next day" ${d >= t ? 'disabled' : ''}>→</button>
          </div>
        </div>
        <div class="score" aria-label="${n} of ${N}"><span class="n">${n}</span><span class="of">/${N}</span></div>
        <div class="meta"><span>${caption}</span><span class="pc">${N ? pct(n, N) + '%' : ''}</span></div>
        <div class="ticks">${dueList.map((_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>
        <div class="dayfoot">
          <button class="restbtn ${rest ? 'on' : ''}" data-act="rest" aria-pressed="${rest}">${rest ? 'Rest day · Undo' : 'Mark as rest day'}</button>
        </div>
      </section>`;

    const first = weekStartOf(d);
    const week = `<section class="week">${ALL_DAYS.map(i => {
      const di = addDays(first, i);
      const wd = dow(di);
      const future = di > t;
      const s = dayScore(di);
      const h = future || !s.total ? 0 : (s.done / s.total) * 100;
      return `<button class="wd ${di === d ? 'sel' : ''}" data-act="date" data-date="${di}" ${future ? 'disabled' : ''}
          aria-label="${DOW_LONG[wd]} ${parse(di).getDate()}: ${s.done} of ${s.total}">
        <span class="l">${DOW1[wd]}</span><span class="n">${parse(di).getDate()}</span>
        <span class="m"><b style="height:${h}%"></b></span>
      </button>`;
    }).join('')}</section>`;

    if (!state.habits.some(h => !h.archived)) {
      return hero + week + `<div class="empty"><p>No habits yet.</p>
        <button data-view="habits" data-sub="add">Set up your first habit →</button></div>`;
    }
    if (!hs.length) {
      return hero + week + `<div class="empty"><p>A free day.</p>Nothing is scheduled for this date.</div>`;
    }

    const showStreaks = state.settings.streaks && d === t;
    const row = h => {
      const done = isDone(h, d);
      const skipped = isSkipped(h, d);
      const sc = sched(h, d);
      const weekly = sc.mode === 'weekly';
      const wk = weekly ? weekCount(h, d) : 0;
      const met = weekly && !done && wk >= sc.times;
      let meta = '';
      if (skipped) meta = 'Skipped';
      else if (weekly) meta = met ? 'Done for the week' : `${wk}/${sc.times} this week`;
      if (showStreaks && !skipped) { const n = habitStreak(h); if (n) meta += (meta ? ' ' : '') + fire(n, `${n} in a row`); }
      return `<div class="habit ${done ? 'done' : ''} ${skipped ? 'skipped' : ''} ${met ? 'met' : ''} ${ui.pop === h.id ? 'pop' : ''}">
        <button class="hmain" data-act="toggle" data-id="${h.id}" aria-pressed="${done}">
          <span class="box"></span>
          <span class="name">${esc(h.name)}</span>
          <span class="streak">${meta}</span>
        </button>
        ${done || met ? '' : `<button class="skip" data-act="skip" data-id="${h.id}">${skipped ? 'Undo' : 'Skip'}</button>`}
      </div>`;
    };

    const groups = state.categories.map(c => {
      let list = hs.filter(h => h.cat === c.id);
      if (!list.length) return '';
      const k = list.filter(h => isDone(h, d)).length;
      const due_ = list.filter(h => due(h, d)).length;
      if (state.settings.doneLast) list = [...list.filter(h => !isDone(h, d)), ...list.filter(h => isDone(h, d))];
      return `<section class="group">
        <header><h3>${catIcon(c.id)}${esc(c.name)}</h3><span class="frac">${k}/${due_}</span></header>
        ${list.map(row).join('')}
      </section>`;
    }).join('');

    return hero + week + backupNudge() + groups;
  }

  // ---- today: past week / past month reports ----
  // offset 0 is the most recent finished period, so a new week appears on the week-start day
  // and a new month on the 1st.
  function bounds(kind, off) {
    const t = today();
    if (kind === 'week') {
      const from = addDays(weekStartOf(t), -7 * (off + 1));
      return { from, to: addDays(from, 6) };
    }
    const d = parse(t);
    const m = new Date(d.getFullYear(), d.getMonth() - 1 - off, 1);
    return { from: iso(m), to: iso(new Date(m.getFullYear(), m.getMonth() + 1, 0)) };
  }

  function periodData(from, to) {
    const perDay = [];
    let done = 0, total = 0, perfect = 0, rest = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const s = dayScore(d);
      done += s.done; total += s.total;
      if (s.total && s.done === s.total) perfect++;
      if (isRest(d)) rest++;
      perDay.push({ d, ...s });
    }
    const perHabit = state.habits.map(h => ({ h, ...habitPeriod(h, from, to) })).filter(x => x.total);
    const perCat = state.categories.map(c => {
      const r = perHabit.filter(x => x.h.cat === c.id);
      return { c, done: r.reduce((a, x) => a + x.done, 0), total: r.reduce((a, x) => a + x.total, 0) };
    }).filter(x => x.total);
    return { perDay, done, total, perfect, rest, perHabit, perCat };
  }

  function viewReport(kind) {
    const title = kind === 'week' ? 'Past week' : 'Past month';
    const off = ui.rep[kind];
    const b = bounds(kind, off);
    const pb = bounds(kind, off + 1);
    const cur = periodData(b.from, b.to);
    const earliest = state.habits.reduce((m, h) => (h.created < m ? h.created : m), today());
    const olderOk = pb.to >= earliest;
    // Only compare against a period that was tracked from start to end; a half-empty one would mislead.
    const prev = pb.from >= earliest ? periodData(pb.from, pb.to) : { perHabit: [], perCat: [], total: 0 };
    const startDay = state.settings.weekStart === 'sun' ? 'Sunday' : 'Monday';
    const label = kind === 'week' ? `${shortDate(b.from)} – ${shortDate(b.to)}` : monthName(b.from);
    const rule = kind === 'week' ? `A new report every ${startDay}` : 'A new report on the 1st of every month';
    const sub = off === 0 ? rule : `${off} ${kind}${off > 1 ? 's' : ''} before the latest`;

    const nav = `
      <div class="shead">
        <span class="lbl"><b class="plabel">${label}</b><br>${sub}</span>
        <div class="arrows">
          <button class="arrow" data-act="rep" data-k="${kind}" data-n="1" aria-label="Older" ${olderOk ? '' : 'disabled'}>←</button>
          <button class="arrow" data-act="rep" data-k="${kind}" data-n="-1" aria-label="Newer" ${off === 0 ? 'disabled' : ''}>→</button>
        </div>
      </div>`;

    if (!cur.total) {
      return pageHead('Progress', title) + nav +
        `<div class="empty"><p>Nothing to report for this ${kind}.</p>Reports fill in once your habits have run for a full ${kind}.</div>`;
    }

    const rate = pct(cur.done, cur.total);
    const prate = prev.total ? pct(prev.done, prev.total) : null;
    const delta = prate == null ? `No full ${kind} before to compare` : rate === prate ? `Same as the ${kind} before`
      : `${rate > prate ? '↑' : '↓'} ${Math.abs(rate - prate)} pts on the ${kind} before`;

    const big = `
      <div class="big">
        <div><div class="v">${rate}<small>%</small></div><span class="lbl">Completion</span><span class="delta">${delta}</span></div>
        <div><div class="v">${cur.done}<small>/${cur.total}</small></div><span class="lbl">Check-ins</span></div>
        <div><div class="v">${cur.perfect}<small>/${cur.perDay.length}</small></div><span class="lbl">Perfect days</span></div>
      </div>`;

    const lvl = p => (!p.total || !p.done ? 0 : Math.max(1, Math.ceil((p.done / p.total) * 4)));
    const tip = p => `${DOW_LONG[dow(p.d)]} ${shortDate(p.d)} · ${isRest(p.d) ? 'rest day' : `${p.done}/${p.total}`}`;
    let days;
    if (kind === 'week') {
      days = `<div class="card pad"><div class="wbars">${cur.perDay.map(p => `
        <div class="wb" data-act="openDay" data-date="${p.d}" title="${tip(p)}">
          <span class="wv">${isRest(p.d) ? 'Rest' : p.total ? `${p.done}/${p.total}` : '–'}</span>
          <span class="wt"><b style="height:${p.total ? (p.done / p.total) * 100 : 0}%"></b></span>
          <span class="wl">${DOW1[dow(p.d)]}<br>${parse(p.d).getDate()}</span>
        </div>`).join('')}</div></div>`;
    } else {
      const lead = (dow(b.from) - ws() + 7) % 7;
      const cells = '<i class="pad"></i>'.repeat(lead) + cur.perDay.map(p => {
        const l = lvl(p);
        return `<i class="l${l} ${l >= 3 ? 'dk' : ''} ${isRest(p.d) ? 'rest' : ''}" data-act="openDay" data-date="${p.d}" title="${tip(p)}"><span>${parse(p.d).getDate()}</span></i>`;
      }).join('');
      days = `<div class="card pad">
        <div class="mcal-h">${weekOrder().map(w => `<span>${DOW1[w]}</span>`).join('')}</div>
        <div class="mcal">${cells}</div>
      </div>`;
    }

    // highlights
    const ranked = cur.perHabit.map(x => ({ ...x, r: x.done / x.total })).sort((a, b2) => b2.r - a.r || b2.total - a.total);
    const top = ranked[0];
    const low = ranked[ranked.length - 1];
    const prevRate = new Map(prev.perHabit.map(x => [x.h.id, x.done / x.total]));
    const improved = ranked.filter(x => prevRate.has(x.h.id))
      .map(x => ({ ...x, dlt: x.r - prevRate.get(x.h.id) })).sort((a, b2) => b2.dlt - a.dlt)[0];
    const byDow = {};
    cur.perDay.forEach(p => {
      if (!p.total) return;
      const k = dow(p.d);
      byDow[k] ||= { d: 0, t: 0 };
      byDow[k].d += p.done; byDow[k].t += p.total;
    });
    const bestDow = Object.entries(byDow).sort((a, b2) => b2[1].d / b2[1].t - a[1].d / a[1].t)[0];
    const hl = (k, v, n) => `<div class="hl"><span class="k">${k}</span><span class="v">${v}</span><span class="num">${n}</span></div>`;
    const highlights = [
      hl('Strongest', esc(top.h.name), `${pct(top.done, top.total)}% · ${top.done}/${top.total}`),
      low !== top && low.r < 1 ? hl('Needs attention', esc(low.h.name), `${pct(low.done, low.total)}% · ${low.done}/${low.total}`) : '',
      improved && improved.dlt > 0 ? hl('Most improved', esc(improved.h.name), `↑ ${Math.round(improved.dlt * 100)} pts`) : '',
      bestDow ? hl(kind === 'week' ? 'Best day' : 'Best weekday', DOW_LONG[bestDow[0]] + (kind === 'week' ? '' : 's'),
        `${pct(bestDow[1].d, bestDow[1].t)}%`) : '',
      cur.rest ? hl('Rest days', String(cur.rest), '') : '',
    ].join('');

    const prevCat = new Map(prev.perCat.map(x => [x.c.id, pct(x.done, x.total)]));
    const dl = (now, before) => (before == null ? '' : now === before ? '±0' : `${now > before ? '+' : '−'}${Math.abs(now - before)}`);
    const cats = cur.perCat.sort((a, b2) => b2.done / b2.total - a.done / a.total).map(x => `
      <div class="brow">
        <span class="cn">${catIcon(x.c.id)}${esc(x.c.name)}</span>
        <span class="bar" style="--cc:${catColor(x.c.id)}"><b style="width:${pct(x.done, x.total)}%"></b></span>
        <span class="num">${dl(pct(x.done, x.total), prevCat.get(x.c.id))}</span>
        <span class="num strong">${pct(x.done, x.total)}%</span>
      </div>`).join('');

    const habits = `
      <div class="rrow head"><span></span><span class="th">Rate</span><span class="th">Change</span><span class="th">Done</span></div>
      ${ranked.map(x => {
        const before = prevRate.has(x.h.id) ? Math.round(prevRate.get(x.h.id) * 100) : null;
        return `<div class="rrow">
          <span class="nm">${esc(x.h.name)}<small>${esc(catName(x.h.cat))} · ${schedLabel(x.h)}</small></span>
          <span class="num strong">${pct(x.done, x.total)}%</span>
          <span class="num">${dl(pct(x.done, x.total), before) || '—'}</span>
          <span class="num">${x.done}/${x.total}</span>
        </div>`;
      }).join('')}`;

    return pageHead('Progress', title) + nav + big +
      `<div class="section-h"><h3>Day by day</h3></div>` + days +
      `<div class="section-h"><h3>Highlights</h3></div><div class="card list">${highlights}</div>` +
      `<div class="section-h"><h3>By category</h3><span class="frac">Change in pts</span></div><div class="card list">${cats}</div>` +
      `<div class="section-h"><h3>By habit</h3></div><div class="card list">${habits}</div>` +
      `<div class="foot">${kind === 'week'
        ? `Covers the last full week. The next report appears on ${startDay}, when this week is over.`
        : 'Covers the last full calendar month. The next report appears on the 1st.'}
        Skipped, rest and paused days aren’t counted as missed.</div>`;
  }

  // ---- stats ----
  const rangeBar = () => `
    <div class="shead">
      <span class="lbl" style="margin:0">Last ${ui.range} days</span>
      ${segHtml('range', String(ui.range), [['7', '7d'], ['30', '30d'], ['90', '90d']])}
    </div>`;

  const noHabits = () => `<div class="empty"><p>Nothing to measure yet.</p>
    <button data-view="habits" data-sub="add">Add a habit →</button></div>`;

  function viewOverview() {
    const t = today();
    const R = ui.range;
    let done = 0, total = 0, perfect = 0;
    for (let i = 0; i < R; i++) {
      const s = dayScore(addDays(t, -i));
      done += s.done; total += s.total;
      if (s.total && s.done === s.total) perfect++;
    }
    const big = `
      <div class="big">
        <div><div class="v">${pct(done, total)}<small>%</small></div><span class="lbl">Completion</span></div>
        <div><div class="v">${done}<small>/${total}</small></div><span class="lbl">Check-ins</span></div>
        <div><div class="v">${perfect}</div><span class="lbl">Perfect days</span></div>
      </div>`;

    // 12-week calendar; columns are weeks starting on the chosen week start
    const start = addDays(weekStartOf(t), -7 * 11);
    let cells = '';
    for (let i = 0; i < 84; i++) {
      const d = addDays(start, i);
      if (d > t) { cells += '<i class="fut"></i>'; continue; }
      const s = dayScore(d);
      const lvl = !s.total || !s.done ? 0 : Math.max(1, Math.ceil((s.done / s.total) * 4));
      cells += `<i class="${lvl ? 'l' + lvl : ''} ${d === t ? 'now' : ''}" data-act="openDay" data-date="${d}" title="${shortDate(d)} · ${s.done}/${s.total}"></i>`;
    }
    const heat = `
      <div class="section-h"><h3>Twelve weeks</h3><span class="frac">Tap a square to open that day</span></div>
      <div class="card pad"><div class="heatwrap">
        <div class="heatdays">${weekOrder().map((w, i) => `<span>${i % 2 === 0 ? DOW1[w] : ''}</span>`).join('')}</div>
        <div class="heat">${cells}</div>
      </div>
      <div class="legend"><span>Less</span><i style="background:var(--l0)"></i><i style="background:var(--l1)"></i><i style="background:var(--l2)"></i><i style="background:var(--l3)"></i><i style="background:var(--l4)"></i><span>More</span></div></div>`;

    return pageHead('Stats', 'Overview') + (state.habits.length ? rangeBar() + big + heat : noHabits());
  }

  function viewByHabit() {
    const R = ui.range;
    const rows = state.habits.map(h => ({ h, ...habitRange(h, R) }))
      .filter(x => x.total || !x.h.archived)
      .sort((a, b) => pct(b.done, b.total) - pct(a.done, a.total));
    const body = `
      <div class="card list" style="margin-top:16px"><div class="trow head"><span></span><span class="th">Rate</span><span class="th">Streak</span></div>
      ${rows.map(x => `<div class="trow">
        <span class="nm">${esc(x.h.name)}<small>${esc(catName(x.h.cat))} · ${x.done}/${x.total}${statusLabel(x.h) ? ' · ' + statusLabel(x.h) : ''}</small>
          <span class="mbar"><b style="width:${pct(x.done, x.total)}%"></b></span></span>
        <span class="num strong">${x.total ? pct(x.done, x.total) + '%' : '—'}</span>
        <span class="num">${habitFire(x.h)}</span>
      </div>`).join('')}
      </div><div class="foot">Streak = times done in a row. A missed day ends it at 3 am the next morning; days a habit isn’t set for, and skipped, rest or paused days, don’t count as missed. “X times a week” habits can miss up to 8 − X days in a row.</div>`;
    return pageHead('Stats', 'By habit') + (state.habits.length ? rangeBar() + body : noHabits());
  }

  function viewByCat() {
    const R = ui.range;
    const hstats = state.habits.map(h => ({ h, ...habitRange(h, R) })).filter(x => x.total);
    const cats = state.categories.map(c => {
      const rows = hstats.filter(x => x.h.cat === c.id);
      return { c, rows, done: rows.reduce((a, x) => a + x.done, 0), total: rows.reduce((a, x) => a + x.total, 0) };
    }).filter(x => x.total).sort((a, b) => b.done / b.total - a.done / a.total);

    const body = `<div class="card list" style="margin-top:16px">${cats.map(x => `
      <div class="brow">
        <span class="cn">${catIcon(x.c.id)}${esc(x.c.name)}</span>
        <span class="bar" style="--cc:${catColor(x.c.id)}"><b style="width:${pct(x.done, x.total)}%"></b></span>
        <span class="num">${x.done}/${x.total}</span>
        <span class="num strong">${pct(x.done, x.total)}%</span>
      </div>
      ${x.rows.map(r => `<div class="subrow"><span>${esc(r.h.name)}</span>
        <span class="num">${r.done}/${r.total}</span><span class="num">${pct(r.done, r.total)}%</span></div>`).join('')}
    `).join('')}</div>`;
    return pageHead('Stats', 'By category') + (state.habits.length ? rangeBar() + body : noHabits());
  }

  // Charts register their points here so the hover layer can read them back.
  let charts = {};

  // Single-series line (optionally with daily bars behind it), values in 0..1 or null for gaps.
  function lineChart(key, points, { small = false, bars = false } = {}) {
    const W = 600, H = 100;
    const n = points.length;
    const x = i => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const y = v => H - v * H;
    charts[key] = points;

    let line = '', area = '', seg = [];
    const flush = () => {
      if (!seg.length) return;
      line += 'M' + seg.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('L');
      area += `M${x(seg[0][0]).toFixed(1)},${H}L` + seg.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('L') +
        `L${x(seg[seg.length - 1][0]).toFixed(1)},${H}Z`;
      seg = [];
    };
    points.forEach((p, i) => { if (p.v == null) flush(); else seg.push([i, p.v]); });
    flush();

    let barsSvg = '';
    if (bars) {
      const bw = Math.max(1, (W / n) * 0.55);
      barsSvg = points.map((p, i) => p.day == null ? '' :
        `<rect class="dbar" x="${(x(i) - bw / 2).toFixed(1)}" y="${y(p.day).toFixed(1)}" width="${bw.toFixed(1)}" height="${(p.day * H).toFixed(1)}"/>`).join('');
    }

    const grid = small ? [0.5] : [0, 0.5, 1];
    return `
      <div class="plot ${small ? 'sm' : ''}" data-chart="${key}">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          ${grid.map(g => `<line class="grid" x1="0" x2="${W}" y1="${y(g)}" y2="${y(g)}" ${g === 0.5 && small ? 'stroke-dasharray="3 4"' : ''}/>`).join('')}
          ${bars ? barsSvg : `<path class="area" d="${area}"/>`}
          <path class="line" d="${line}"/>
        </svg>
        ${small ? '' : grid.map(g => `<span class="ylab" style="top:${(1 - g) * 100}%">${g * 100}</span>`).join('')}
        <div class="cross"></div><div class="hdot"></div><div class="tip"></div>
      </div>
      <div class="xlab"><span>${shortDate(points[0].d)}</span><span>Today</span></div>`;
  }

  function viewTrajectory() {
    if (!state.habits.length) return pageHead('Stats', 'Trajectory') + noHabits();
    charts = {};
    const t = today();
    const R = ui.range;
    const days = [];
    for (let i = R - 1; i >= 0; i--) days.push(addDays(t, -i));

    const totalPts = days.map(d => {
      const s = dayScore(d);
      return { d, v: rolling(state.habits, d), day: s.total ? s.done / s.total : null, done: s.done, total: s.total };
    });
    const last = [...totalPts].reverse().find(p => p.v != null);

    const delta = pts => {
      const vals = pts.filter(p => p.v != null);
      if (vals.length < 2) return '';
      const dpt = Math.round((vals[vals.length - 1].v - vals[0].v) * 100);
      return dpt === 0 ? 'Flat' : `${dpt > 0 ? '↑' : '↓'} ${Math.abs(dpt)} pts`;
    };

    const overall = `
      <div class="section-h"><h3>All habits</h3><span class="frac">${last ? Math.round(last.v * 100) + '% now · ' : ''}${delta(totalPts)}</span></div>
      <div class="card pad"><div class="legend2"><span><i class="sl"></i>7-day average</span><span><i class="sb"></i>Single day</span></div>
      <div class="chart">${lineChart('all', totalPts, { bars: true })}</div></div>`;

    const shown = state.categories.flatMap(c => state.habits.filter(h => h.cat === c.id))
      .filter(h => !h.archived || habitRange(h, R).total);
    const per = shown.map(h => {
      const pts = days.map(d => ({ d, v: rolling([h], d), done: isDone(h, d), due: due(h, d), skip: isSkipped(h, d) || isRest(d) || isPaused(h, d) }));
      const lv = [...pts].reverse().find(p => p.v != null);
      return `<div class="hchart">
        <header>
          <span class="nm">${esc(h.name)}<small>${esc(catName(h.cat))} · ${schedLabel(h)}${statusLabel(h) ? ' · ' + statusLabel(h) : ''}</small></span>
          <span class="rt">${lv ? Math.round(lv.v * 100) + '%' : '—'}<small>${delta(pts) || '&nbsp;'}</small></span>
        </header>
        ${lineChart(h.id, pts, { small: true })}
      </div>`;
    }).join('');

    return pageHead('Stats', 'Trajectory') + rangeBar() + overall +
      `<div class="section-h"><h3>Each habit</h3><span class="frac">7-day average</span></div>` + per +
      `<div class="foot">Lines show the share of due check-ins done over the previous 7 days. Today counts once it's ticked.</div>`;
  }

  function tipText(key, p) {
    const head = shortDate(p.d);
    if (key === 'all') {
      return `${head} · ${p.v == null ? '—' : Math.round(p.v * 100) + '% avg'}<br>${p.total ? `${p.done}/${p.total} that day` : 'Nothing due'}`;
    }
    const day = p.done ? 'Done' : p.skip ? 'Skipped / paused' : !p.due ? 'Not due' : p.d === today() ? 'Not yet' : 'Missed';
    return `${head} · ${p.v == null ? '—' : Math.round(p.v * 100) + '%'}<br>${day}`;
  }

  // ---- habits ----
  function editor(mode) {
    const f = ui.form;
    const h = mode === 'edit' && state.habits.find(x => x.id === ui.edit);
    const often = f.mode === 'weekly' ? `
        <div class="stepper">
          <button data-act="times" data-n="-1" aria-label="Fewer" ${f.times <= 1 ? 'disabled' : ''}>−</button>
          <span><b>${f.times}</b> ${f.times === 1 ? 'time' : 'times'} a week</span>
          <button data-act="times" data-n="1" aria-label="More" ${f.times >= 7 ? 'disabled' : ''}>+</button>
        </div>
        <p class="hint">Do it on any days you like. It only counts as missed when there aren’t enough days left in the week to reach the target.</p>` : `
        <div class="days">${weekOrder().map(i =>
          `<button class="${f.days.includes(i) ? 'on' : ''}" data-act="day" data-i="${i}" aria-pressed="${f.days.includes(i)}" aria-label="${DOW_LONG[i]}">${DOW1[i]}</button>`).join('')}</div>
        <div class="presets">
          <button data-act="preset" data-p="all">Every day</button>
          <button data-act="preset" data-p="wk">Weekdays</button>
          <button data-act="preset" data-p="we">Weekends</button>
        </div>`;

    // Changing the schedule of an existing habit starts from today unless you ask for the whole history.
    const scope = h && schedKey(f) !== schedKey(h) ? `
        <span class="lbl">Apply the new schedule</span>
        <div class="often">${segHtml('fscope', f.scope, [['today', 'From today'], ['all', 'To all history']])}</div>
        <p class="hint">${f.scope === 'all'
          ? 'Past days are recounted with the new schedule, so your stats and streak can change.'
          : 'Your past stats and streak stay as they were.'}</p>` : '';
    const since = `
        <div class="field">
          <span class="lbl">Tracking since</span>
          <input type="date" id="f-created" value="${esc(f.created)}" max="${today()}">
        </div>
        <p class="hint">Pick an earlier date to fill in days you already did. Days left unticked from then on count as missed.</p>`;

    const manage = h ? `
        <div class="actions">
          ${h.archived ? '<button class="btn" data-act="restore">Restore</button>'
            : `${openPause(h) ? '<button class="btn" data-act="resume">Resume</button>' : '<button class="btn" data-act="pause">Pause</button>'}
               <button class="btn" data-act="archive">Archive</button>`}
          <button class="btn ghost right" data-act="delHabit">Delete</button>
        </div>
        <p class="hint" style="margin-bottom:0">${h.archived
          ? `Archived on ${shortDate(h.archived)}. Its history still counts in your stats. Restore brings it back from today.`
          : openPause(h) ? `Paused since ${shortDate(openPause(h).from)}. Paused days don’t count as missed.`
          : 'Pause hides it until you resume, without counting missed days. Archive retires it but keeps its history in your stats.'}</p>` : '';

    return `
      <section class="editor">
        <div class="field">
          <span class="lbl">Name</span>
          <input type="text" id="f-name" placeholder="e.g. Walk 8,000 steps" value="${esc(f.name)}" maxlength="60" autocomplete="off">
        </div>
        <div class="field sel">
          <span class="lbl">Category</span>
          <select id="f-cat">${state.categories.map(c =>
            `<option value="${c.id}" ${c.id === f.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            <option value="__new" ${f.cat === '__new' ? 'selected' : ''}>+ New category…</option></select>
        </div>
        ${f.cat === '__new' ? `<div class="field">
          <span class="lbl">New category name</span>
          <input type="text" id="f-newcat" placeholder="e.g. Family" value="${esc(f.newCat)}" maxlength="24" autocomplete="off">
        </div>` : ''}
        <span class="lbl">How often</span>
        <div class="often">${segHtml('fmode', f.mode, [['days', 'On set days'], ['weekly', 'Times a week']])}</div>
        ${often}
        ${scope}
        ${since}
        <div class="actions">
          <button class="btn primary" data-act="saveHabit">${h ? 'Save changes' : 'Add habit'}</button>
          ${h ? '<button class="btn ghost" data-act="cancel">Cancel</button>' : ''}
        </div>
        ${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ''}
        ${ui.note ? `<div class="note">${ui.note}</div>` : ''}
        ${manage}
      </section>`;
  }

  function viewAdd() {
    return pageHead('Habits', 'Add new habit') + editor('add');
  }

  const itemRow = (h, sortable) => `
    <div class="item ${ui.edit === h.id ? 'editing' : ''}" ${sortable ? 'data-sort' : ''} data-id="${h.id}">
      ${sortable ? `<button class="handle" data-id="${h.id}" aria-label="Move ${esc(h.name)}. Use arrow keys or drag." title="Drag to reorder"></button>` : ''}
      <button class="iname" data-act="edit" data-id="${h.id}">
        <span class="name">${esc(h.name)}</span>
        <span class="sched">${ui.edit === h.id ? 'Editing' : statusLabel(h) || 'Edit →'}</span>
      </button>
    </div>`;

  function viewChange() {
    const editing = ui.edit && state.habits.find(h => h.id === ui.edit);
    const live = state.habits.filter(h => !h.archived);
    const list = state.categories.map(c => {
      const hs = live.filter(h => h.cat === c.id);
      if (!hs.length) return '';
      return `<section class="group">
        <header><h3>${catIcon(c.id)}${esc(c.name)}</h3><span class="frac">${hs.length}</span></header>
        <div class="sortlist" data-sort-kind="habits">${hs.map(h => itemRow(h, true)).join('')}</div>
      </section>`;
    }).join('');
    const archived = state.habits.filter(h => h.archived);
    const arch = archived.length ? `<section class="group">
        <header><h3>Archived</h3><span class="frac">${archived.length}</span></header>
        ${archived.map(h => itemRow(h, false)).join('')}
      </section>` : '';

    const counts = id => state.habits.filter(h => h.cat === id).length;
    const cats = `
      <div class="section-h"><h3>Categories</h3><span class="frac">Tap a name to rename it</span></div>
      <div class="card sortlist cats" data-sort-kind="cats">${state.categories.map(c => {
        const k = counts(c.id);
        if (ui.catEdit === c.id) {
          return `<div class="item renaming" data-sort data-id="${c.id}">
            <input type="text" id="c-rename" value="${esc(c.name)}" maxlength="24" autocomplete="off" aria-label="Category name">
            <button class="btn sm primary" data-act="catSave">Save</button>
            <button class="btn sm ghost" data-act="catCancel">Cancel</button>
          </div>`;
        }
        return `<div class="item" data-sort data-id="${c.id}">
          <button class="handle" data-id="${c.id}" aria-label="Move ${esc(c.name)}. Use arrow keys or drag." title="Drag to reorder"></button>
          <button class="iname static" data-act="catEdit" data-id="${c.id}" aria-label="Rename ${esc(c.name)}">${catIcon(c.id)}${esc(c.name)}</button>
          ${k ? `<span class="sched">${k}</span>` : `<button class="x" data-act="delCat" data-id="${c.id}" aria-label="Remove ${esc(c.name)}">×</button>`}
        </div>`;
      }).join('')}</div>
      <div class="addcat">
        <input type="text" id="c-name" placeholder="New category" maxlength="24" autocomplete="off">
        <button class="btn" data-act="addCat">Add</button>
      </div>`;

    const intro = editing ? editor('edit')
      : state.habits.length ? `<p class="summary">Pick a habit to edit, pause, archive or delete it. Drag the handles to change the order.</p>`
      : `<div class="empty"><p>No habits yet.</p><button data-view="habits" data-sub="add">Add your first habit →</button></div>`;
    return pageHead('Habits', 'Change current habits') + intro + list + arch + cats;
  }

  function viewList() {
    const live = state.habits.filter(h => !h.archived);
    if (!state.habits.length) {
      return pageHead('Habits', 'Your habits') +
        `<div class="empty"><p>No habits yet.</p><button data-view="habits" data-sub="add">Add your first habit →</button></div>`;
    }
    const t = today();
    const usedCats = new Set(live.map(h => h.cat)).size;
    const perWeek = live.filter(h => !isPaused(h, t)).reduce((a, h) => a + (h.mode === 'weekly' ? h.times : h.days.length), 0);
    const summary = `<p class="summary">${live.length} habits in ${usedCats} ${usedCats === 1 ? 'category' : 'categories'} · ${perWeek} check-ins planned per week</p>`;

    const row = h => {
      let strip = '';
      for (let i = 13; i >= 0; i--) {
        const d = addDays(t, -i);
        strip += `<i class="${isDone(h, d) ? 'on' : due(h, d) ? '' : 'na'}"></i>`;
      }
      const status = statusLabel(h);
      return `<button class="hrow" data-act="editFrom" data-id="${h.id}">
        <span class="nm">${esc(h.name)}<small>${schedLabel(h)} · since ${shortDate(h.created)}${status ? ' · ' + status : ''}</small></span>
        <span class="rt"><span class="strip" title="Last 14 days">${strip}</span>
          <span class="streak">${habitFire(h)}</span></span>
      </button>`;
    };

    const groups = state.categories.map(c => {
      const hs = live.filter(h => h.cat === c.id);
      if (!hs.length) return '';
      return `<section class="group">
        <header><h3>${catIcon(c.id)}${esc(c.name)}</h3><span class="frac">${hs.length}</span></header>
        ${hs.map(row).join('')}
      </section>`;
    }).join('');
    const archived = state.habits.filter(h => h.archived);
    const arch = archived.length ? `<section class="group archived">
        <header><h3>Archived</h3><span class="frac">${archived.length}</span></header>
        ${archived.map(row).join('')}
      </section>` : '';
    return pageHead('Habits', 'Your habits') + summary + groups + arch +
      `<div class="foot">Squares show the last 14 days: filled = done, grey = missed, outlined = not due (skipped, paused, rest day or not planned).</div>`;
  }

  // ---- notebook ----
  // A note: { id, title, body (markdown), created, updated, source: 'me' | 'ai', habits: [suggestion] | null }

  // Small, safe markdown renderer for notes: headings, lists, bold, italic, code, rules.
  function md(src) {
    const inline = s => s
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    let html = '', list = null;
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of esc(src || '').split('\n')) {
      const l = raw.trimEnd();
      let m;
      if (!l.trim()) { close(); continue; }
      if ((m = l.match(/^(#{1,4})\s+(.*)/))) { close(); const lv = Math.min(5, m[1].length + 2); html += `<h${lv}>${inline(m[2])}</h${lv}>`; continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { close(); html += '<hr>'; continue; }
      if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; continue; }
      close();
      html += `<p>${inline(l)}</p>`;
    }
    close();
    return html;
  }
  const noteTitle = n => n.title.trim() || plain(n.body).slice(0, 48) || 'Untitled note';
  const findNote = id => state.notes.find(n => n.id === id);

  function newNote(fields = {}) {
    const now = new Date().toISOString();
    const n = { id: uid(), title: '', body: '', created: now, updated: now, source: 'me', habits: null, ...fields };
    state.notes.unshift(n);
    save();
    return n;
  }
  // Leaving a note that was never written in removes it again.
  function leaveNote() {
    const n = findNote(ui.noteId);
    if (n && !n.title.trim() && !n.body.trim()) { state.notes = state.notes.filter(x => x !== n); save(); }
    ui.noteId = null;
    ui.noteEdit = false;
  }

  // Suggested habits saved with a note (from the old Ask Zuno), with one-tap add. `key` scopes the checkbox state.
  function suggestions(key, list, added) {
    if (!list || !list.length) return '';
    const existing = new Set(state.habits.map(h => h.name.trim().toLowerCase()));
    const sel = ui.sel[key] || (ui.sel[key] = list.map(h => !existing.has(h.name.toLowerCase())));
    const count = list.filter((h, i) => sel[i] && !existing.has(h.name.toLowerCase())).length;
    return `<div class="sugg">
      <div class="sugg-h"><b>Suggested habits</b><span class="frac">${list.length}</span></div>
      ${list.map((h, i) => {
        const have = existing.has(h.name.toLowerCase());
        return `<button class="sugg-row ${sel[i] && !have ? 'on' : ''} ${have ? 'have' : ''}" data-act="suggToggle" data-k="${key}" data-i="${i}" ${have || added ? 'disabled' : ''}>
          <span class="box"></span>
          <span class="nm">${esc(h.name)}<small>${esc(catName(h.cat))} · ${schedLabel(h)}${have ? ' · already in Zuno' : ''}</small></span>
        </button>`;
      }).join('')}
      <div class="sugg-f">${added
        ? '<span class="lbl">Added to your habits</span><button class="linkbtn" data-view="today" data-sub="day">Open Today →</button>'
        : `<button class="btn primary" data-act="suggAdd" data-k="${key}" ${count ? '' : 'disabled'}>Add ${count} ${count === 1 ? 'habit' : 'habits'}</button>`}</div>
    </div>`;
  }

  // A habit always belongs to a category that exists; one whose category was removed goes to "Other".
  function newHabit(fields, created) {
    let cat = fields.cat;
    if (!state.categories.some(c => c.id === cat)) {
      let c = state.categories.find(x => x.name.toLowerCase() === 'other');
      if (!c) state.categories.push(c = { id: 'other-' + uid().slice(0, 4), name: 'Other' });
      cat = c.id;
    }
    return { id: uid(), ...fields, cat, created,
      hist: [{ from: created, mode: fields.mode, days: [...fields.days], times: fields.times }], pauses: [], archived: null };
  }

  function addSuggested(key, list) {
    const sel = ui.sel[key] || [];
    const existing = new Set(state.habits.map(h => h.name.trim().toLowerCase()));
    let n = 0;
    list.forEach((h, i) => {
      if (!sel[i] || existing.has(h.name.toLowerCase())) return;
      state.habits.push(newHabit({ name: h.name, cat: h.cat, mode: h.mode, times: h.times, days: [...h.days] }, today()));
      n++;
    });
    return n;
  }

  function viewNotes() {
    if (ui.noteId && findNote(ui.noteId)) return viewNote(findNote(ui.noteId));
    const notes = [...state.notes].sort((a, b) => (a.updated < b.updated ? 1 : -1));
    const list = notes.length ? `<div class="notes">${notes.map(n => `
      <button class="note-card" data-act="openNote" data-id="${n.id}">
        <span class="nt">${esc(noteTitle(n))}</span>
        <span class="ns">${esc(plain(n.body).slice(0, 140)) || '&nbsp;'}</span>
        <span class="nm">${shortDate(n.updated.slice(0, 10))}${n.habits && n.habits.length ? ` · ${n.habits.length} habits` : ''}</span>
      </button>`).join('')}</div>`
      : `<div class="empty"><p>Your notebook is empty.</p>Write down meal ideas, workouts or thoughts.</div>`;
    return pageHead('Notebook', 'Notes') + `
      <div class="actions" style="margin-top:12px">
        <button class="btn primary" data-act="newNote">New note</button>
      </div>` + list;
  }

  function viewNote(n) {
    const back = `<button class="backlink" data-act="closeNote">← All notes</button>`;
    if (ui.noteEdit) {
      return back + `
        <section class="note-edit">
          <input type="text" id="n-title" class="n-title" placeholder="Title" value="${esc(n.title)}" maxlength="80" autocomplete="off">
          <textarea id="n-body" class="n-body" placeholder="Write here. Use # for headings and - for lists.">${esc(n.body)}</textarea>
          <div class="actions">
            <button class="btn primary" data-act="noteDone">Done</button>
            <button class="btn ghost right" data-act="delNote">Delete</button>
          </div>
        </section>`;
    }
    return back + `
      <article class="note-read">
        <h2>${esc(noteTitle(n))}</h2>
        <div class="nm">Edited ${shortDate(n.updated.slice(0, 10))}</div>
        <div class="md">${md(n.body) || '<p class="lbl">Empty note.</p>'}</div>
        ${suggestions('note-' + n.id, n.habits, n.added)}
        <div class="actions" style="margin-top:18px">
          <button class="btn" data-act="noteEdit">Edit</button>
          <button class="btn ghost right" data-act="delNote">Delete</button>
        </div>
      </article>`;
  }

  // ---- settings ----
  function viewSettings() {
    const s = state.settings;
    const theme = state.theme || 'light';
    const toggle = (k, title, sub) => `
      <button class="srow" data-act="setting" data-k="${k}" role="switch" aria-checked="${!!s[k]}">
        <span class="t">${title}<small>${sub}</small></span>
        <span class="sw ${s[k] ? 'on' : ''}">${s[k] ? 'On' : 'Off'}<i></i></span>
      </button>`;
    const action = (act, title, sub, cls = '') => `
      <button class="srow ${cls}" data-act="${act}">
        <span class="t">${title}<small>${sub}</small></span><span class="go">→</span>
      </button>`;

    const days = Object.keys(state.log).length;
    return `
      ${pageHead('Preferences', 'Settings')}

      <div class="section-h"><h3>Appearance</h3></div>
      <div class="card list">
        <div class="srow">
          <span class="t">Theme<small>Auto follows your device</small></span>
          ${segHtml('theme', theme, [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}
        </div>
        <div class="srow schemes-row">
          <span class="t">Color scheme<small>Category icons, progress and charts. The streak fire is always orange.</small></span>
        </div>
        <div class="schemes">${SCHEMES.map(([id, name, sub]) => `
          <button class="scheme ${s.scheme === id ? 'on' : ''}" data-act="scheme" data-v="${id}" data-scheme-preview="${id}" aria-pressed="${s.scheme === id}">
            <span class="swatch">${['red', 'orange', 'green', 'blue', 'purple'].map(c => `<i style="background:var(--c-${c})"></i>`).join('')}</span>
            <span class="nm">${name}<small>${sub}</small></span>
          </button>`).join('')}</div>
      </div>

      <div class="section-h"><h3>Calendar</h3></div>
      <div class="card list">
        <div class="srow">
          <span class="t">Week starts on<small>Week strip, weekly habits, past-week reports</small></span>
          ${segHtml('weekStart', s.weekStart, [['mon', 'Mon'], ['sun', 'Sun']])}
        </div>
      </div>

      <div class="section-h"><h3>Today screen</h3></div>
      <div class="card list">
        ${toggle('streaks', 'Show streaks', 'How many times in a row, next to each habit')}
        ${toggle('doneLast', 'Move finished habits down', 'Keeps what is left to do at the top')}
      </div>

      <div class="section-h"><h3>Data</h3><span class="frac">On this device</span></div>
      <div class="card list">
        ${action('export', 'Export backup', `Save everything as a file · ${state.backupAt ? 'last backup ' + shortDate(state.backupAt) : 'no backup yet'}`)}
        ${action('import', 'Import backup', 'Replace current data with a backup file')}
        ${action('sample', 'Load sample data', 'Nine example habits with five weeks of history')}
        ${action('erase', 'Erase everything', 'Remove all habits, history and notes', 'danger')}
      </div>

      <div class="foot">Zuno ${VERSION} · ${state.habits.length} habits · ${days} days logged · ${state.notes.length} notes<br>Your data stays on this device. Nothing is sent anywhere.</div>`;
  }

  // ---- about ----
  function viewAbout() {
    // Figure: a hand-ruled grid on the left giving way to counted squares on the right.
    const marks = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1];
    const fig = marks.map((m, i) => {
      const paper = (i % 14) < 7;
      return `<i class="${paper ? 'p' : 'd'} ${m ? 'x' : ''}"></i>`;
    }).join('');

    const points = [
      ['Memory flatters you',
        'Ask someone how often they read before bed and you get their best week, not their usual one. A daily record removes the editing. It doesn’t care how you felt about Tuesday.'],
      ['Small numbers add up',
        'Going from 3 of 7 to 4 of 7 doesn’t feel like much. Over a year it’s about fifty more days where you actually did the thing. You only notice that kind of change if something is keeping score.'],
      ['A streak is a reason',
        'On a bad evening, “I should stretch” is easy to ignore. “I’ve done this eleven days in a row” is harder. The count turns a loose intention into something you’d be annoyed to lose.'],
      ['Patterns hide in plain sight',
        'Maybe you never train on Thursdays. Maybe your diet slips in the same weeks your sleep does. Day to day you won’t see it. In twelve weeks of squares you can’t miss it.'],
    ];

    const rows = [
      ['With you when you travel', 'Sometimes', 'Always'],
      ['Adds up the month', 'By hand', 'Instantly'],
      ['Shows the long trend', 'Rarely', 'Every habit'],
      ['Survives a lost bag', 'No', 'With a backup'],
      ['Needs a new grid each month', 'Yes', 'No'],
    ];

    return `
      <article class="about">
        <section class="ab-hero">
          <span class="pill">Why keep count</span>
          <h2>A habit you don’t count <span>is a habit you’re guessing about.</span></h2>
          <p class="lede">Most people know roughly how their week went. Roughly is the problem. You remember the three mornings you ran and forget the four you didn’t. Counting fixes the memory, and after a while it starts to change the behaviour too.</p>
          <div class="ab-cta">
            <button class="btn primary" data-view="today">Open today</button>
            <button class="btn" data-view="stats">See your stats</button>
          </div>
        </section>

        <div class="card pad figure" aria-hidden="true">
          <div class="pen">${fig}</div>
          <div class="cap"><span>Pen and paper</span><span>Counted for you</span></div>
        </div>

        <div class="ab-grid">
          ${points.map(([h, p], i) => `<div class="card pad pt"><span class="no">0${i + 1}</span><h4>${h}</h4><p>${p}</p></div>`).join('')}
        </div>

        <p class="quote">You can’t steer <span>what you can’t see.</span></p>

        <div class="section-h"><h3>The notebook had a good run</h3></div>
        <div class="prose">
          <p>For a long time the tool for this was paper: a habit grid ruled by hand at the start of each month. It works, for a while. Then the notebook stays at home the week you travel. A page gets coffee on it. February needs a fresh grid and you never get round to drawing it.</p>
          <p>And when you want to know how this autumn compared with the last one, the answer is somewhere in a stack of filled notebooks you are never going to flip through.</p>
          <p>Paper is good at recording and bad at everything after that. It can’t total a month, draw a line through ninety days, or point out that Sport has quietly slipped to 40%. You could do that arithmetic yourself. Almost nobody does.</p>
        </div>

        <div class="card list vs">
          <div class="r h"><span></span><span>Notebook</span><span>Zuno</span></div>
          ${rows.map(([k, a, b]) => `<div class="r"><span>${k}</span><span class="c">${a}</span><span class="c y">${b}</span></div>`).join('')}
        </div>

        <div class="section-h"><h3>Digital isn’t about more screen time</h3></div>
        <div class="prose">
          <p>The point is not to spend longer on your phone. Zuno should take ten seconds: open it, tick what you did, close it. The phone just happens to be the one thing you carry everywhere, and it’s good at exactly the part paper never was: doing the sums and remembering all of it.</p>
          <p>Everything stays on your device. No account, no feed, nobody else looking at your numbers.</p>
        </div>

        <div class="closer">
          <p>So count. <span>Not to judge the day, just to see it clearly.</span></p>
          <button class="btn primary" data-view="today">Back to today →</button>
        </div>
      </article>`;
  }

  // ---- render ----
  const $view = document.getElementById('view');
  const $nav = document.getElementById('nav');
  const $file = document.getElementById('import-file');
  const meta = document.querySelector('meta[name="theme-color"]');
  const mq = matchMedia('(prefers-color-scheme: dark)');

  // No choice made means light; 'system' follows the device.
  function applyTheme() {
    const pref = state.theme || 'light';
    const t = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
    document.documentElement.dataset.theme = t;
    document.documentElement.dataset.scheme = state.settings.scheme || 'classic';
    meta.setAttribute('content', t === 'dark' ? '#000000' : '#ffffff');
  }

  const TABS = [
    { id: 'today', label: 'Progress', icon: '<circle cx="12" cy="12" r="8" opacity=".35"/><path d="M12 4a8 8 0 1 1-8 8"/>' },
    { id: 'stats', label: 'Stats', icon: '<path d="M5 20v-8M12 20V5M19 20v-5"/>' },
    { id: 'habits', label: 'Habits', icon: '<path d="M4 7.5l2 2 3.5-3.5M4 16.5l2 2 3.5-3.5M13 8h7M13 17h7"/>' },
    { id: 'notebook', label: 'Notebook', icon: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>' },
    { id: 'settings', label: 'Settings', icon: '<path d="M4 7h9M18 7h2M4 17h3M11 17h9"/><circle cx="15.5" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>' },
  ];
  const $subnav = document.getElementById('subnav');
  let subnavFor = null;

  // The tab bar is built once; renders only flip classes so its transitions can run.
  function buildNav() {
    $nav.innerHTML = `<div>${TABS.map(t => `
      <button class="tab" data-view="${t.id}" aria-label="${t.label}">
        <span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg></span>${t.label}
      </button>`).join('')}</div>`;
  }

  function renderNav() {
    $nav.querySelectorAll('.tab').forEach(b => {
      const on = b.dataset.view === ui.view;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.querySelector('.brand').classList.toggle('on', ui.view === 'about');

    // Pills for the current section's pages. Rebuilt (and animated in) only when the section changes.
    const sec = NAV.find(s => s.id === ui.view && s.subs);
    if (subnavFor !== ui.view) {
      subnavFor = ui.view;
      $subnav.innerHTML = sec ? `<div>${sec.subs.map(([id, full, short], i) =>
        `<button style="--i:${i}" data-view="${sec.id}" data-sub="${id}">
          <span class="full">${full}</span><span class="short">${short}</span></button>`).join('')}</div>` : '';
      $subnav.classList.toggle('open', !!sec);
      if (sec) {
        $subnav.classList.add('fresh');
        void $subnav.offsetWidth; // let the hidden state paint before animating in
        $subnav.classList.remove('fresh');
      }
    }
    $subnav.querySelectorAll('button').forEach(b => {
      const on = sec && ui.sub[sec.id] === b.dataset.sub;
      b.classList.toggle('on', !!on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  // Hairline under the top bar once the page scrolls under it.
  const $top = document.querySelector('.top');
  window.addEventListener('scroll', () => $top.classList.toggle('scrolled', window.scrollY > 4), { passive: true });

  const VIEWS = {
    today: { day: viewDay, week: () => viewReport('week'), month: () => viewReport('month') },
    settings: viewSettings,
    about: viewAbout,
    stats: { overview: viewOverview, byhabit: viewByHabit, bycat: viewByCat, trajectory: viewTrajectory },
    habits: { add: viewAdd, change: viewChange, list: viewList },
    notebook: viewNotes,
  };
  function draw() {
    renderNav();
    const v = VIEWS[ui.view];
    const warn = saveFailed ? `<div class="alert">Zuno couldn’t save your last change. This device’s storage may be full or blocked.
      <button data-act="export">Back up your data now</button></div>` : '';
    $view.innerHTML = warn + (typeof v === 'function' ? v() : v[ui.sub[ui.view]]());
    $view.querySelectorAll('textarea').forEach(autosize);
    ui.pop = null;
  }
  // If a page can't be drawn, say so and offer a way out instead of leaving a blank screen.
  function render() {
    try { draw(); } catch (e) {
      console.error(e);
      $view.innerHTML = `<div class="empty crash"><p>Zuno hit a problem showing this page.</p>
        Your data is still saved on this device. Save a copy first, then reload.
        <div class="actions">
          <button class="btn primary" data-act="rescue">Save a copy of my data</button>
          <button class="btn" data-act="reload">Reload</button>
          <button class="btn ghost" data-act="erase">Erase and start fresh</button>
        </div></div>`;
    }
  }

  // A short message above the tab bar, with Undo when the last change can be taken back.
  const $toast = document.createElement('div');
  $toast.className = 'toast';
  $toast.setAttribute('role', 'status');
  document.body.append($toast);
  let toastTimer = null;
  let undoSnap = null; // the saved data as it was before the change
  function toast(msg, snap) {
    undoSnap = snap || null;
    $toast.innerHTML = `<span>${esc(msg)}</span>${snap ? '<button data-act="undo">Undo</button>' : ''}`;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, snap ? 8000 : 3500);
  }
  function hideToast() {
    $toast.classList.remove('show');
    undoSnap = null;
  }

  // On phones the share sheet can put the file in Files or iCloud Drive; elsewhere it downloads.
  async function saveFile(text, name) {
    const file = new File([text], name, { type: 'application/json' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return true; }
      catch (e) { if (e.name === 'AbortError') return false; } // anything else: fall back to a download
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  }
  async function exportBackup() {
    if (!(await saveFile(JSON.stringify(state, null, 2), `zuno-${today()}.json`))) return;
    state.backupAt = today();
    state.backupSnooze = null;
    save();
    render();
    toast('Backup saved');
  }

  function autosize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }

  function go(view, sub) {
    if (sub) ui.sub[view] = sub;
    const changed = ui.view !== view || sub;
    if ((changed || view === 'notebook') && ui.noteId) leaveNote();
    ui.view = view;
    ui.note = '';
    if (changed) resetForm();
    render();
    window.scrollTo(0, 0);
    if (changed) { $view.classList.remove('enter'); void $view.offsetWidth; $view.classList.add('enter'); }
  }

  function resetForm() {
    ui.edit = null;
    ui.catEdit = null;
    ui.err = '';
    const cat = ui.form.cat === '__new' || !state.categories.some(c => c.id === ui.form.cat)
      ? (state.categories[0] || {}).id : ui.form.cat;
    ui.form = { name: '', cat, days: [...ALL_DAYS], newCat: '', mode: 'days', times: 3, created: today(), scope: 'today' };
  }

  function startEdit(id) {
    const h = state.habits.find(x => x.id === id);
    if (!h) return;
    ui.edit = h.id; ui.err = ''; ui.note = '';
    ui.form = { name: h.name, cat: h.cat, days: [...h.days], newCat: '', mode: h.mode, times: h.times, created: h.created, scope: 'today' };
  }

  function saveHabit() {
    const f = ui.form;
    const name = f.name.trim();
    if (!name) { ui.err = 'Give the habit a name'; return; }
    if (f.mode === 'days' && !f.days.length) { ui.err = 'Pick at least one day'; return; }
    let cat = f.cat;
    if (cat === '__new') {
      const cname = f.newCat.trim();
      if (!cname) { ui.err = 'Name the new category'; return; }
      const existing = state.categories.find(c => c.name.toLowerCase() === cname.toLowerCase());
      if (existing) cat = existing.id;
      else {
        cat = cname.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + uid().slice(0, 4);
        state.categories.push({ id: cat, name: cname });
      }
    }
    const fields = { name, cat, mode: f.mode, times: f.times, days: f.mode === 'weekly' ? [...ALL_DAYS] : [...f.days].sort() };
    const created = isDate(f.created) && f.created <= today() ? f.created : today();
    const h = ui.edit && state.habits.find(x => x.id === ui.edit);
    if (h) {
      if (schedKey(fields) !== schedKey(h)) {
        const entry = { mode: fields.mode, days: [...fields.days], times: fields.times };
        const last = h.hist[h.hist.length - 1];
        if (f.scope === 'all') h.hist = [{ from: created, ...entry }];
        else if (last.from >= today()) Object.assign(last, entry);
        else h.hist.push({ from: today(), ...entry });
      }
      Object.assign(h, fields, { created });
      save(); resetForm();
      ui.note = '';
    } else {
      state.habits.push(newHabit(fields, created));
      save();
      ui.form.cat = cat;
      resetForm();
      ui.note = `Added “${esc(name)}” · <button data-view="habits" data-sub="list">See your habits</button>`;
    }
  }

  function pauseHabit(h) {
    if (!openPause(h)) h.pauses.push({ from: today(), to: null });
  }
  function resumeHabit(h) {
    const p = openPause(h);
    if (!p) return;
    if (p.from >= today()) h.pauses.splice(h.pauses.indexOf(p), 1);
    else p.to = addDays(today(), -1);
  }

  function replaceState(next) {
    state = next; save();
    ui.form.cat = (state.categories[0] || {}).id;
    resetForm();
    ui.date = today();
    applyTheme();
  }

  function toggleIn(map, d, id, on) {
    const list = map[d] || (map[d] = []);
    const i = list.indexOf(id);
    if (on && i < 0) list.push(id);
    if (!on && i >= 0) list.splice(i, 1);
    if (!list.length) delete map[d];
  }

  // Put the items named by ids into the slots those items already occupy, so other items keep their places.
  function reorder(arr, ids) {
    const set = new Set(ids);
    const slots = [];
    arr.forEach((x, i) => { if (set.has(x.id)) slots.push(i); });
    const byId = new Map(arr.map(x => [x.id, x]));
    const out = [...arr];
    slots.forEach((slot, k) => { out[slot] = byId.get(ids[k]); });
    return out;
  }
  function commitOrder(list) {
    const ids = [...list.querySelectorAll(':scope > [data-sort]')].map(el => el.dataset.id);
    if (list.dataset.sortKind === 'cats') state.categories = reorder(state.categories, ids);
    else state.habits = reorder(state.habits, ids);
    save();
    render();
  }

  // ---- events ----
  document.addEventListener('click', e => {
    if (e.target.id === 'jump') { try { e.target.showPicker(); } catch (err) { /* opens by itself */ } return; }
    const b = e.target.closest('[data-act], [data-view]');
    if (!b || b.disabled) return;

    if (b.dataset.view) {
      const v = b.dataset.view;
      // Opening a section lands on the sub-section you last used in it.
      if (!b.dataset.sub && v === ui.view && NAV.find(s => s.id === v && s.subs)) return;
      go(v, b.dataset.sub);
      return;
    }

    // Undo covers one step: once you do something else, the earlier change stays.
    if (undoSnap && b.dataset.act !== 'undo') hideToast();

    const id = b.dataset.id;
    const editing = () => state.habits.find(x => x.id === ui.edit);
    switch (b.dataset.act) {
      case 'toggle': {
        const d = ui.date;
        const on = !(state.log[d] || []).includes(id);
        toggleIn(state.log, d, id, on);
        if (on) { toggleIn(state.skips, d, id, false); ui.pop = id; }
        save();
        break;
      }
      case 'skip': {
        const d = ui.date;
        toggleIn(state.skips, d, id, !(state.skips[d] || []).includes(id));
        save();
        break;
      }
      case 'rest':
        if (state.rest[ui.date]) delete state.rest[ui.date]; else state.rest[ui.date] = true;
        save();
        break;
      case 'shift': {
        const d = addDays(ui.date, Number(b.dataset.n));
        if (d <= today()) ui.date = d;
        break;
      }
      case 'date': ui.date = b.dataset.date; break;
      case 'openDay':
        if (b.dataset.date > today()) return;
        ui.date = b.dataset.date; go('today', 'day'); return;
      case 'fscope': ui.form.scope = b.dataset.v; break;
      case 'range': ui.range = Number(b.dataset.v); break;
      case 'rep': ui.rep[b.dataset.k] = Math.max(0, ui.rep[b.dataset.k] + Number(b.dataset.n)); break;
      case 'fmode': ui.form.mode = b.dataset.v; ui.err = ''; break;
      case 'times': ui.form.times = Math.min(7, Math.max(1, ui.form.times + Number(b.dataset.n))); break;
      case 'day': {
        const i = Number(b.dataset.i);
        const days = ui.form.days;
        ui.form.days = days.includes(i) ? days.filter(x => x !== i) : [...days, i];
        ui.err = '';
        break;
      }
      case 'preset':
        ui.form.days = { all: [...ALL_DAYS], wk: [0, 1, 2, 3, 4], we: [5, 6] }[b.dataset.p];
        break;
      case 'saveHabit': saveHabit(); break;
      case 'cancel': resetForm(); break;
      case 'edit':
        startEdit(id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'editFrom':
        ui.view = 'habits'; ui.sub.habits = 'change';
        startEdit(id);
        window.scrollTo(0, 0);
        break;
      case 'pause': { const h = editing(); if (h) { pauseHabit(h); save(); } break; }
      case 'resume': { const h = editing(); if (h) { resumeHabit(h); save(); } break; }
      case 'archive': {
        const h = editing();
        if (!h) break;
        const snap = JSON.stringify(state);
        pauseHabit(h);
        h.archived = today();
        save(); resetForm();
        toast(`Archived “${h.name}”`, snap);
        break;
      }
      case 'restore': {
        const h = editing();
        if (!h) break;
        h.archived = null;
        resumeHabit(h);
        save();
        break;
      }
      case 'delHabit': {
        const h = editing();
        if (!h) return;
        const snap = JSON.stringify(state);
        state.habits = state.habits.filter(x => x.id !== h.id);
        for (const map of [state.log, state.skips]) {
          for (const d of Object.keys(map)) toggleIn(map, d, h.id, false);
        }
        save(); resetForm();
        toast(`Deleted “${h.name}” and its history`, snap);
        break;
      }
      case 'addCat': {
        const input = document.getElementById('c-name');
        const name = input.value.trim();
        if (!name) return;
        if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) { input.value = ''; return; }
        const cid = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + uid().slice(0, 4);
        state.categories.push({ id: cid, name });
        save();
        break;
      }
      case 'delCat': {
        const snap = JSON.stringify(state);
        const name = catName(id);
        state.categories = state.categories.filter(c => c.id !== id);
        if (ui.form.cat === id) ui.form.cat = (state.categories[0] || {}).id;
        save();
        toast(`Removed ${name}`, snap);
        break;
      }
      case 'catEdit': {
        ui.catEdit = id;
        render();
        const input = document.getElementById('c-rename');
        if (input) { input.focus(); input.select(); }
        return;
      }
      case 'catCancel': ui.catEdit = null; break;
      case 'catSave': {
        const c = state.categories.find(x => x.id === ui.catEdit);
        const name = document.getElementById('c-rename').value.trim().slice(0, 24);
        if (c && name && state.categories.some(x => x !== c && x.name.toLowerCase() === name.toLowerCase())) {
          toast('Another category already has that name');
          return;
        }
        if (c && name) { c.name = name; save(); }
        ui.catEdit = null;
        break;
      }

      // settings
      case 'theme':
        state.theme = b.dataset.v;
        save(); applyTheme();
        break;
      case 'scheme':
        state.settings.scheme = b.dataset.v; save(); applyTheme();
        break;
      case 'weekStart':
        state.settings.weekStart = b.dataset.v; save();
        break;
      case 'setting':
        state.settings[b.dataset.k] = !state.settings[b.dataset.k]; save();
        break;
      case 'export': exportBackup(); return;
      case 'snooze': state.backupSnooze = addDays(today(), 7); save(); break;
      case 'rescue': {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (err) { /* storage blocked */ }
        saveFile(raw || JSON.stringify(state), `zuno-copy-${today()}.json`);
        return;
      }
      case 'reload': location.reload(); return;
      case 'undo':
        if (!undoSnap) return;
        state = JSON.parse(undoSnap);
        save(); hideToast(); resetForm(); applyTheme();
        break;
      case 'import': $file.value = ''; $file.click(); return;
      case 'sample': {
        if (state.habits.length && !confirm('Replace your current habits and history with sample data?')) return;
        const snap = JSON.stringify(state);
        replaceState(sanitize({ ...seed(), theme: state.theme, settings: state.settings, notes: state.notes,
          backupAt: state.backupAt, backupSnooze: state.backupSnooze }));
        toast('Sample data loaded', snap);
        break;
      }
      // notebook
      case 'newNote': {
        const n = newNote();
        ui.noteId = n.id; ui.noteEdit = true;
        render();
        document.getElementById('n-title').focus();
        return;
      }
      case 'openNote':
        if (ui.view !== 'notebook') go('notebook');
        ui.noteId = id; ui.noteEdit = false;
        window.scrollTo(0, 0);
        break;
      case 'closeNote': leaveNote(); break;
      case 'noteEdit': ui.noteEdit = true; break;
      case 'noteDone': {
        const n = findNote(ui.noteId);
        if (n && !n.title.trim() && !n.body.trim()) leaveNote(); else ui.noteEdit = false;
        save();
        break;
      }
      case 'delNote': {
        const snap = JSON.stringify(state);
        state.notes = state.notes.filter(n => n.id !== ui.noteId);
        ui.noteId = null; ui.noteEdit = false;
        save();
        toast('Note deleted', snap);
        break;
      }
      case 'suggToggle': {
        const sel = ui.sel[b.dataset.k];
        if (sel) sel[Number(b.dataset.i)] = !sel[Number(b.dataset.i)];
        break;
      }
      case 'suggAdd': {
        const k = b.dataset.k;
        const owner = findNote(k.slice(5));
        if (!owner || !owner.habits) break;
        const n = addSuggested(k, owner.habits);
        if (n) owner.added = true;
        save();
        break;
      }
      case 'erase': {
        if (!confirm('Erase all habits, history and notes on this device?')) return;
        const snap = JSON.stringify(state);
        replaceState(blank());
        toast('Everything erased', snap);
        break;
      }
      default: return;
    }
    render();
  });

  // Drag to reorder: grab a handle, rows swap as you pass their midpoints, the order is saved on release.
  let drag = null;
  document.addEventListener('pointerdown', e => {
    const handle = e.target.closest && e.target.closest('.handle');
    const item = handle && handle.closest('[data-sort]');
    if (!item) return;
    e.preventDefault();
    drag = { item, list: item.parentElement, y: e.clientY, moved: false };
    item.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    const { item, list } = drag;
    const prev = item.previousElementSibling;
    const next = item.nextElementSibling;
    if (prev && prev.matches('[data-sort]')) {
      const r = prev.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { list.insertBefore(item, prev); drag.y -= r.height; drag.moved = true; }
    }
    if (next && next.matches('[data-sort]')) {
      const r = next.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) { list.insertBefore(next, item); drag.y += r.height; drag.moved = true; }
    }
    item.style.translate = `0 ${e.clientY - drag.y}px`;
  });
  const endDrag = () => {
    if (!drag) return;
    const { item, list, moved } = drag;
    drag = null;
    item.style.translate = '';
    item.classList.remove('dragging');
    if (moved) commitOrder(list);
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  // Chart hover: crosshair, point marker and a small readout.
  function hoverChart(plot, clientX) {
    const pts = charts[plot.dataset.chart];
    if (!pts) return;
    const r = plot.getBoundingClientRect();
    const n = pts.length;
    const i = Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1))));
    const p = pts[i];
    const xp = n === 1 ? 50 : (i / (n - 1)) * 100;
    plot.classList.add('hover');
    plot.querySelector('.cross').style.left = xp + '%';
    const dot = plot.querySelector('.hdot');
    dot.classList.toggle('has', p.v != null);
    if (p.v != null) { dot.style.left = xp + '%'; dot.style.top = (1 - p.v) * 100 + '%'; }
    const tip = plot.querySelector('.tip');
    tip.innerHTML = tipText(plot.dataset.chart, p);
    tip.style.left = xp + '%';
    tip.style.transform = `translate(${xp < 20 ? '0' : xp > 80 ? '-100%' : '-50%'}, -100%)`;
  }
  document.addEventListener('pointermove', e => {
    if (drag) return;
    const plot = e.target.closest && e.target.closest('.plot');
    document.querySelectorAll('.plot.hover').forEach(p => { if (p !== plot) p.classList.remove('hover'); });
    if (plot) hoverChart(plot, e.clientX);
  });
  document.addEventListener('pointerdown', e => {
    const plot = e.target.closest && e.target.closest('.plot');
    if (plot) hoverChart(plot, e.clientX);
  });
  document.addEventListener('pointerleave', () => {
    document.querySelectorAll('.plot.hover').forEach(p => p.classList.remove('hover'));
  });

  $file.addEventListener('change', () => {
    const file = $file.files[0];
    if (!file) return;
    file.text().then(text => {
      let next;
      try { next = JSON.parse(text); } catch (e) { next = null; }
      try { next = valid(next) ? sanitize(next) : null; } catch (e) { next = null; }
      if (!next) { toast('That file is not a Zuno backup'); return; }
      if (!confirm(`Replace current data with ${next.habits.length} habits from “${file.name}”?`)) return;
      const snap = JSON.stringify(state);
      next.backupAt = today(); // this data came from a file, so a copy of it exists
      replaceState(next);
      render();
      toast('Backup imported', snap);
    });
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'f-name') { ui.form.name = e.target.value; ui.err = ''; }
    if (e.target.id === 'f-newcat') { ui.form.newCat = e.target.value; ui.err = ''; }
    if (e.target.id === 'f-created') ui.form.created = e.target.value;
    if (e.target.id === 'n-title' || e.target.id === 'n-body') {
      const n = findNote(ui.noteId);
      if (!n) return;
      n[e.target.id === 'n-title' ? 'title' : 'body'] = e.target.value;
      n.updated = new Date().toISOString();
      clearTimeout(noteTimer);
      noteTimer = setTimeout(save, 400);
    }
    if (e.target.tagName === 'TEXTAREA') autosize(e.target);
  });
  let noteTimer = null;
  document.addEventListener('change', e => {
    if (e.target.id === 'f-created') ui.form.created = e.target.value;
    if (e.target.id === 'jump') {
      const v = e.target.value;
      if (isDate(v) && v <= today()) { ui.date = v; render(); }
    }
    if (e.target.id === 'f-cat') {
      ui.form.cat = e.target.value;
      render();
      if (ui.form.cat === '__new') document.getElementById('f-newcat').focus();
    }
  });
  document.addEventListener('keydown', e => {
    // Keyboard reordering on a focused handle.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target.classList && e.target.classList.contains('handle')) {
      e.preventDefault();
      const item = e.target.closest('[data-sort]');
      const sib = e.key === 'ArrowUp' ? item.previousElementSibling : item.nextElementSibling;
      if (!sib || !sib.matches('[data-sort]')) return;
      const list = item.parentElement;
      if (e.key === 'ArrowUp') list.insertBefore(item, sib); else list.insertBefore(sib, item);
      const hid = e.target.dataset.id;
      commitOrder(list);
      const again = document.querySelector(`.handle[data-id="${hid}"]`);
      if (again) again.focus();
      return;
    }
    if (e.key === 'Escape' && e.target.id === 'c-rename') { ui.catEdit = null; render(); return; }
    if (e.key !== 'Enter') return;
    if (e.target.id === 'c-rename') { document.querySelector('[data-act="catSave"]').click(); return; }
    if (e.target.id === 'n-title') { e.preventDefault(); document.getElementById('n-body').focus(); return; }
    if (e.target.id === 'f-name' || e.target.id === 'f-newcat') { saveHabit(); render(); }
    if (e.target.id === 'c-name') document.querySelector('[data-act="addCat"]').click();
  });

  // Roll over to the new day if the app was left open past midnight; reports move on with it.
  let lastToday = today();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const t = today();
    if (t !== lastToday) { if (ui.date === lastToday) ui.date = t; lastToday = t; render(); }
  });
  mq.addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });

  applyTheme();
  buildNav();
  render();
})();
