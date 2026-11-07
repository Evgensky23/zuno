(() => {
  'use strict';

  const KEY = 'zuno.v1';
  const OLD_KEY = 'tally.v1'; // data saved before the rename
  const VERSION = '0.7';
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DOW1 = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  const DEFAULT_SETTINGS = { weekStart: 'mon', streaks: true, doneLast: false, aiStats: false };

  // Left rail: sections and their sub-sections ([id, full label, short label for the narrow rail]).
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
    { id: 'notebook', label: 'Notebook', subs: [
      ['notes', 'Notes', 'Notes'],
      ['ask', 'Ask Zuno', 'Ask Zuno'],
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

  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const DEFAULT_CATS = ['Sport', 'Health', 'Diet', 'Education', 'Religion', 'Mind', 'Sleep', 'Work', 'Social', 'Finance']
    .map(name => ({ id: name.toLowerCase(), name }));

  // ---- state ----
  // A habit: { id, name, cat, created, mode: 'days' | 'weekly', days: [0..6], times, pauses: [{from, to}], archived }
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
      notes: [], chat: { items: [] } };
  }
  const blank = () => ({ ...empty(), theme: state.theme, settings: state.settings });

  const valid = s => s && s.v === 1 && Array.isArray(s.habits) && Array.isArray(s.categories) && s.log && typeof s.log === 'object';
  const normalize = s => ({
    ...s,
    settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
    skips: s.skips || {},
    rest: s.rest || {},
    notes: Array.isArray(s.notes) ? s.notes : [],
    chat: s.chat && Array.isArray(s.chat.items) ? s.chat : { items: [] },
    habits: s.habits.map(h => ({ mode: 'days', times: 3, pauses: [], archived: null, ...h })),
  });

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY));
      if (valid(s)) return normalize(s);
    } catch (e) { /* fall through */ }
    return empty(); // first launch starts clean; sample data is one tap away in Settings
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  let state = load();
  save();

  const ui = {
    view: 'today',
    sub: { today: 'day', stats: 'overview', habits: 'add', notebook: 'notes' },
    date: today(),
    range: 30,
    rep: { week: 0, month: 0 },
    edit: null,
    form: { name: '', cat: 'sport', days: [...ALL_DAYS], newCat: '', mode: 'days', times: 3 },
    err: '',
    note: '',
    pop: null,
    noteId: null,
    noteEdit: false,
    sel: {},
    ai: { busy: false, text: '', err: '' },
    draft: '',
    keyEdit: false,
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

  // Shown on the day's list.
  const listed = (h, d) => h.created <= d && !isPaused(h, d) && (h.mode === 'weekly' || h.days.includes(dow(d)));
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
    if (h.mode !== 'weekly') return true;
    const start = weekStartOf(d);
    let before = 0;
    for (let x = start; x < d; x = addDays(x, 1)) if (isDone(h, x)) before++;
    const need = h.times - before;
    if (need <= 0) return false;
    let left = 0;
    for (let x = d, end = addDays(start, 6); x <= end; x = addDays(x, 1)) if (open(h, x)) left++;
    return need >= left;
  }

  function dayScore(d) {
    const hs = state.habits.filter(h => due(h, d));
    return { done: hs.filter(h => isDone(h, d)).length, total: hs.length };
  }

  // Streaks: days in a row for day habits, weeks in a row for weekly ones.
  // Skipped, rest and paused days neither add to a streak nor break it.
  function streaks(h) {
    const t = today();
    if (h.mode === 'weekly') {
      const status = [];
      const cur = weekStartOf(t);
      for (let w = weekStartOf(h.created); w <= cur; w = addDays(w, 7)) {
        let cnt = 0, avail = 0;
        for (let i = 0; i < 7; i++) {
          const x = addDays(w, i);
          if (x < h.created || !listed(h, x)) continue;
          if (isDone(h, x)) cnt++;
          if (x > t || open(h, x)) avail++;
        }
        const target = Math.min(h.times, Math.max(avail, cnt));
        status.push(!target ? 'skip' : cnt >= target ? 'met' : w === cur ? 'skip' : 'fail');
      }
      let now = 0, best = 0, run = 0;
      for (const s of status) { if (s === 'met') best = Math.max(best, ++run); else if (s === 'fail') run = 0; }
      for (let i = status.length - 1; i >= 0; i--) { if (status[i] === 'met') now++; else if (status[i] === 'fail') break; }
      return { now, best, unit: 'w' };
    }
    let d = t;
    if (!isDone(h, d)) d = addDays(d, -1); // today isn't over yet
    let now = 0;
    for (let i = 0; i < 3660 && d >= h.created; i++, d = addDays(d, -1)) {
      if (!due(h, d)) continue;
      if (isDone(h, d)) now++; else break;
    }
    let best = 0, run = 0;
    for (let x = h.created; x <= t; x = addDays(x, 1)) {
      if (!due(h, x)) continue;
      if (isDone(h, x)) best = Math.max(best, ++run);
      else if (x !== t) run = 0;
    }
    return { now, best, unit: 'd' };
  }
  const streakText = s => (s.unit === 'w' ? `${s.now} ${s.now === 1 ? 'week' : 'weeks'} in a row` : `${s.now} in a row`);

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
            <span class="v">${dd.getDate()} ${MONTHS[dd.getMonth()]} ${dd.getFullYear() !== new Date().getFullYear() ? dd.getFullYear() : ''}</span>
          </div>
          <div class="arrows">
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
      const weekly = h.mode === 'weekly';
      const wk = weekly ? weekCount(h, d) : 0;
      const met = weekly && !done && wk >= h.times;
      let meta = '';
      if (skipped) meta = 'Skipped';
      else if (weekly) meta = met ? 'Done for the week' : `${wk}/${h.times} this week`;
      else if (showStreaks) { const s = streaks(h); if (s.now > 1) meta = streakText(s); }
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
        <header><h3>${esc(c.name)}</h3><span class="frac">${k}/${due_}</span></header>
        ${list.map(row).join('')}
      </section>`;
    }).join('');

    return hero + week + groups;
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
        <div class="wb" title="${tip(p)}">
          <span class="wv">${isRest(p.d) ? 'Rest' : p.total ? `${p.done}/${p.total}` : '–'}</span>
          <span class="wt"><b style="height:${p.total ? (p.done / p.total) * 100 : 0}%"></b></span>
          <span class="wl">${DOW1[dow(p.d)]}<br>${parse(p.d).getDate()}</span>
        </div>`).join('')}</div></div>`;
    } else {
      const lead = (dow(b.from) - ws() + 7) % 7;
      const cells = '<i class="pad"></i>'.repeat(lead) + cur.perDay.map(p => {
        const l = lvl(p);
        return `<i class="l${l} ${l >= 3 ? 'dk' : ''} ${isRest(p.d) ? 'rest' : ''}" title="${tip(p)}"><span>${parse(p.d).getDate()}</span></i>`;
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
        <span>${esc(x.c.name)}</span>
        <span class="bar"><b style="width:${pct(x.done, x.total)}%"></b></span>
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
      cells += `<i class="${lvl ? 'l' + lvl : ''} ${d === t ? 'now' : ''}" title="${shortDate(d)} · ${s.done}/${s.total}"></i>`;
    }
    const heat = `
      <div class="section-h"><h3>Twelve weeks</h3><span class="frac">Each square is a day</span></div>
      <div class="card pad"><div class="heatwrap">
        <div class="heatdays">${weekOrder().map((w, i) => `<span>${i % 2 === 0 ? DOW1[w] : ''}</span>`).join('')}</div>
        <div class="heat">${cells}</div>
      </div>
      <div class="legend"><span>Less</span><i style="background:var(--l0)"></i><i style="background:var(--l1)"></i><i style="background:var(--l2)"></i><i style="background:var(--l3)"></i><i style="background:var(--l4)"></i><span>More</span></div></div>`;

    return pageHead('Stats', 'Overview') + (state.habits.length ? rangeBar() + big + heat : noHabits());
  }

  function viewByHabit() {
    const R = ui.range;
    const rows = state.habits.map(h => ({ h, ...habitRange(h, R), s: streaks(h) }))
      .filter(x => x.total || !x.h.archived)
      .sort((a, b) => pct(b.done, b.total) - pct(a.done, a.total));
    const u = s => (s.unit === 'w' ? 'w' : '');
    const body = `
      <div class="card list" style="margin-top:16px"><div class="trow head"><span></span><span class="th">Rate</span><span class="th">Now</span><span class="th">Best</span></div>
      ${rows.map(x => `<div class="trow">
        <span class="nm">${esc(x.h.name)}<small>${esc(catName(x.h.cat))} · ${x.done}/${x.total}${statusLabel(x.h) ? ' · ' + statusLabel(x.h) : ''}</small>
          <span class="mbar"><b style="width:${pct(x.done, x.total)}%"></b></span></span>
        <span class="num strong">${x.total ? pct(x.done, x.total) + '%' : '—'}</span>
        <span class="num">${x.s.now}${u(x.s)}</span>
        <span class="num">${x.s.best}${u(x.s)}</span>
      </div>`).join('')}
      </div><div class="foot">Now = current streak · Best = longest streak ever · w = weeks, for weekly habits</div>`;
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
        <span>${esc(x.c.name)}</span>
        <span class="bar"><b style="width:${pct(x.done, x.total)}%"></b></span>
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
        <header><h3>${esc(c.name)}</h3><span class="frac">${hs.length}</span></header>
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
      <div class="section-h"><h3>Categories</h3><span class="frac">Drag to reorder</span></div>
      <div class="card sortlist cats" data-sort-kind="cats">${state.categories.map(c => {
        const k = counts(c.id);
        return `<div class="item" data-sort data-id="${c.id}">
          <button class="handle" data-id="${c.id}" aria-label="Move ${esc(c.name)}. Use arrow keys or drag." title="Drag to reorder"></button>
          <span class="iname static">${esc(c.name)}</span>
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
      const s = streaks(h);
      const status = statusLabel(h);
      return `<button class="hrow" data-act="editFrom" data-id="${h.id}">
        <span class="nm">${esc(h.name)}<small>${schedLabel(h)} · since ${shortDate(h.created)}${status ? ' · ' + status : ''}</small></span>
        <span class="rt"><span class="strip" title="Last 14 days">${strip}</span>
          <span class="streak">${s.now ? streakText(s) : 'No streak'}</span></span>
      </button>`;
    };

    const groups = state.categories.map(c => {
      const hs = live.filter(h => h.cat === c.id);
      if (!hs.length) return '';
      return `<section class="group">
        <header><h3>${esc(c.name)}</h3><span class="frac">${hs.length}</span></header>
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

  // Small, safe markdown renderer for notes and AI replies: headings, lists, bold, italic, code, rules.
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
  // Markdown to one line of plain text: drop heading/list markers and emphasis, keep hyphens inside words.
  const plain = s => (s || '').replace(/^\s*(#{1,6}|[-*•]|\d+[.)])\s+/gm, '').replace(/[*`>_]+/g, '').replace(/\s+/g, ' ').trim();
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

  // Suggested habits (from the AI) with one-tap add. `key` scopes the checkbox state.
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

  function addSuggested(key, list) {
    const sel = ui.sel[key] || [];
    const existing = new Set(state.habits.map(h => h.name.trim().toLowerCase()));
    let n = 0;
    list.forEach((h, i) => {
      if (!sel[i] || existing.has(h.name.toLowerCase())) return;
      state.habits.push({ id: uid(), name: h.name, cat: h.cat, mode: h.mode, times: h.times, days: [...h.days],
        created: today(), pauses: [], archived: null });
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
        <span class="nm">${shortDate(n.updated.slice(0, 10))}${n.source === 'ai' ? ' · From Ask Zuno' : ''}${n.habits && n.habits.length ? ` · ${n.habits.length} habits` : ''}</span>
      </button>`).join('')}</div>`
      : `<div class="empty"><p>Your notebook is empty.</p>Write down meal ideas, workouts or thoughts, or
        <button data-view="notebook" data-sub="ask">ask Zuno for a plan →</button></div>`;
    return pageHead('Notebook', 'Notes') + `
      <div class="actions" style="margin-top:12px">
        <button class="btn primary" data-act="newNote">New note</button>
        <button class="btn" data-view="notebook" data-sub="ask">Ask Zuno</button>
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
        <div class="nm">${n.source === 'ai' ? 'From Ask Zuno · ' : ''}Edited ${shortDate(n.updated.slice(0, 10))}</div>
        <div class="md">${md(n.body) || '<p class="lbl">Empty note.</p>'}</div>
        ${suggestions('note-' + n.id, n.habits, n.added)}
        <div class="actions" style="margin-top:18px">
          <button class="btn" data-act="noteEdit">Edit</button>
          <button class="btn ghost right" data-act="delNote">Delete</button>
        </div>
      </article>`;
  }

  // ---- ask zuno (Claude, with the person's own API key) ----
  const AI_KEY = 'zuno.ai.key';
  const AI_MODEL = 'claude-opus-5-5';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm';
  const aiKey = () => { try { return localStorage.getItem(AI_KEY) || ''; } catch (e) { return ''; } };
  let sdk = null;

  const STARTERS = [
    ['Meal plan', 'Make me a 7-day meal plan. My goal: '],
    ['Training plan', 'Make me a training plan. My goal: '],
    ['Build a routine', 'Help me build a daily routine for '],
    ['Review my progress', 'Look at my habits and tell me what to change to stay more consistent.'],
  ];

  function systemPrompt() {
    const t = parse(today());
    return `You are the assistant inside Zuno, a habit-tracking app. People use you to plan the things they want to turn into habits: meal plans, training plans, study, prayer or sleep routines and similar.

How to answer:
- Before writing a meal or training plan, make sure you know the goal, the person's current level and weekly schedule, and any allergies, dietary rules, injuries or medical conditions. If something important is missing, ask for it in one short message with at most four questions, then wait. If they already gave enough, or ask you to just go ahead, write the plan with sensible assumptions and say what you assumed.
- Plans are general guidance, not medical advice; say so once, in one short line. If someone mentions a medical condition, pregnancy, an eating disorder or an injury, keep the advice conservative and suggest checking with a doctor, dietitian or physiotherapist.
- Your answer is read on a phone. Use short headings (##), bullet lists and bold for key numbers. No tables and no emojis. Keep it as short as the request allows.
- When a plan or routine involves things to do regularly, call suggest_habits with 1 to 6 habits that capture it, after writing the plan. Each habit is a short, checkable action. Match the plan's schedule: mode "days" with the weekdays, or mode "weekly" with a number of times per week when any days will do. Skip habits the person already has, if you know them.
- Reply in the language the person writes in.

Today is ${DOW_LONG[dow(today())]}, ${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}.`;
  }

  function habitTool() {
    return {
      name: 'suggest_habits',
      description: 'Show the person habits they can add to Zuno with one tap. Call it after writing a plan or routine that involves regular actions.',
      strict: true,
      eager_input_streaming: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['habits'],
        properties: {
          habits: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'category', 'mode', 'days', 'times'],
              properties: {
                name: { type: 'string', description: 'Short action, at most 40 characters, e.g. "Run 5 km" or "Protein with breakfast"' },
                category: { type: 'string', enum: state.categories.map(c => c.name), description: 'The Zuno category it belongs to' },
                mode: { type: 'string', enum: ['days', 'weekly'], description: '"days" for fixed weekdays, "weekly" for a number of times per week on any days' },
                days: { type: 'array', items: { type: 'integer' }, description: 'For mode "days": weekdays, 0 = Monday to 6 = Sunday. Empty for "weekly".' },
                times: { type: 'integer', description: 'For mode "weekly": times per week, 1 to 7. 0 for "days".' },
              },
            },
          },
        },
      },
    };
  }

  // Tool input arrives via eager streaming and isn't validated by the API, so check every field here.
  function cleanHabits(input) {
    if (!input || !Array.isArray(input.habits)) return [];
    return input.habits.filter(h => h && typeof h.name === 'string' && h.name.trim()).slice(0, 8).map(h => {
      const cat = state.categories.find(c => c.name.toLowerCase() === String(h.category || '').toLowerCase()) || state.categories[0];
      const weekly = h.mode === 'weekly';
      const days = [...new Set((Array.isArray(h.days) ? h.days : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
      return {
        name: h.name.trim().slice(0, 60),
        cat: cat ? cat.id : '',
        mode: weekly ? 'weekly' : 'days',
        days: weekly || !days.length ? [...ALL_DAYS] : days,
        times: weekly ? Math.min(7, Math.max(1, Number.isInteger(h.times) && h.times > 0 ? h.times : 3)) : 3,
      };
    }).filter(h => h.cat);
  }

  // What gets shared when "Use my habit stats" is on.
  function statsContext() {
    const t = today();
    const live = state.habits.filter(h => !h.archived);
    const lines = live.map(h => {
      const r = habitRange(h, 30);
      const s = streaks(h);
      return `- ${h.name} · ${catName(h.cat)} · ${schedLabel(h)} · last 30 days ${r.done}/${r.total}${r.total ? ` (${pct(r.done, r.total)}%)` : ''} · streak ${s.now} ${s.unit === 'w' ? 'weeks' : 'days'}${isPaused(h, t) ? ' · paused' : ''}`;
    });
    let done = 0, total = 0;
    for (let i = 0; i < 30; i++) { const s = dayScore(addDays(t, -i)); done += s.done; total += s.total; }
    return `<zuno_context>
Shared by the person from their Zuno tracker.
${lines.length ? `Habits:\n${lines.join('\n')}` : 'No habits yet.'}
All habits, last 30 days: ${done}/${total}${total ? ` (${pct(done, total)}%)` : ''}.
</zuno_context>`;
  }

  function aiError(err) {
    const A = sdk && sdk.default;
    if (A && err instanceof A.APIUserAbortError) return 'Stopped.';
    if (A && err instanceof A.AuthenticationError) return 'Anthropic rejected the API key. Check it under “Key” below.';
    if (A && err instanceof A.PermissionDeniedError) return 'This API key isn’t allowed to use Claude. Check your Anthropic account.';
    if (A && err instanceof A.RateLimitError) return 'Too many requests right now. Wait a minute and try again.';
    if (A && err instanceof A.BadRequestError) return `Anthropic couldn’t take this request: ${err.message}`;
    if (A && err instanceof A.InternalServerError) return 'Anthropic’s service had a problem. Try again in a moment.';
    if (A && err instanceof A.APIConnectionError) return 'Couldn’t reach Anthropic. Check your internet connection.';
    if (A && err instanceof A.APIError) return `Something went wrong (${err.status || 'error'}). Try again.`;
    return 'Couldn’t reach Anthropic. Check your internet connection.';
  }

  async function askZuno(text) {
    if (!text.trim() || ui.ai.busy || !aiKey()) return;
    const items = state.chat.items;
    const content = [];
    // The previous answer may have called suggest_habits; the API expects a result for each call.
    const last = items[items.length - 1];
    if (last && last.role === 'assistant') {
      for (const b of last.content) {
        if (b.type === 'tool_use') content.push({ type: 'tool_result', tool_use_id: b.id, content: 'Shown to the person as one-tap habit suggestions.' });
      }
    }
    if (state.settings.aiStats) content.push({ type: 'text', text: statsContext() });
    content.push({ type: 'text', text: text.trim() });
    items.push({ role: 'user', content, text: text.trim(), stats: !!state.settings.aiStats });
    ui.draft = '';
    ui.ai = { busy: true, text: '', err: '', stream: null };
    save();
    render();
    scrollToEnd(true);

    try {
      if (!sdk) sdk = await import(SDK_URL);
      const Anthropic = sdk.default;
      const client = new Anthropic({ apiKey: aiKey(), dangerouslyAllowBrowser: true });
      const stream = client.beta.messages.stream({
        model: AI_MODEL,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // if Opus declines, Anthropic retries on its recommended model
        output_config: { effort: 'medium' },
        system: systemPrompt(),
        tools: [habitTool()],
        messages: items.map(i => ({ role: i.role, content: i.content })),
      });
      ui.ai.stream = stream;
      stream.on('text', delta => { ui.ai.text += delta; paintLive(); });
      const msg = await stream.finalMessage();

      if (msg.stop_reason === 'refusal') {
        items.pop();
        ui.draft = text;
        ui.ai = { busy: false, text: '', err: 'Zuno’s assistant can’t help with that request. Try rephrasing it.' };
      } else {
        const reply = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n').trim();
        const call = msg.content.find(b => b.type === 'tool_use' && b.name === 'suggest_habits');
        items.push({
          role: 'assistant',
          content: msg.content, // kept whole and sent back unchanged on the next turn
          text: reply,
          habits: call ? cleanHabits(call.input) : [],
          cut: msg.stop_reason === 'max_tokens',
        });
        ui.ai = { busy: false, text: '', err: '' };
      }
    } catch (err) {
      items.pop(); // nothing was answered, so take the question back out of the history
      ui.draft = text;
      ui.ai = { busy: false, text: '', err: aiError(err) };
    }
    save();
    if (ui.view === 'notebook' && ui.sub.notebook === 'ask') { render(); scrollToEnd(); }
  }

  function scrollToEnd(force) {
    const nearEnd = window.innerHeight + window.scrollY >= document.body.scrollHeight - 200;
    if (force || nearEnd) window.scrollTo({ top: document.body.scrollHeight });
  }
  function paintLive() {
    const el = document.getElementById('ai-live');
    if (!el) return;
    el.innerHTML = md(ui.ai.text);
    el.classList.remove('waiting');
    scrollToEnd();
  }

  function viewAsk() {
    const head = pageHead('Notebook', 'Ask Zuno');
    if (!aiKey() || ui.keyEdit) return head + keyCard();
    const items = state.chat.items;

    const thread = items.map((it, idx) => it.role === 'user'
      ? `<div class="msg me">${esc(it.text)}${it.stats ? '<small>Habit stats shared</small>' : ''}</div>`
      : `<div class="msg ai">
          <div class="md">${md(it.text) || '<p class="lbl">Suggested habits below.</p>'}</div>
          ${it.cut ? '<p class="lbl">The answer was cut off. Ask Zuno to continue.</p>' : ''}
          ${suggestions('chat-' + idx, it.habits, it.added)}
          <div class="msg-actions">
            ${it.noteId && findNote(it.noteId)
              ? `<button class="linkbtn" data-act="openNote" data-id="${it.noteId}">Saved in Notes →</button>`
              : `<button class="linkbtn" data-act="saveReply" data-i="${idx}">Save to notebook</button>`}
          </div>
        </div>`).join('');

    const live = ui.ai.busy ? `<div class="msg ai"><div class="md ${ui.ai.text ? '' : 'waiting'}" id="ai-live">${ui.ai.text ? md(ui.ai.text) : '<span class="dots"><i></i><i></i><i></i></span> Thinking'}</div></div>` : '';

    const intro = items.length ? '' : `
      <p class="summary">Ask for a meal plan, a training plan or a routine. Zuno writes it up and offers the parts worth tracking as habits you can add with one tap.</p>
      <div class="starters">${STARTERS.map(([label], i) => `<button data-act="starter" data-i="${i}">${label}</button>`).join('')}</div>`;

    const s = state.settings.aiStats;
    const composer = `
      <div class="composer">
        ${ui.ai.err ? `<div class="err">${esc(ui.ai.err)}</div>` : ''}
        <textarea id="ai-input" rows="2" placeholder="Ask Zuno…" ${ui.ai.busy ? 'disabled' : ''}>${esc(ui.draft)}</textarea>
        <div class="composer-row">
          <button class="chipbtn ${s ? 'on' : ''}" data-act="aiStats" aria-pressed="${!!s}" title="Send a summary of your habits and last 30 days with your next questions">
            <span class="sw ${s ? 'on' : ''}"><i></i></span>Use my habit stats</button>
          ${ui.ai.busy
            ? '<button class="btn" data-act="aiStop">Stop</button>'
            : '<button class="btn primary" data-act="aiSend">Send</button>'}
        </div>
      </div>`;

    const tools = `<div class="ask-foot">
      ${items.length ? '<button class="linkbtn" data-act="aiNew">New conversation</button>' : '<span></span>'}
      <button class="linkbtn" data-act="keyEdit">Key</button>
    </div>`;

    return head + intro + `<div class="thread">${thread}${live}</div>` + composer + tools +
      `<div class="foot">Answers come from Claude by Anthropic, using your own API key. What you send here goes to Anthropic; your other data stays on this device. Plans are general guidance, not medical advice.</div>`;
  }

  function keyCard() {
    const has = !!aiKey();
    return `
      <section class="editor">
        <p class="summary" style="padding-top:0">Ask Zuno uses Claude, Anthropic’s AI. It needs your own Anthropic API key. The key is saved only on this device and is sent only to Anthropic.</p>
        <ol class="steps">
          <li>Sign in at <b>console.anthropic.com</b> and add some credit under Billing. A typical plan costs a few cents.</li>
          <li>Open <b>API keys</b> and create a key.</li>
          <li>Paste it below.</li>
        </ol>
        <div class="field">
          <span class="lbl">API key</span>
          <input type="password" id="ai-key" placeholder="${has ? 'Saved. Paste a new key to replace it' : 'sk-ant-…'}" autocomplete="off" spellcheck="false">
        </div>
        <div class="actions">
          <button class="btn primary" data-act="keySave">Save key</button>
          ${has ? '<button class="btn ghost" data-act="keyCancel">Cancel</button><button class="btn ghost right" data-act="keyRemove">Remove key</button>' : ''}
        </div>
        ${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ''}
        <p class="hint" style="margin-bottom:0">What you type in Ask Zuno, and your habit stats if you switch that on, is sent to Anthropic to answer you. Notes, habits and history otherwise stay on this device. The key is not included in exported backups.</p>
      </section>`;
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

      <div class="section-h"><h3>Ask Zuno</h3><span class="frac">${aiKey() ? 'Key saved' : 'No key yet'}</span></div>
      <div class="card list">
        ${action('askKey', aiKey() ? 'Anthropic API key' : 'Set up Ask Zuno', aiKey() ? 'Saved on this device only. Replace or remove it' : 'Add your own Anthropic API key to use the AI')}
        ${toggle('aiStats', 'Share habit stats', 'Send a summary of your habits and last 30 days with each question')}
      </div>

      <div class="section-h"><h3>Data</h3><span class="frac">On this device</span></div>
      <div class="card list">
        ${action('export', 'Export backup', 'Save everything as a .json file')}
        ${action('import', 'Import backup', 'Replace current data with a .json file')}
        ${action('sample', 'Load sample data', 'Nine example habits with five weeks of history')}
        ${action('erase', 'Erase everything', 'Remove all habits, history, notes and the API key', 'danger')}
      </div>
      ${ui.note ? `<div class="err">${esc(ui.note)}</div>` : ''}

      <div class="foot">Zuno ${VERSION} · ${state.habits.length} habits · ${days} days logged · ${state.notes.length} notes<br>Your data stays on this device. Only what you send to Ask Zuno goes to Anthropic.</div>`;
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
          <p>Everything stays on your device. No account, no feed, nobody else looking at your numbers. The one exception is Ask Zuno: what you type there goes to Anthropic, the company behind Claude, so it can answer.</p>
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
    meta.setAttribute('content', t === 'dark' ? '#000000' : '#ffffff');
  }

  // The rail is built once; renders only flip classes so the open/close transitions can run.
  function buildNav() {
    $nav.innerHTML = NAV.map(s => {
      const head = `<button class="${s.subs ? 'has-sub' : ''}" data-view="${s.id}"
        ${s.subs ? `aria-expanded="false" aria-controls="sub-${s.id}"` : ''}>${s.label}</button>`;
      if (!s.subs) return head;
      return head + `<div class="sub" id="sub-${s.id}" inert><div>${s.subs.map(([id, full, short], i) =>
        `<button style="--i:${i}" data-view="${s.id}" data-sub="${id}" aria-label="${full}">
          <span class="full">${full}</span><span class="short">${short}</span></button>`).join('')}</div></div>`;
    }).join('');
  }

  function renderNav() {
    $nav.querySelectorAll(':scope > button').forEach(b => {
      const on = b.dataset.view === ui.view;
      b.classList.toggle('on', on);
      if (b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', on);
    });
    $nav.querySelectorAll('.sub').forEach(el => {
      const v = el.id.slice(4);
      const isOpen = v === ui.view;
      el.classList.toggle('open', isOpen);
      el.inert = !isOpen;
      el.querySelectorAll('button').forEach(b => b.classList.toggle('on', isOpen && ui.sub[v] === b.dataset.sub));
    });
    document.querySelector('[data-view="settings"]').classList.toggle('on', ui.view === 'settings');
    document.querySelector('.brand').classList.toggle('on', ui.view === 'about');
  }

  const VIEWS = {
    today: { day: viewDay, week: () => viewReport('week'), month: () => viewReport('month') },
    settings: viewSettings,
    about: viewAbout,
    stats: { overview: viewOverview, byhabit: viewByHabit, bycat: viewByCat, trajectory: viewTrajectory },
    habits: { add: viewAdd, change: viewChange, list: viewList },
    notebook: { notes: viewNotes, ask: viewAsk },
  };
  function render() {
    renderNav();
    const v = VIEWS[ui.view];
    $view.innerHTML = typeof v === 'function' ? v() : v[ui.sub[ui.view]]();
    $view.querySelectorAll('textarea').forEach(autosize);
    ui.pop = null;
  }

  function autosize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }

  function go(view, sub) {
    if (sub) ui.sub[view] = sub;
    const changed = ui.view !== view || sub;
    if (changed && ui.noteId) leaveNote();
    ui.view = view;
    ui.note = '';
    ui.keyEdit = false;
    if (changed) resetForm();
    render();
    window.scrollTo(0, 0);
    if (changed) { $view.classList.remove('enter'); void $view.offsetWidth; $view.classList.add('enter'); }
  }

  function resetForm() {
    ui.edit = null;
    ui.err = '';
    const cat = ui.form.cat === '__new' || !state.categories.some(c => c.id === ui.form.cat)
      ? (state.categories[0] || {}).id : ui.form.cat;
    ui.form = { name: '', cat, days: [...ALL_DAYS], newCat: '', mode: 'days', times: 3 };
  }

  function startEdit(id) {
    const h = state.habits.find(x => x.id === id);
    if (!h) return;
    ui.edit = h.id; ui.err = ''; ui.note = '';
    ui.form = { name: h.name, cat: h.cat, days: [...h.days], newCat: '', mode: h.mode, times: h.times };
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
    const h = ui.edit && state.habits.find(x => x.id === ui.edit);
    if (h) {
      Object.assign(h, fields);
      save(); resetForm();
      ui.note = '';
    } else {
      state.habits.push({ id: uid(), ...fields, created: today(), pauses: [], archived: null });
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
    const b = e.target.closest('[data-act], [data-view]');
    if (!b || b.disabled) return;

    if (b.dataset.view) {
      const v = b.dataset.view;
      // Opening a section lands on the sub-section you last used in it.
      if (!b.dataset.sub && v === ui.view && NAV.find(s => s.id === v && s.subs)) return;
      go(v, b.dataset.sub);
      return;
    }

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
        pauseHabit(h);
        h.archived = today();
        save(); resetForm();
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
        if (!h || !confirm(`Delete “${h.name}” and all of its history? Archive keeps the history instead.`)) return;
        state.habits = state.habits.filter(x => x.id !== h.id);
        for (const map of [state.log, state.skips]) {
          for (const d of Object.keys(map)) toggleIn(map, d, h.id, false);
        }
        save(); resetForm();
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
      case 'delCat':
        state.categories = state.categories.filter(c => c.id !== id);
        if (ui.form.cat === id) ui.form.cat = (state.categories[0] || {}).id;
        save();
        break;

      // settings
      case 'theme':
        state.theme = b.dataset.v;
        save(); applyTheme();
        break;
      case 'weekStart':
        state.settings.weekStart = b.dataset.v; save();
        break;
      case 'setting':
        state.settings[b.dataset.k] = !state.settings[b.dataset.k]; save();
        break;
      case 'export': {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `zuno-${today()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        return;
      }
      case 'import': $file.value = ''; $file.click(); return;
      case 'sample':
        if (state.habits.length && !confirm('Replace your current habits and history with sample data?')) return;
        replaceState(normalize({ ...seed(), theme: state.theme, settings: state.settings, notes: state.notes, chat: state.chat }));
        ui.note = 'Sample data loaded';
        break;
      // notebook
      case 'newNote': {
        const n = newNote();
        ui.noteId = n.id; ui.noteEdit = true;
        render();
        document.getElementById('n-title').focus();
        return;
      }
      case 'openNote':
        if (ui.view !== 'notebook' || ui.sub.notebook !== 'notes') go('notebook', 'notes');
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
      case 'delNote':
        if (!confirm('Delete this note?')) return;
        state.notes = state.notes.filter(n => n.id !== ui.noteId);
        ui.noteId = null; ui.noteEdit = false;
        save();
        break;
      case 'suggToggle': {
        const sel = ui.sel[b.dataset.k];
        if (sel) sel[Number(b.dataset.i)] = !sel[Number(b.dataset.i)];
        break;
      }
      case 'suggAdd': {
        const k = b.dataset.k;
        const owner = k.startsWith('chat-') ? state.chat.items[Number(k.slice(5))] : findNote(k.slice(5));
        if (!owner || !owner.habits) break;
        const n = addSuggested(k, owner.habits);
        if (n) owner.added = true;
        save();
        break;
      }
      case 'saveReply': {
        const it = state.chat.items[Number(b.dataset.i)];
        if (!it) break;
        const heading = (it.text.match(/^#{1,4}\s+(.+)$/m) || [])[1];
        const n = newNote({ title: plain(heading || it.text.split('\n')[0]).slice(0, 60), body: it.text, source: 'ai',
          habits: it.habits && it.habits.length ? it.habits : null, added: !!it.added });
        it.noteId = n.id;
        save();
        break;
      }

      // ask zuno
      case 'starter': {
        const [, text] = STARTERS[Number(b.dataset.i)];
        ui.draft = text;
        if (Number(b.dataset.i) === 3) { state.settings.aiStats = true; save(); }
        render();
        const input = document.getElementById('ai-input');
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        return;
      }
      case 'aiSend': askZuno(document.getElementById('ai-input').value); return;
      case 'aiStop': if (ui.ai.stream) ui.ai.stream.abort(); return;
      case 'aiStats': state.settings.aiStats = !state.settings.aiStats; save(); break;
      case 'aiNew':
        if (ui.ai.busy) return;
        state.chat.items = []; ui.sel = {}; ui.ai.err = ''; ui.draft = '';
        save();
        break;
      case 'askKey': go('notebook', 'ask'); ui.keyEdit = true; break;
      case 'keyEdit': ui.keyEdit = true; ui.err = ''; break;
      case 'keyCancel': ui.keyEdit = false; ui.err = ''; break;
      case 'keySave': {
        const v = document.getElementById('ai-key').value.trim();
        if (!v) { ui.err = 'Paste your key first.'; break; }
        if (!v.startsWith('sk-')) { ui.err = 'That doesn’t look like an Anthropic API key. They start with “sk-ant-”.'; break; }
        try { localStorage.setItem(AI_KEY, v); } catch (err) { ui.err = 'Couldn’t save the key on this device.'; break; }
        ui.keyEdit = false; ui.err = '';
        break;
      }
      case 'keyRemove':
        if (!confirm('Remove your API key from this device?')) return;
        try { localStorage.removeItem(AI_KEY); } catch (err) { /* nothing stored */ }
        ui.keyEdit = false;
        break;

      case 'erase':
        if (!confirm('Erase all habits, history, notes and the API key on this device?')) return;
        try { localStorage.removeItem(AI_KEY); } catch (err) { /* nothing stored */ }
        replaceState(blank());
        ui.note = 'Everything erased';
        break;
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
      if (!valid(next)) { ui.note = 'That file is not a Zuno backup'; render(); return; }
      if (!confirm(`Replace current data with ${next.habits.length} habits from “${file.name}”?`)) return;
      replaceState(normalize(next));
      ui.note = 'Backup imported';
      render();
    });
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'f-name') { ui.form.name = e.target.value; ui.err = ''; }
    if (e.target.id === 'f-newcat') { ui.form.newCat = e.target.value; ui.err = ''; }
    if (e.target.id === 'n-title' || e.target.id === 'n-body') {
      const n = findNote(ui.noteId);
      if (!n) return;
      n[e.target.id === 'n-title' ? 'title' : 'body'] = e.target.value;
      n.updated = new Date().toISOString();
      clearTimeout(noteTimer);
      noteTimer = setTimeout(save, 400);
    }
    if (e.target.id === 'ai-input') ui.draft = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autosize(e.target);
  });
  let noteTimer = null;
  document.addEventListener('change', e => {
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
    if (e.key !== 'Enter') return;
    if (e.target.id === 'ai-input' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); askZuno(e.target.value); return; }
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
