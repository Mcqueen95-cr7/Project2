(() => {
  const STORAGE_KEY = 'daily-app:v1';
  const DAILY_BUDGET = 500; // THB, used to compute the "Spending" stat %

  const FIXED_TASKS = [
    { id: 'learning', label: 'Learning for 1 hour', hours: 1 },
    { id: 'gym', label: 'Gym', hours: 1 },
    { id: 'relax', label: 'Relax', hours: 0.5 },
  ];

  const todayKey = (d = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  function loadState() {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { raw = null; }
    const state = Object.assign({
      taskDate: todayKey(),
      taskDone: { learning: false, gym: false, relax: false },
      customTasks: [], // {id, label, done}
      expenses: [],    // {id, amount, note, date}
      notes: [],       // {id, text, date}
      schedule: [],    // {id, date: 'YYYY-MM-DD', time: 'HH:MM', title, done}
    }, raw || {});

    // Reset the 3 fixed daily tasks when the day changes.
    if (state.taskDate !== todayKey()) {
      state.taskDate = todayKey();
      state.taskDone = { learning: false, gym: false, relax: false };
    }
    return state;
  }

  let state = loadState();
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- helpers ----------
  const fmtMoney = (n) => `฿${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const fmtDateTime = (iso) => {
    const d = new Date(iso);
    const isToday = todayKey(d) === todayKey();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Today, ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  };

  function startOfWeek(d) {
    const day = d.getDay(); // 0 Sun
    const diff = (day === 0 ? -6 : 1) - day; // Monday start
    const monday = new Date(d);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(d.getDate() + diff);
    return monday;
  }

  function inRange(iso, period) {
    const d = new Date(iso);
    const now = new Date();
    if (period === 'total' || period === 'all') return true;
    if (period === 'day') return todayKey(d) === todayKey(now);
    if (period === 'week') return d >= startOfWeek(now);
    if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (period === 'year') return d.getFullYear() === now.getFullYear();
    return true;
  }

  // ---------- navigation ----------
  const views = ['home', 'expenses', 'notes', 'schedule', 'history'];
  function showView(name) {
    views.forEach(v => {
      document.getElementById(`view-${v}`).hidden = v !== name;
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === name);
    });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.nav));
  });
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => showView('home'));
  });
  document.getElementById('goExpensesCard').addEventListener('click', () => showView('expenses'));
  document.getElementById('goNotesCard').addEventListener('click', () => showView('notes'));

  // ---------- date label ----------
  document.getElementById('todayLabel').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  // ---------- greeting (real time, GMT+7) ----------
  function updateGreeting() {
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok', hour: 'numeric', hour12: false,
    }).format(new Date()));

    const word = hour < 5 ? 'Good Night'
      : hour < 12 ? 'Good Morning'
      : hour < 18 ? 'Good Afternoon'
      : hour < 22 ? 'Good Evening'
      : 'Good Night';

    document.getElementById('greetingWord').textContent = word;
  }
  updateGreeting();
  setInterval(updateGreeting, 60 * 1000);

  // ---------- range filter pills (home, cosmetic scope for stats) ----------
  let homeRange = 'all';
  document.getElementById('rangeFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    document.querySelectorAll('#rangeFilters .filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    homeRange = btn.dataset.range;
    renderHome();
  });

  // ---------- fixed task progress ----------
  function taskProgressPct() {
    const done = FIXED_TASKS.filter(t => state.taskDone[t.id]).length;
    return Math.round((done / FIXED_TASKS.length) * 100);
  }

  document.querySelectorAll('#taskList input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      state.taskDone[cb.dataset.taskId] = cb.checked;
      save();
      renderHome();
    });
  });

  document.getElementById('toggleTasksBtn').addEventListener('click', (e) => {
    const list = document.getElementById('taskList');
    const btn = e.currentTarget;
    list.hidden = !list.hidden;
    btn.classList.toggle('open', !list.hidden);
    document.getElementById('progressSub').hidden = !list.hidden;
  });

  // ---------- quick-add "create new task" modal (extra/custom tasks) ----------
  const modal = document.getElementById('modalBackdrop');
  document.getElementById('createTaskBtn').addEventListener('click', () => {
    modal.hidden = false;
    document.getElementById('quickTaskInput').focus();
  });
  document.getElementById('modalCloseBtn').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  document.getElementById('quickTaskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('quickTaskInput');
    const label = input.value.trim();
    if (!label) return;
    state.customTasks.push({ id: uid(), label, done: false });
    save();
    input.value = '';
    modal.hidden = true;
    renderHome();
  });

  function renderExtraTasks() {
    const wrap = document.getElementById('extraTasks');
    const list = document.getElementById('extraTaskList');
    if (!state.customTasks.length) { wrap.hidden = true; list.innerHTML = ''; return; }
    wrap.hidden = false;
    list.innerHTML = state.customTasks.map(t => `
      <label class="extra-task-row" data-id="${t.id}">
        <input type="checkbox" ${t.done ? 'checked' : ''} data-extra-toggle="${t.id}" />
        <span class="task-box"></span>
        <span class="task-text">${escapeHtml(t.label)}</span>
        <button type="button" class="row-delete" data-extra-delete="${t.id}">×</button>
      </label>
    `).join('');

    list.querySelectorAll('[data-extra-toggle]').forEach(cb => {
      cb.addEventListener('change', () => {
        const t = state.customTasks.find(x => x.id === cb.dataset.extraToggle);
        if (t) { t.done = cb.checked; save(); }
      });
    });
    list.querySelectorAll('[data-extra-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.customTasks = state.customTasks.filter(x => x.id !== btn.dataset.extraDelete);
        save();
        renderExtraTasks();
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- expenses ----------
  const expenseDateEl = document.getElementById('expenseDate');
  expenseDateEl.max = todayKey();
  expenseDateEl.value = todayKey();

  document.getElementById('expenseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amountEl = document.getElementById('expenseAmount');
    const noteEl = document.getElementById('expenseNote');
    const amount = parseFloat(amountEl.value);
    const note = noteEl.value.trim();
    if (!amount || amount <= 0 || !note) return;

    // Combine the chosen date with the current time-of-day so back-dated
    // expenses (e.g. "forgot to log yesterday") still sort/display sensibly.
    const now = new Date();
    const [y, m, d] = (expenseDateEl.value || todayKey()).split('-').map(Number);
    const date = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());

    state.expenses.unshift({ id: uid(), amount, note, date: date.toISOString() });
    save();
    amountEl.value = '';
    noteEl.value = '';
    expenseDateEl.value = todayKey();
    renderExpenses();
    renderHome();
  });

  let expensePeriod = 'day';
  document.getElementById('expensePeriodFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    document.querySelectorAll('#expensePeriodFilters .filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    expensePeriod = btn.dataset.period;
    renderExpenses();
  });

  const PERIOD_LABEL = { day: 'Today', week: 'This week', month: 'This month', total: 'All time' };

  function renderExpenses() {
    const items = state.expenses.filter(x => inRange(x.date, expensePeriod));
    const total = items.reduce((s, x) => s + x.amount, 0);
    document.getElementById('expensePeriodLabel').textContent = PERIOD_LABEL[expensePeriod];
    document.getElementById('expensePeriodTotal').textContent = fmtMoney(total);
    document.getElementById('expenseCount').textContent = `${items.length} expense${items.length === 1 ? '' : 's'}`;

    const list = document.getElementById('expenseList');
    const empty = document.getElementById('expenseEmpty');
    empty.hidden = items.length > 0;
    list.innerHTML = items.map(x => `
      <div class="list-row" data-id="${x.id}">
        <div class="row-icon">฿</div>
        <div class="row-body">
          <div class="row-title">${escapeHtml(x.note)}</div>
          <div class="row-sub">${fmtDateTime(x.date)}</div>
        </div>
        <div class="row-amount">${fmtMoney(x.amount)}</div>
        <button type="button" class="row-delete" data-expense-delete="${x.id}">×</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-expense-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.expenses = state.expenses.filter(x => x.id !== btn.dataset.expenseDelete);
        save();
        renderExpenses();
        renderHome();
      });
    });
  }

  // ---------- notes ----------
  document.getElementById('noteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const textEl = document.getElementById('noteText');
    const text = textEl.value.trim();
    if (!text) return;
    state.notes.unshift({ id: uid(), text, date: new Date().toISOString() });
    save();
    textEl.value = '';
    renderNotes();
    renderHome();
  });

  function renderNotes() {
    const list = document.getElementById('noteList');
    const empty = document.getElementById('noteEmpty');
    empty.hidden = state.notes.length > 0;
    list.innerHTML = state.notes.map(n => `
      <div class="note-card" data-id="${n.id}">
        <div class="row-sub">${fmtDateTime(n.date)}</div>
        <div class="note-body">${escapeHtml(n.text)}</div>
        <div class="note-footer">
          <button type="button" class="row-delete" data-note-delete="${n.id}">×</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-note-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.notes = state.notes.filter(n => n.id !== btn.dataset.noteDelete);
        save();
        renderNotes();
        renderHome();
      });
    });
  }

  // ---------- schedule + calendar ----------
  let calendarMonth = new Date();
  calendarMonth.setDate(1);
  let selectedDate = todayKey();

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function fmtSelectedDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const isToday = key === todayKey();
    return isToday ? 'Events today' : `Events on ${date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`;
  }

  function renderCalendar() {
    document.getElementById('calMonthLabel').textContent =
      `${MONTH_NAMES[calendarMonth.getMonth()]} ${calendarMonth.getFullYear()}`;

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const eventDates = new Set(state.schedule.map(ev => ev.date));
    const cells = [];

    for (let i = firstWeekday - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, otherMonth: true, key: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, otherMonth: false, key });
    }
    let nextMonthDay = 1;
    while (cells.length % 7 !== 0) {
      cells.push({ day: nextMonthDay++, otherMonth: true, key: null });
    }

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = cells.map(c => {
      if (c.otherMonth) {
        return `<button type="button" class="calendar-day other-month empty" disabled>${c.day}</button>`;
      }
      const classes = ['calendar-day'];
      if (c.key === todayKey()) classes.push('today');
      if (c.key === selectedDate) classes.push('selected');
      const hasEvent = eventDates.has(c.key);
      return `<button type="button" class="${classes.join(' ')}" data-date="${c.key}">${c.day}${hasEvent ? '<span class="dot"></span>' : ''}</button>`;
    }).join('');

    grid.querySelectorAll('[data-date]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDate = btn.dataset.date;
        renderCalendar();
        renderScheduleList();
      });
    });
  }

  document.getElementById('calPrevBtn').addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('calNextBtn').addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    renderCalendar();
  });

  document.getElementById('scheduleForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const timeEl = document.getElementById('scheduleTime');
    const titleEl = document.getElementById('scheduleTitle');
    const time = timeEl.value;
    const title = titleEl.value.trim();
    if (!time || !title) return;
    state.schedule.push({ id: uid(), date: selectedDate, time, title, done: false });
    save();
    timeEl.value = '';
    titleEl.value = '';
    renderCalendar();
    renderScheduleList();
  });

  function renderScheduleList() {
    document.getElementById('scheduleDateLabel').textContent = fmtSelectedDate(selectedDate);

    const items = state.schedule
      .filter(ev => ev.date === selectedDate)
      .sort((a, b) => a.time.localeCompare(b.time));

    const list = document.getElementById('scheduleList');
    const empty = document.getElementById('scheduleEmpty');
    empty.hidden = items.length > 0;

    list.innerHTML = items.map(ev => `
      <div class="list-row schedule-row ${ev.done ? 'done' : ''}" data-id="${ev.id}">
        <button type="button" class="schedule-check ${ev.done ? 'checked' : ''}" data-schedule-toggle="${ev.id}" aria-label="Mark done"></button>
        <div class="row-time">${ev.time}</div>
        <div class="row-body">
          <div class="row-title">${escapeHtml(ev.title)}</div>
        </div>
        <button type="button" class="row-delete" data-schedule-delete="${ev.id}">×</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-schedule-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ev = state.schedule.find(x => x.id === btn.dataset.scheduleToggle);
        if (ev) { ev.done = !ev.done; save(); renderScheduleList(); }
      });
    });
    list.querySelectorAll('[data-schedule-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.schedule = state.schedule.filter(x => x.id !== btn.dataset.scheduleDelete);
        save();
        renderCalendar();
        renderScheduleList();
      });
    });
  }

  // ---------- activity feed ----------
  function renderActivity() {
    const items = [];
    state.expenses.forEach(x => items.push({ type: 'expense', date: x.date, text: `Spent ${fmtMoney(x.amount)} on ${x.note}` }));
    state.notes.forEach(n => items.push({ type: 'note', date: n.date, text: n.text.slice(0, 80) + (n.text.length > 80 ? '…' : '') }));
    items.sort((a, b) => new Date(b.date) - new Date(a.date));

    const list = document.getElementById('activityList');
    const empty = document.getElementById('activityEmpty');
    empty.hidden = items.length > 0;
    list.innerHTML = items.map(it => `
      <div class="list-row">
        <div class="row-icon">${it.type === 'expense' ? '฿' : '📝'}</div>
        <div class="row-body">
          <div class="row-title">${escapeHtml(it.text)}</div>
          <div class="row-sub">${fmtDateTime(it.date)}</div>
        </div>
      </div>
    `).join('');
  }

  // ---------- home render ----------
  function renderHome() {
    // task checkboxes + progress
    FIXED_TASKS.forEach(t => {
      const cb = document.querySelector(`#taskList input[data-task-id="${t.id}"]`);
      if (cb) cb.checked = !!state.taskDone[t.id];
    });
    const pct = taskProgressPct();
    document.getElementById('progressPct').textContent = pct;
    const doneCount = FIXED_TASKS.filter(t => state.taskDone[t.id]).length;
    document.getElementById('checkpointsSub').textContent = `${doneCount}/${FIXED_TASKS.length} checkpoints done`;
    document.getElementById('progressBarFill').style.width = `${pct}%`;

    // today's expense mini card
    const todayTotal = state.expenses
      .filter(x => inRange(x.date, 'day'))
      .reduce((s, x) => s + x.amount, 0);
    document.getElementById('todayExpenseValue').textContent = fmtMoney(todayTotal);

    // notes mini card
    const latestNote = state.notes[0];
    if (latestNote) {
      const firstWord = latestNote.text.trim().split(/\s+/)[0] || '—';
      document.getElementById('noteInitial').textContent = firstWord.slice(0, 10);
      document.getElementById('noteSub').textContent = latestNote.text.length > 28
        ? latestNote.text.slice(0, 28) + '…'
        : latestNote.text;
    } else {
      document.getElementById('noteInitial').textContent = '—';
      document.getElementById('noteSub').textContent = 'How today went';
    }

    // stats: total time (hours from completed fixed tasks today)
    const totalHours = FIXED_TASKS.filter(t => state.taskDone[t.id]).reduce((s, t) => s + t.hours, 0);
    const h = Math.floor(totalHours);
    const m = Math.round((totalHours - h) * 60);
    document.getElementById('statTime').textContent = `${h}h ${m}m`;

    // stats: productivity = fixed-task progress
    document.getElementById('statProductivity').textContent = `${pct}%`;

    // stats: spending vs daily budget, scoped by the home range filter
    const rangePeriod = homeRange === 'all' ? 'total' : homeRange;
    const rangeTotal = state.expenses.filter(x => inRange(x.date, rangePeriod)).reduce((s, x) => s + x.amount, 0);
    const budgetForRange = rangePeriod === 'day' ? DAILY_BUDGET
      : rangePeriod === 'month' ? DAILY_BUDGET * 30
      : rangePeriod === 'year' ? DAILY_BUDGET * 365
      : DAILY_BUDGET * 30;
    const spendingPct = budgetForRange > 0 ? Math.min((rangeTotal / budgetForRange) * 100, 999) : 0;
    document.getElementById('statSpending').textContent = `${spendingPct.toFixed(spendingPct < 100 ? 2 : 0)}%`;

    renderExtraTasks();
  }

  // ---------- init ----------
  renderHome();
  renderExpenses();
  renderNotes();
  renderCalendar();
  renderScheduleList();
  renderActivity();
  showView('home');

  // keep activity/notes/expenses/schedule fresh whenever their tab is opened
  document.querySelector('[data-nav="history"]').addEventListener('click', renderActivity);
  document.querySelector('[data-nav="expenses"]').addEventListener('click', renderExpenses);
  document.querySelector('[data-nav="notes"]').addEventListener('click', renderNotes);
  document.querySelector('[data-nav="schedule"]').addEventListener('click', () => {
    renderCalendar();
    renderScheduleList();
  });
})();
