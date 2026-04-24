// In Chrome extension: use absolute localhost URL
// When served from the Node server (mobile/web): use relative paths
const API = location.protocol === 'chrome-extension:' ? 'http://localhost:3000' : '';
const VAULT_NAME = 'RIL'; // must match your Obsidian vault name

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  folder: 'Inbox',
  groupBy: 'domain',
  groups: [],       // all groups from API (domain-grouped raw data)
  total: 0,
  activeDomain: null, // null = show all; string = filter (domain/tag view)
  timePeriod: 'this-week', // time view period
  focusedIndex: 0,
  lastAction: null,
  toastTimer: null,
  smartMode: false,
  profile: null,
  sortBy: 'date', // 'date' | 'score'
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function flatItems() {
  // De-dupe by id (tag view can repeat items across groups)
  const seen = new Set();
  const items = [];
  for (const g of visibleGroups()) {
    for (const item of g.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
  }
  return items;
}

function relativeTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
}

function faviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

function getYoutubeThumbnail(url) {
  try {
    const u = new URL(url);
    let videoId = null;
    if (u.hostname.includes('youtube.com')) {
      videoId = u.searchParams.get('v');
    } else if (u.hostname === 'youtu.be') {
      videoId = u.pathname.slice(1).split('?')[0];
    }
    if (videoId) return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  } catch {}
  return null;
}

function buildThumbTile(item) {
  const tile = document.createElement('div');
  tile.className = 'item-thumb-tile';
  const letter = document.createElement('span');
  letter.className = 'item-thumb-letter';
  letter.textContent = (item.domain || item.site || '?').charAt(0).toUpperCase();
  tile.appendChild(letter);
  return tile;
}

function visibleGroups() {
  if (state.groupBy === 'time') return timeGroups();
  if (!state.activeDomain) return state.groups;
  return state.groups.filter((g) => g.key === state.activeDomain);
}

function smartGroups() {
  const items = allFlatItems();
  const tiers = [
    { key: 'highly-relevant', label: 'Highly relevant ✦', min: 7, max: 10 },
    { key: 'worth-reading',   label: 'Worth reading',     min: 4, max: 6 },
    { key: 'lower-priority',  label: 'Lower priority',    min: 0, max: 3 },
    { key: 'unscored',        label: 'Unscored',          min: null, max: null },
  ];
  return tiers.map(tier => {
    const tierItems = items.filter(item => {
      const s = item.relevanceScore;
      if (tier.key === 'unscored') return s === null || s === undefined;
      return s !== null && s !== undefined && s >= tier.min && s <= tier.max;
    });
    return { key: tier.key, label: tier.label, count: tierItems.length, items: tierItems };
  }).filter(g => g.items.length > 0);
}

function sortGroupItems(items) {
  if (state.sortBy === 'score') {
    return [...items].sort((a, b) => {
      const sa = a.relevanceScore ?? -1;
      const sb = b.relevanceScore ?? -1;
      return sb - sa;
    });
  }
  // default: newest first
  return [...items].sort((a, b) =>
    new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime()
  );
}

// All items across all groups, de-duped (ignores domain filter)
function allFlatItems() {
  const seen = new Set();
  const items = [];
  for (const g of state.groups) {
    for (const item of g.items) {
      if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
    }
  }
  return items;
}

function getTimeBucket(savedAt, period) {
  const date = new Date(savedAt);
  const ageDays = (Date.now() - date.getTime()) / 86400000;
  switch (period) {
    case 'this-week':
      if (ageDays < 1) return 'Today';
      if (ageDays < 2) return 'Yesterday';
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    case 'last-week':
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    case 'this-month':
      if (ageDays < 7)  return 'This week';
      if (ageDays < 14) return 'Last week';
      if (ageDays < 21) return '2 weeks ago';
      return '3+ weeks ago';
    case 'this-quarter':
    case 'all':
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    default:
      return 'Other';
  }
}

function timeGroups() {
  const minAge = { 'this-week': 0, 'last-week': 7,  'this-month': 0, 'this-quarter': 0, 'all': 0 };
  const maxAge = { 'this-week': 7, 'last-week': 14, 'this-month': 30, 'this-quarter': 90, 'all': Infinity };
  const period = state.timePeriod;

  const filtered = allFlatItems().filter(item => {
    if (!item.savedAt) return false;
    const age = (Date.now() - new Date(item.savedAt).getTime()) / 86400000;
    return age >= minAge[period] && age < maxAge[period];
  });

  const bucketMap = new Map();
  for (const item of filtered) {
    const key = getTimeBucket(item.savedAt, period);
    if (!bucketMap.has(key)) bucketMap.set(key, { key, label: key, items: [], newestMs: 0 });
    const b = bucketMap.get(key);
    b.items.push(item);
    b.newestMs = Math.max(b.newestMs, new Date(item.savedAt).getTime());
  }

  return Array.from(bucketMap.values())
    .sort((a, b) => b.newestMs - a.newestMs)
    .map(b => ({ key: b.key, label: b.label, count: b.items.length, items: b.items }));
}

function obsidianUrl(itemId) {
  // vault file lives at RIL/<folder>/<id>.md
  const folder = state.folder;
  const file = encodeURIComponent(`RIL/${folder}/${itemId}.md`);
  return `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${file}`;
}

// ── API calls ─────────────────────────────────────────────────────────────────
async function fetchItems() {
  const res = await fetch(`${API}/api/items?folder=${state.folder}&groupBy=${state.groupBy}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function fetchCounts() {
  const res = await fetch(`${API}/api/counts`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function doAction(id, action) {
  const res = await fetch(`${API}/api/items/${encodeURIComponent(id)}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`Action failed: ${res.status}`);
}

// ── Load & render ─────────────────────────────────────────────────────────────
async function load(keepFilter = false) {
  showLoading();
  try {
    const [data, counts] = await Promise.all([fetchItems(), fetchCounts()]);
    state.groups = data.groups;
    state.total = data.total;
    state.focusedIndex = 0;
    if (!keepFilter) state.activeDomain = null;
    updateCounts(counts);
    render();
  } catch {
    showError();
  }
}

function updateCounts(counts) {
  document.getElementById('count-inbox').textContent = counts.inbox || 0;
  document.getElementById('count-saved').textContent = counts.saved || 0;
  document.getElementById('count-archive').textContent = counts.archive || 0;
}

function showLoading() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('caught-up').classList.add('hidden');
  document.getElementById('error-state').classList.add('hidden');
  document.getElementById('groups').innerHTML = '';
}

function showError() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('caught-up').classList.add('hidden');
  document.getElementById('error-state').classList.remove('hidden');
  document.getElementById('groups').innerHTML = '';
}

function renderFilterBar() {
  const bar = document.getElementById('domain-bar');

  if (state.groupBy === 'time') {
    // Period selector
    bar.classList.remove('hidden');
    bar.innerHTML = '';
    const periods = [
      { key: 'this-week',    label: 'This week' },
      { key: 'last-week',   label: 'Last week' },
      { key: 'this-month',  label: 'This month' },
      { key: 'this-quarter', label: 'This quarter' },
      { key: 'all',         label: 'All time' },
    ];
    for (const p of periods) {
      const pill = document.createElement('button');
      pill.className = 'domain-pill' + (state.timePeriod === p.key ? ' active' : '');
      pill.textContent = p.label;
      pill.addEventListener('click', () => { state.timePeriod = p.key; render(); });
      bar.appendChild(pill);
    }
    if (state.smartMode) {
      const sortBtn = document.createElement('button');
      sortBtn.className = 'sort-pill' + (state.sortBy === 'score' ? ' active' : '');
      sortBtn.textContent = state.sortBy === 'score' ? '↓ Score' : '↓ Date';
      sortBtn.title = 'Toggle sort order';
      sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.sortBy = state.sortBy === 'date' ? 'score' : 'date';
        render();
      });
      bar.appendChild(sortBtn);
    }
    return;
  }

  // Domain / tag filter pills
  if (state.groups.length === 0) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.innerHTML = '';

  const allPill = document.createElement('button');
  allPill.className = 'domain-pill' + (!state.activeDomain ? ' active' : '');
  allPill.textContent = `All ${state.total}`;
  allPill.addEventListener('click', () => { state.activeDomain = null; render(); });
  bar.appendChild(allPill);

  for (const g of state.groups) {
    const pill = document.createElement('button');
    pill.className = 'domain-pill' + (state.activeDomain === g.key ? ' active' : '');
    pill.dataset.key = g.key;

    if (state.groupBy === 'domain') {
      const img = document.createElement('img');
      img.className = 'pill-favicon';
      img.src = faviconUrl(g.key);
      img.onerror = () => {
        const fb = document.createElement('div');
        fb.className = 'pill-favicon-fallback';
        fb.textContent = g.key.charAt(0).toUpperCase();
        img.replaceWith(fb);
      };
      pill.appendChild(img);
    }

    pill.appendChild(document.createTextNode(g.key));
    const cnt = document.createElement('span');
    cnt.className = 'pill-count';
    cnt.textContent = ` ${g.count}`;
    pill.appendChild(cnt);

    pill.addEventListener('click', () => {
      state.activeDomain = state.activeDomain === g.key ? null : g.key;
      render();
    });
    bar.appendChild(pill);
  }

  // Sort pill — far right, only when Smart Mode is on
  if (state.smartMode) {
    const sortBtn = document.createElement('button');
    sortBtn.className = 'sort-pill' + (state.sortBy === 'score' ? ' active' : '');
    sortBtn.textContent = state.sortBy === 'score' ? '↓ Score' : '↓ Date';
    sortBtn.title = 'Toggle sort order';
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.sortBy = state.sortBy === 'date' ? 'score' : 'date';
      render();
    });
    bar.appendChild(sortBtn);
  }
}

function render() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('error-state').classList.add('hidden');

  const groupsEl = document.getElementById('groups');
  const caughtUp = document.getElementById('caught-up');

  renderFilterBar();

  if (state.total === 0) {
    groupsEl.innerHTML = '';
    caughtUp.classList.remove('hidden');
    const sub = document.getElementById('caught-up-sub');

    // Tailor message to the current folder
    if (state.folder === 'Inbox') {
      // Show saved count as a link
      const savedCount = parseInt(document.getElementById('count-saved').textContent) || 0;
      sub.innerHTML = savedCount > 0
        ? `<a href="#" id="go-saved">${savedCount} item${savedCount !== 1 ? 's' : ''} saved for later →</a>`
        : 'Nothing in your inbox';
      const goSaved = document.getElementById('go-saved');
      if (goSaved) goSaved.addEventListener('click', (e) => { e.preventDefault(); switchFolder('Saved'); });
    } else if (state.folder === 'Saved') {
      sub.textContent = 'Your reading queue is empty';
    } else {
      sub.textContent = 'Archive is empty';
    }
    return;
  }

  caughtUp.classList.add('hidden');

  const items = flatItems();

  groupsEl.innerHTML = '';
  groupsEl.style.display = '';

  for (const group of visibleGroups()) {
    const groupEl = document.createElement('div');
    groupEl.className = 'group';
    groupEl.dataset.key = group.key;

    // Group header
    const header = document.createElement('div');
    header.className = 'group-header';

    if (state.groupBy === 'domain') {
      // Favicon
      const img = document.createElement('img');
      img.className = 'group-favicon';
      img.src = faviconUrl(group.key);
      img.onerror = () => {
        const fallback = document.createElement('div');
        fallback.className = 'group-favicon-fallback';
        fallback.textContent = group.key.charAt(0).toUpperCase();
        img.replaceWith(fallback);
      };
      header.appendChild(img);
      // Domain label
      const label = document.createElement('span');
      label.className = 'group-label';
      label.textContent = group.key;
      header.appendChild(label);
    } else if (state.groupBy === 'tag') {
      // Tag chip only (chip IS the label)
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = `#${group.key.replace(/^#/, '')}`;
      header.appendChild(chip);
    } else {
      // Time or smart — italic label
      const label = document.createElement('span');
      label.className = 'group-label group-label-time';
      label.textContent = group.label || group.key;
      header.appendChild(label);
    }

    const count = document.createElement('span');
    count.className = 'group-count';
    count.textContent = `${group.count} item${group.count !== 1 ? 's' : ''}`;
    header.appendChild(count);

    if (state.folder === 'Inbox') {
      const archiveAllBtn = document.createElement('button');
      archiveAllBtn.className = 'archive-all-btn';
      archiveAllBtn.textContent = `Archive all ${group.count}`;
      archiveAllBtn.addEventListener('click', () => archiveGroup(group));
      header.appendChild(archiveAllBtn);
    }

    groupEl.appendChild(header);

    // Items (sorted within group)
    for (const item of sortGroupItems(group.items)) {
      const flatIdx = items.indexOf(item);
      const itemEl = buildItemEl(item, flatIdx);
      groupEl.appendChild(itemEl);
    }

    groupsEl.appendChild(groupEl);
  }

  updateFocus();
}

function buildItemEl(item, flatIdx) {
  const el = document.createElement('div');
  const highScore = state.smartMode && item.relevanceScore >= 8;
  el.className = 'item' + (highScore ? ' score-high' : '');
  el.dataset.id = item.id;
  el.dataset.idx = flatIdx;

  // Thumbnail: YouTube image or typographic article tile
  const thumb = getYoutubeThumbnail(item.url);
  if (thumb) {
    const img = document.createElement('img');
    img.className = 'item-thumbnail';
    img.src = thumb;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => img.replaceWith(buildThumbTile(item));
    el.appendChild(img);
  } else {
    el.appendChild(buildThumbTile(item));
  }

  // Title + timestamp column
  const textCol = document.createElement('div');
  textCol.className = 'item-text-col';

  const title = document.createElement('div');
  title.className = 'item-title' + (item.extractionFailed ? ' item-failed' : '');
  title.textContent = item.title;
  textCol.appendChild(title);

  const timeSub = document.createElement('div');
  timeSub.className = 'item-time-sub';
  timeSub.textContent = relativeTime(item.savedAt);
  textCol.appendChild(timeSub);

  el.appendChild(textCol);

  // Meta (right side)
  const meta = document.createElement('div');
  meta.className = 'item-meta';

  // Tags (domain + time view)
  if (state.groupBy !== 'tag' && item.tags.length) {
    const tagsEl = document.createElement('div');
    tagsEl.className = 'item-tags';
    for (const tag of item.tags.slice(0, 2)) {
      const chip = document.createElement('span');
      chip.className = 'item-tag';
      chip.textContent = tag.replace(/^#/, '');
      tagsEl.appendChild(chip);
    }
    meta.appendChild(tagsEl);
  }

  // Domain badge (tag + time view, so you don't lose source context)
  if (state.groupBy !== 'domain') {
    const domain = document.createElement('span');
    domain.className = 'item-domain';
    domain.textContent = item.domain || item.site;
    meta.appendChild(domain);
  }

  // Note
  if (item.note) {
    const note = document.createElement('span');
    note.className = 'item-note';
    note.textContent = `"${item.note}"`;
    meta.appendChild(note);
  }

  // Read time
  if (item.readingTimeMin) {
    const rt = document.createElement('span');
    rt.className = 'item-read-time';
    rt.textContent = `${item.readingTimeMin}m`;
    meta.appendChild(rt);
  }

  // Score bar (smart mode — subtle signal on all views)
  if (state.smartMode && item.relevanceScore !== null && item.relevanceScore !== undefined) {
    const s = item.relevanceScore;
    const isHigh = s >= 8;
    const wrap = document.createElement('div');
    wrap.className = 'item-score-wrap';
    const bar = document.createElement('div');
    bar.className = 'item-score-bar';
    const fill = document.createElement('div');
    fill.className = 'item-score-fill' + (isHigh ? ' high' : '');
    fill.style.width = (s * 10) + '%';
    bar.appendChild(fill);
    const num = document.createElement('span');
    num.className = 'item-score-num' + (isHigh ? ' high' : '');
    num.textContent = s;
    wrap.appendChild(bar);
    wrap.appendChild(num);
    meta.appendChild(wrap);
  }

  el.appendChild(meta);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'item-actions';

  if (state.folder !== 'Saved') {
    const saveBtn = buildActionBtn('📖', 'save', 'Save for later');
    saveBtn.addEventListener('click', (e) => { e.stopPropagation(); triggerAction(item, 'save'); });
    actions.appendChild(saveBtn);
  }

  if (state.folder !== 'Archive') {
    const archBtn = buildActionBtn('🗃', 'archive', 'Archive');
    archBtn.addEventListener('click', (e) => { e.stopPropagation(); triggerAction(item, 'archive'); });
    actions.appendChild(archBtn);
  }

  if (state.folder === 'Inbox') {
    const trashBtn = buildActionBtn('✕', 'trash', 'Trash');
    trashBtn.addEventListener('click', (e) => { e.stopPropagation(); triggerAction(item, 'trash'); });
    actions.appendChild(trashBtn);
  }

  if (state.folder !== 'Inbox') {
    const backBtn = buildActionBtn('↩', 'inbox', 'Move back to Inbox');
    backBtn.addEventListener('click', (e) => { e.stopPropagation(); triggerAction(item, 'inbox'); });
    actions.appendChild(backBtn);
  }

  el.appendChild(actions);

  // Click → open original URL
  el.addEventListener('click', () => {
    window.open(item.url, '_blank');
  });

  return el;
}

function buildActionBtn(icon, cls, title) {
  const btn = document.createElement('button');
  btn.className = `action-btn ${cls}`;
  btn.title = title;
  btn.textContent = icon;
  return btn;
}

// ── Focus management ──────────────────────────────────────────────────────────
function updateFocus() {
  document.querySelectorAll('.item').forEach((el) => el.classList.remove('focused'));
  const items = document.querySelectorAll('.item');
  if (items.length === 0) return;
  const idx = Math.min(state.focusedIndex, items.length - 1);
  state.focusedIndex = idx;
  const focused = items[idx];
  if (focused) {
    focused.classList.add('focused');
    focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function focusDelta(delta) {
  const items = document.querySelectorAll('.item');
  if (!items.length) return;
  state.focusedIndex = Math.max(0, Math.min(state.focusedIndex + delta, items.length - 1));
  updateFocus();
}

function focusedItem() {
  const items = flatItems();
  return items[state.focusedIndex] || null;
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function triggerAction(item, action) {
  // Animate removal
  const el = document.querySelector(`.item[data-id="${item.id}"]`);
  if (el) {
    el.classList.add('removing');
    await new Promise((r) => setTimeout(r, 230));
  }

  // Optimistically remove from state
  for (const g of state.groups) {
    const idx = g.items.findIndex((i) => i.id === item.id);
    if (idx !== -1) g.items.splice(idx, 1);
  }
  state.groups = state.groups.filter((g) => g.items.length > 0);
  state.total = flatItems().length;

  // Re-render
  render();
  updateFocus();

  // Store for undo (not for trash — can't recover deleted files)
  if (action !== 'trash') {
    state.lastAction = { id: item.id, action, title: item.title };
    showToast(`${actionLabel(action)}: "${item.title.slice(0, 40)}${item.title.length > 40 ? '…' : ''}"`);
  } else {
    state.lastAction = null;
    showToast(`Trashed: "${item.title.slice(0, 40)}…"`, false);
  }

  // API call
  try {
    await doAction(item.id, action);
    // Refresh counts
    const counts = await fetchCounts();
    updateCounts(counts);
  } catch {
    showToast('Error — action may not have saved', false);
  }
}

function actionLabel(action) {
  if (action === 'save') return 'Saved';
  if (action === 'archive') return 'Archived';
  if (action === 'inbox') return 'Moved to Inbox';
  return action;
}

async function archiveGroup(group) {
  const ids = [...group.items.map((i) => i.id)];
  for (const id of ids) {
    const item = group.items.find((i) => i.id === id);
    if (item) await triggerAction(item, 'archive');
  }
}

// ── Undo ──────────────────────────────────────────────────────────────────────
async function undo() {
  if (!state.lastAction) return;
  const { id, action, title } = state.lastAction;
  state.lastAction = null;
  hideToast();

  // Reverse action
  const reverseAction = action === 'inbox' ? 'inbox' : 'inbox';
  try {
    await doAction(id, reverseAction);
    showToast(`Undone: moved "${title.slice(0, 30)}…" back to Inbox`, false);
    await load();
  } catch {
    showToast('Undo failed', false);
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, canUndo = true) {
  clearTimeout(state.toastTimer);
  const toast = document.getElementById('toast');
  const undoBtn = document.getElementById('toast-undo');
  document.getElementById('toast-msg').textContent = msg;
  undoBtn.style.display = canUndo && state.lastAction ? 'block' : 'none';
  toast.classList.remove('hidden');
  state.toastTimer = setTimeout(hideToast, 4000);
}

function hideToast() {
  document.getElementById('toast').classList.add('hidden');
}

// ── Navigation ────────────────────────────────────────────────────────────────
function switchFolder(folder) {
  state.folder = folder;
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.folder === folder);
  });
  load();
}

function toggleGroupBy(groupBy) {
  if (groupBy) {
    state.groupBy = groupBy;
  } else {
    // Cycle: domain → tag → time → domain
    if (state.groupBy === 'domain') state.groupBy = 'tag';
    else if (state.groupBy === 'tag') state.groupBy = 'time';
    else state.groupBy = 'domain';
  }
  state.activeDomain = null;
  document.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.group === state.groupBy);
  });
  // Time view re-groups client-side; domain/tag need fresh API data
  if (state.groupBy === 'time') render();
  else load();
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  const overlay = document.getElementById('help-overlay');
  const overlayVisible = !overlay.classList.contains('hidden');

  if (e.key === 'Escape') {
    document.getElementById('settings-overlay').classList.add('hidden');
    if (overlayVisible) overlay.classList.add('hidden');
    hideToast();
    return;
  }

  if (overlayVisible) return;

  // Don't intercept when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      e.preventDefault();
      focusDelta(1);
      break;

    case 'k':
    case 'ArrowUp':
      e.preventDefault();
      focusDelta(-1);
      break;

    case 's': {
      const item = focusedItem();
      if (item && state.folder !== 'Saved') triggerAction(item, 'save');
      break;
    }

    case 'e': {
      const item = focusedItem();
      if (item && state.folder !== 'Archive') triggerAction(item, 'archive');
      break;
    }

    case 'x': {
      const item = focusedItem();
      if (item && state.folder === 'Inbox') triggerAction(item, 'trash');
      break;
    }

    case 'o': {
      const item = focusedItem();
      if (item) window.open(item.url, '_blank');
      break;
    }

    case 'Enter': {
      const item = focusedItem();
      if (item) window.open(obsidianUrl(item.id), '_blank');
      break;
    }

    case 'u':
      undo();
      break;

    case 't':
      toggleGroupBy();
      break;

    case '1':
      switchFolder('Inbox');
      break;

    case '2':
      switchFolder('Saved');
      break;

    case '3':
      switchFolder('Archive');
      break;

    case '?':
      overlay.classList.remove('hidden');
      break;

    case 'a': {
      e.preventDefault();
      const urlInput = document.getElementById('url-input');
      urlInput.focus();
      urlInput.select();
      break;
    }
  }
});

// ── Event listeners ───────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => switchFolder(btn.dataset.folder));
});

document.querySelectorAll('.toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => toggleGroupBy(btn.dataset.group));
});


document.getElementById('help-btn').addEventListener('click', () => {
  document.getElementById('help-overlay').classList.remove('hidden');
});

document.getElementById('overlay-close').addEventListener('click', () => {
  document.getElementById('help-overlay').classList.add('hidden');
});

document.getElementById('toast-undo').addEventListener('click', undo);

document.getElementById('help-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.add('hidden');
  }
});

// ── Add URL ───────────────────────────────────────────────────────────────────
async function addUrl(url) {
  const input = document.getElementById('url-input');
  const btn = document.getElementById('url-submit');
  input.disabled = true;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const res = await fetch(`${API}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    input.value = '';
    if (data.duplicate) {
      showToast('Already in your vault', false);
    } else {
      showToast('Saved to Inbox ✓', false);
      if (state.folder === 'Inbox') await load(true);
      else {
        const counts = await fetchCounts();
        updateCounts(counts);
      }
    }
  } catch {
    showToast('Could not save — is the RIL service running?', false);
  } finally {
    input.disabled = false;
    btn.disabled = false;
    btn.textContent = 'Save';
    input.focus();
  }
}

document.getElementById('url-submit').addEventListener('click', () => {
  const url = document.getElementById('url-input').value.trim();
  if (url) addUrl(url);
});

document.getElementById('url-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const url = e.target.value.trim();
    if (url) addUrl(url);
  }
});

// ── Smart Mode ────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch(`${API}/api/settings`);
    if (!res.ok) return;
    const s = await res.json();
    state.smartMode = !!s.smartMode;
    document.getElementById('smart-mode-toggle').checked = state.smartMode;
    applySmartMode();
  } catch {}
}

async function saveSettingsToServer() {
  try {
    await fetch(`${API}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smartMode: state.smartMode }),
    });
  } catch {}
}

async function loadProfile() {
  try {
    const res = await fetch(`${API}/api/profile`);
    if (!res.ok) { state.profile = null; return; }
    state.profile = await res.json();
    renderProfileInOverlay();
  } catch { state.profile = null; }
}

function applySmartMode() {
  const profileSection = document.getElementById('profile-section');
  document.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.group === state.groupBy);
  });

  if (state.smartMode) {
    profileSection.classList.remove('hidden');
  } else {
    profileSection.classList.add('hidden');
    state.sortBy = 'date';
  }
}

function renderProfileInOverlay() {
  if (!state.profile) return;
  document.getElementById('profile-summary-text').textContent = state.profile.summary || '—';
  const list = document.getElementById('profile-topics-list');
  list.innerHTML = '';
  for (const topic of (state.profile.topics || [])) {
    const chip = document.createElement('span');
    chip.className = 'profile-topic-chip';
    chip.textContent = topic;
    list.appendChild(chip);
  }
  if (state.profile.generatedAt) {
    document.getElementById('profile-age').textContent = `Updated ${relativeTime(state.profile.generatedAt)}`;
  }
}

// Settings overlay
document.getElementById('settings-btn').addEventListener('click', () => {
  document.getElementById('settings-overlay').classList.remove('hidden');
});
document.getElementById('settings-close').addEventListener('click', () => {
  document.getElementById('settings-overlay').classList.add('hidden');
});
document.getElementById('settings-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

// Smart mode toggle
document.getElementById('smart-mode-toggle').addEventListener('change', async (e) => {
  state.smartMode = e.target.checked;
  await saveSettingsToServer();
  applySmartMode();
  if (state.smartMode && !state.profile) {
    // Auto-build profile on first enable
    document.getElementById('profile-regen-btn').click();
  }
});

// Profile regenerate
document.getElementById('profile-regen-btn').addEventListener('click', async () => {
  const btn = document.getElementById('profile-regen-btn');
  btn.textContent = 'Building profile…';
  btn.disabled = true;
  try {
    const res = await fetch(`${API}/api/profile/refresh`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      state.profile = data;
      renderProfileInOverlay();
      // If items are being scored in background, reload after a delay
      if (data.unscoredCount > 0) {
        btn.textContent = `Scoring ${data.unscoredCount} items…`;
        const perItem = 1500; // ~1.5s per LLM call
        const wait = Math.min(data.unscoredCount * perItem, 30000);
        setTimeout(() => { load(true); }, wait);
      }
    }
  } catch {}
  btn.textContent = 'Regenerate';
  btn.disabled = false;
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  await loadSettings();
  load();
  if (state.smartMode) loadProfile();
})();
