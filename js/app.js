(function (global) {
  // Theme setup
  const THEME_KEY = 'motsa_jiki_theme';
  
  function getStoredTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  }
  
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    updateThemeIcon(theme);
  }

  function updateThemeIcon(theme) {
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
      // Show moon for dark, sun for light
      const use = themeIcon.querySelector('use');
      if (use) use.setAttribute('href', '/icons/icons.svg#icon-' + (theme === 'dark' ? 'bedtime' : 'light_mode'));
    }
  }

  // Attach click listener for theme toggle button
  function wireThemeControls() {
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        // Fallback to 'light' if attribute is missing
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
      });
    }
    updateThemeIcon(getStoredTheme());
  }

  // Set initial theme before layout render to prevent flicker
  setTheme(getStoredTheme());

  // Build inline SVG markup referencing the shared /icons/icons.svg sprite.
  // Used anywhere an icon name comes from data (badges, task templates) rather
  // than being hardcoded in markup. opts: { size: px, id: 'dom-id' }
  function iconSvg(name, opts = {}) {
    const sizeAttr = opts.size ? ` style="width:${opts.size}px;height:${opts.size}px;"` : '';
    const idAttr = opts.id ? ` id="${opts.id}"` : '';
    return `<svg class="icon"${idAttr}${sizeAttr}><use href="/icons/icons.svg#icon-${escapeHtml(name)}"></use></svg>`;
  }

  // Escape HTML characters to prevent XSS
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Format date object to YYYY-MM-DD string
  function localDateISO(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Extract current page file name from URL path
  function currentPageName() {
    let page = (location.pathname.split('/').pop() || 'index.html');
    if (page === '' || page === '/') page = 'index.html';
    if (!page.endsWith('.html')) page += '.html';
    return page;
  }

  // Inject top header and bottom navigation elements into DOM
  function injectChrome() {
    if (!document.querySelector('header.topbar')) {
      const page = currentPageName();
      const syncHref = (page === 'index.html') ? '#sync-controls' : '/#sync-controls';
      const header = document.createElement('header');
      header.className = 'topbar';
      header.innerHTML =
        '<div class="brand">' +
          '<svg class=\"icon\"><use href=\"/icons/icons.svg#icon-fitness_center\"></use></svg>' +
          ' MOTSA JIKI' +
        '</div>' +
        '<div style="display: flex; gap: 8px;">' +
          '<a class="icon-btn" href="/help" aria-label="Help and Legal Information">' +
            '<svg class=\"icon\"><use href=\"/icons/icons.svg#icon-help_outline\"></use></svg>' +
           '</a>' +
          '<button class="icon-btn" id="theme-toggle-btn" aria-label="Toggle Theme">' +
            '<svg class=\"icon\" id=\"theme-icon\"><use href=\"/icons/icons.svg#icon-bedtime\"></use></svg>' +
          '</button>' +
          '<a class="icon-btn" href="' + syncHref + '" aria-label="Sync status">' +
            '<svg class=\"icon\"><use href=\"/icons/icons.svg#icon-cloud_sync\"></use></svg>' +
          '</a>' +
        '</div>';
      document.body.insertBefore(header, document.body.firstChild);
    }

    if (!document.querySelector('nav.bottom-nav')) {
      const nav = document.createElement('nav');
      nav.className = 'bottom-nav';
      nav.innerHTML =
        '<a class="nav-item" data-nav-link="index.html" href="/">' +
          '<svg class=\"icon\"><use href=\"/icons/icons.svg#icon-event_note\"></use></svg>Log' +
        '</a>' +
        '<a class="nav-item" data-nav-link="overview.html" href="/overview">' +
          '<svg class=\"icon\"><use href=\"/icons/icons.svg#icon-monitoring\"></use></svg>Data' +
        '</a>' +
        '<a class="nav-item" data-nav-link="goals.html" href="/goals">' +
          '<svg class=\"icon\"><use href=\"/icons/icons.svg#icon-emoji_events\"></use></svg>Goals' +
        '</a>' +
        '<a class="nav-item" data-nav-link="milestone.html" href="/milestone">' +
          '<svg class=\"icon\"><use href=\"/icons/icons.svg#icon-military_tech\"></use></svg>Badges' +
        '</a>';
      document.body.appendChild(nav);
    }
  }

  // ---------------------------------------------------------------------
  // SPA Router: swaps <main> content on internal navigation instead of a
  // full page reload. Core scripts (schema/db/filesystem/gdrive/sync/app)
  // stay loaded and keep their in-memory state (StorageController, gdrive
  // auth, etc); only the page-specific script (log.js, goals.js,
  // overview.js, badges.js — or none, for help/terms/privacy) is swapped
  // out and re-executed against the freshly swapped-in markup.
  // ---------------------------------------------------------------------

  // Scripts shared by every page. Never removed/re-injected on navigation.
  const SHARED_SCRIPTS = new Set([
    'js/schema.js', 'js/db.js', 'js/filesystem.js',
    'js/gdrive.js', 'js/sync.js', 'js/app.js'
  ]);

  // Tracks the currently-injected page-specific <script> element(s), if any,
  // so they can be removed and replaced when navigating to a new page.
  let currentPageScriptEls = [];

  // Clears all subscribers to StorageController state changes. Safe to call
  // on every navigation because each page script registers at most one
  // MotsaJiki.onData() listener of its own — nothing global depends on it.
  function resetDataListeners() {
    dataListeners.length = 0;
  }

  // Re-applies per-page DOM hydration that would otherwise only run once on
  // initial load: active-nav highlighting, sync control wiring/status
  // (index.html only), and the today's-date label (index.html only).
  function hydratePage() {
    highlightActiveNav();
    wireSyncControls();
    refreshSyncStatusUI();
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
    }
  }

  // Removes the previous page's dedicated script (if any) and injects/executes
  // the new page's dedicated script (if any), found by diffing the fetched
  // document's <script src> tags against SHARED_SCRIPTS.
  function swapPageScript(newDoc) {
    currentPageScriptEls.forEach(el => el.remove());
    currentPageScriptEls = [];
    resetDataListeners();

    const newSrcs = Array.from(newDoc.querySelectorAll('script[src]'))
      .map(el => el.getAttribute('src'))
      .filter(src => src && !SHARED_SCRIPTS.has(src));

    newSrcs.forEach(src => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false; // preserve document order / synchronous-style execution
      document.body.appendChild(script);
      currentPageScriptEls.push(script);
    });
  }

  // Scrolls to a hash target (e.g. #sync-controls) or, absent a hash, to
  // the top of the page — matching normal browser navigation behavior.
  function scrollToTarget(hash) {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) { el.scrollIntoView({ behavior: 'smooth' }); return; }
    }
    window.scrollTo(0, 0);
  }

  // Navigates to an internal URL by fetching its markup and swapping <main>,
  // instead of triggering a full page reload. Falls back to a real
  // navigation if anything about the fetch/parse goes wrong.
  async function navigateTo(url, { push = true } = {}) {
    const target = new URL(url, location.href);

    if (target.origin !== location.origin) {
      location.href = url;
      return;
    }

    // Same page, just a different (or absent) hash — no fetch needed.
    if (target.pathname === location.pathname) {
      if (push) history.pushState({ url: target.href }, '', target.href);
      scrollToTarget(target.hash);
      return;
    }

    let html;
    try {
      const res = await fetch(target.pathname);
      if (!res.ok) throw new Error(`Navigation fetch failed: ${res.status}`);
      html = await res.text();
    } catch (err) {
      console.warn('[router] fetch failed, falling back to full navigation', err);
      location.href = url;
      return;
    }

    const newDoc = new DOMParser().parseFromString(html, 'text/html');
    const newMain = newDoc.querySelector('main');
    const oldMain = document.querySelector('main');
    if (!newMain || !oldMain) {
      location.href = url;
      return;
    }

    document.title = newDoc.title || document.title;
    oldMain.replaceWith(newMain);

    if (push) history.pushState({ url: target.href }, '', target.href);

    hydratePage();
    swapPageScript(newDoc);
    scrollToTarget(target.hash);
  }

  // Intercepts clicks on same-origin, same-tab links (nav items, header
  // links, in-content links like help.html's privacy/terms rows) and routes
  // them through navigateTo() instead of letting the browser navigate.
  function wireRouterLinks() {
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = e.target.closest('a[href]');
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return; // e.g. target="_blank"
      if (anchor.hasAttribute('download')) return;

      let url;
      try { url = new URL(anchor.getAttribute('href'), location.href); }
      catch { return; }
      if (url.origin !== location.origin) return;

      e.preventDefault();
      navigateTo(url.href);
    });

    window.addEventListener('popstate', () => {
      navigateTo(location.href, { push: false });
    });
  }

  // Display temporary notification message
  function toast(message, tone = 'default') {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${tone}`;
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, 3000);
  }

  // Update visual active state for navigation links
  function highlightActiveNav() {
    const page = currentPageName();
    document.querySelectorAll('[data-nav-link]').forEach(link => {
      const target = link.getAttribute('data-nav-link');
      link.classList.toggle('nav-active', target === page);
    });
  }

  // Update visual status indicator class
  function setDot(el, state) {
    if (!el) return;
    el.classList.remove('dot-on', 'dot-off', 'dot-warn');
    el.classList.add(state === 'on' ? 'dot-on' : state === 'warn' ? 'dot-warn' : 'dot-off');
  }

  // Refresh status indicators for local storage and remote sync
  async function refreshSyncStatusUI() {
    const localDot = document.querySelector('[data-dot="local"]');
    const driveDot = document.querySelector('[data-dot="drive"]');
    const localLabel = document.querySelector('[data-label="local"]');
    const driveLabel = document.querySelector('[data-label="drive"]');
    const pending = await StorageController.pendingStatus();

    const hasHandle = FileSystemEngine.hasHandle ? FileSystemEngine.hasHandle() : false;
    const isConnected = FileSystemEngine.isConnected();

    if (hasHandle) {
      const name = FileSystemEngine.folderName() || 'Local Folder';
      if (isConnected) {
        setDot(localDot, pending.fs ? 'warn' : 'on');
        if (localLabel) localLabel.textContent = pending.fs ? `${name} (retrying...)` : name;
      } else {
        setDot(localDot, 'warn'); 
        if (localLabel) localLabel.textContent = `${name} (reconnect needed)`;
      }
    } else {
      setDot(localDot, 'off');
      if (localLabel) localLabel.textContent = 'Local Folder';
    }

    if (GDriveEngine.isConnected()) {
      setDot(driveDot, pending.drive ? 'warn' : 'on');
      if (driveLabel) driveLabel.textContent = pending.drive ? 'Google Drive (retrying...)' : 'Google Drive (connected)';
    } else if (GDriveEngine.hasEverConnected()) {
      setDot(driveDot, 'warn');
      if (driveLabel) driveLabel.textContent = 'Google Drive (reconnect needed)';
    } else {
      setDot(driveDot, 'off');
      if (driveLabel) driveLabel.textContent = 'Google Drive';
    }
  }

  // Toggle local filesystem connection and trigger sync
  async function handleLocalSyncClick() {
    if (!FileSystemEngine.isSupported()) {
      toast('File System Access API not supported in this browser. Try desktop Chrome or Edge.', 'warn');
      return;
    }
    try {
      if (FileSystemEngine.isConnected()) {
        await FileSystemEngine.disconnect();
        toast('Local folder disconnected.');
      } else {
        const restored = await FileSystemEngine.restore();
        if (restored === 'needs-permission') {
          const ok = await FileSystemEngine.reconnect();
          if (!ok) { toast('Permission denied.', 'warn'); return; }
        } else if (restored === 'none') {
          await FileSystemEngine.connect();
        }
        toast('Local folder connected.');
      }
      await StorageController.pullAndMerge();
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        console.error(err);
        toast('Could not connect local folder.', 'warn');
      }
    }
    refreshSyncStatusUI();
  }

  // Toggle Google Drive connection and trigger sync
  async function handleDriveSyncClick() {
    if (GDriveEngine.isConnected()) {
      GDriveEngine.signOut();
      toast('Google Drive disconnected.');
      refreshSyncStatusUI();
      return;
    }
    if (!GDriveEngine.getClientId()) {
      toast('Google Drive is not configured yet.', 'warn');
      return;
    }
    try {
      await GDriveEngine.signIn();
      toast('Google Drive connected.');
      await StorageController.pullAndMerge();
    } catch (err) {
      console.error(err);
      toast('Google Drive connection failed.', 'warn');
    }
    refreshSyncStatusUI();
  }

  // Attach event listeners to sync trigger buttons
  function wireSyncControls() {
    document.querySelectorAll('[data-action="sync-local"]').forEach(btn =>
      btn.addEventListener('click', handleLocalSyncClick));
    document.querySelectorAll('[data-action="sync-drive"]').forEach(btn =>
      btn.addEventListener('click', handleDriveSyncClick));
  }

  // Render input fields for template metrics
  function renderTemplateFields(template, container, existingValues = {}) {
    container.innerHTML = '';
    template.fields.forEach(field => {
      const wrap = document.createElement('div');
      wrap.className = 'metric-input-container';
      const label = document.createElement('span');
      label.className = 'metric-input-label';
      label.textContent = field.unit ? `${field.label} (${field.unit})` : field.label;
      const input = document.createElement('input');
      input.className = 'metric-input';
      input.dataset.fieldKey = field.key;
      input.type = field.type === 'number' ? 'number' : 'text';
      if (field.type === 'number') input.inputMode = 'decimal';
      input.placeholder = field.type === 'number' ? '0' : '';
      if (existingValues[field.key] !== undefined) input.value = existingValues[field.key];
      wrap.appendChild(label);
      wrap.appendChild(input);
      container.appendChild(wrap);
    });
  }

  // Extract populated input values from template container
  function readTemplateFields(container) {
    const metrics = {};
    container.querySelectorAll('[data-field-key]').forEach(input => {
      if (input.value === '') return;
      metrics[input.dataset.fieldKey] = input.type === 'number' ? Number(input.value) : input.value;
    });
    return metrics;
  }

  const dataListeners = [];

  // Register data change subscriber
  function onData(fn) { 
    dataListeners.push(fn); 
    if (StorageController.getState()) fn(StorageController.getState()); 
  }

  // Initialize application services and lifecycle handlers on load
  document.addEventListener('DOMContentLoaded', async () => {
    injectChrome();
    wireThemeControls();
    hydratePage();

    // Snapshot whichever page-specific <script> tag was statically loaded
    // with this initial page, so the router can remove/replace it on the
    // first SPA navigation. It already ran (browsers execute non-deferred
    // scripts in document order before DOMContentLoaded), so it's left
    // alone here — just tracked for later cleanup.
    currentPageScriptEls = Array.from(document.querySelectorAll('script[src]'))
      .filter(el => !SHARED_SCRIPTS.has(el.getAttribute('src')));
    history.replaceState({ url: location.href }, '', location.href);
    wireRouterLinks();

    StorageController.subscribe(state => {
      if (!state) return;
      dataListeners.forEach(fn => fn(state));
    });

    await StorageController.init();
    showWeeklyRecap();
    refreshSyncStatusUI();

    if (FileSystemEngine.hasHandle && FileSystemEngine.hasHandle() && !FileSystemEngine.isConnected()) {
      try {
        await FileSystemEngine.reconnect();
        await StorageController.pullAndMerge();
        refreshSyncStatusUI();
      } catch (_) {
      }
    }

    setInterval(() => StorageController.flushPending().then(refreshSyncStatusUI), 30000);
    window.addEventListener('online', () => StorageController.pullAndMerge().then(refreshSyncStatusUI));
    window.addEventListener('focus', () => StorageController.flushPending().then(refreshSyncStatusUI));
  });

  // Render performance summary canvas and trigger PNG download
  async function exportPerformanceImage() {
    try {
      await Promise.all([
        document.fonts.load('bold 52px "Archivo Narrow"'),
        document.fonts.load('bold 56px "Archivo Narrow"'),
        document.fonts.load('bold 36px "Archivo Narrow"'),
        document.fonts.load('bold 28px "Archivo Narrow"'),
        document.fonts.load('24px "JetBrains Mono"'),
        document.fonts.load('20px "JetBrains Mono"'),
        document.fonts.load('18px "JetBrains Mono"'),
        document.fonts.load('24px "Inter"'),
        document.fonts.load('22px "Inter"')
      ]);
    } catch (e) { }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const W = 1080, H = 1350;
    canvas.width = W; 
    canvas.height = H;

    // Fetch design tokens from computed root styles for UI alignment
    const computed = getComputedStyle(document.documentElement);
    const bg = computed.getPropertyValue('--bg').trim() || '#0f172a';
    const level1 = computed.getPropertyValue('--level-1').trim() || '#1e293b';
    const border = computed.getPropertyValue('--border').trim() || '#334155';
    const primary = computed.getPropertyValue('--primary').trim() || '#6366f1';
    const onSurface = computed.getPropertyValue('--on-surface').trim() || '#f8fafc';
    const onSurfaceVariant = computed.getPropertyValue('--on-surface-variant').trim() || '#94a3b8';

    // Canvas Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Outer Border Frame
    ctx.strokeStyle = border;
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 32, W - 64, H - 64);

    // Header Branding
    ctx.fillStyle = primary;
    ctx.font = 'bold 48px "Archivo Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MOTSA JIKI', W / 2, 110);

    // Header Date
    ctx.fillStyle = onSurfaceVariant;
    ctx.font = '22px "JetBrains Mono", monospace';
    ctx.fillText(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase(), W / 2, 150);

    // 3-Column Metrics Layout (Centered Grid)
    const stats = [
      { label: 'CURRENT STREAK', value: StorageController.currentStreak() + ' DAYS' },
      { label: 'TOTAL VOLUME', value: Math.round(StorageController.totalVolume()).toLocaleString() },
      { label: 'WORKOUTS', value: StorageController.activeLogs().length.toString() }
    ];

    const colWidth = (W - 120) / 3;
    const statsY = 220;

    stats.forEach((s, idx) => {
      const cx = 60 + (colWidth * idx) + (colWidth / 2);
      
      // Stat Box Background
      ctx.fillStyle = level1;
      ctx.beginPath();
      ctx.roundRect(60 + (colWidth * idx) + 8, statsY, colWidth - 16, 120, 8);
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Stat Label & Value
      ctx.fillStyle = onSurfaceVariant;
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(s.label, cx, statsY + 40);

      ctx.fillStyle = onSurface;
      ctx.font = 'bold 36px "Archivo Narrow", sans-serif';
      ctx.fillText(s.value, cx, statsY + 88);
    });

    let y = 400;

    // Personal Records Section
    const prs = StorageController.personalRecords().slice(0, 3);
    if (prs.length > 0) {
      ctx.fillStyle = primary;
      ctx.font = 'bold 24px "Archivo Narrow", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('PERSONAL RECORDS', 80, y);
      
      ctx.strokeStyle = border;
      ctx.beginPath();
      ctx.moveTo(80, y + 12);
      ctx.lineTo(W - 80, y + 12);
      ctx.stroke();

      y += 50;
      prs.forEach(pr => {
        ctx.fillStyle = onSurface;
        ctx.font = '22px "Inter", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${pr.exercise ? pr.exercise : pr.templateName} ${pr.label}`, 80, y);

        ctx.fillStyle = primary;
        ctx.font = 'bold 28px "Archivo Narrow", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${pr.value.toLocaleString()} ${pr.unit || ''}`, W - 80, y);

        y += 55;
      });
    }

    // Badges Section
    const status = StorageController.milestoneStatus();
    const unlocked = status.badges.filter(b => b.unlocked);
    if (unlocked.length > 0) {
      y += 20;
      ctx.fillStyle = primary;
      ctx.font = 'bold 24px "Archivo Narrow", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('BADGES EARNED', 80, y);

      ctx.strokeStyle = border;
      ctx.beginPath();
      ctx.moveTo(80, y + 12);
      ctx.lineTo(W - 80, y + 12);
      ctx.stroke();

      y += 50;
      unlocked.forEach((b) => {
        ctx.fillStyle = onSurface;
        ctx.font = '20px "Inter", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`★ ${b.name}`, 80, y);
        y += 40;
      });
    }

    // Tool Credit Footer 
    ctx.fillStyle = onSurfaceVariant;
    ctx.font = '18px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Powered by Motsa Jiki App', W / 2, H - 60);

    const link = document.createElement('a');
    link.download = `motsa-jiki-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Performance image exported.');
  }

  // Export log data to CSV file
  function exportCSV() {
    const logs = StorageController.activeLogs();
    if (logs.length === 0) {
      toast('No logs to export.', 'warn');
      return;
    }
    const templates = Object.fromEntries(StorageController.activeTemplates().map(t => [t.id, t]));
    const allMetricKeys = new Set();
    logs.forEach(log => {
      Object.keys(log.metrics || {}).forEach(k => allMetricKeys.add(k));
    });
    const headers = ['Date', 'Task', 'Exercise', 'Notes', ...Array.from(allMetricKeys), 'Volume'];
    const escape = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    const rows = logs.map(log => {
      const tpl = templates[log.templateId];
      const taskName = tpl ? tpl.name : 'Unknown';
      const exercise = log.metrics.exercise || '';
      const notes = log.notes || '';
      const d = new Date(log.date);
      const date = Number.isNaN(d.getTime()) ? '' : localDateISO(d);
      const metricValues = Array.from(allMetricKeys).map(k => log.metrics[k] ?? '');
      const volume = StorageController.logVolume(log);
      return [date, taskName, exercise, notes, ...metricValues, volume];
    });
    const csvRows = [headers.map(escape).join(','), ...rows.map(row => row.map(escape).join(','))];
    const csvString = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `motsa-jiki-${new Date().toISOString().slice(0, 10)}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    toast('CSV exported.');
  }

  // Display export selection modal dialog
  function showExportPicker() {
    const existing = document.getElementById('export-picker');
    if (existing) existing.remove();
    const picker = document.createElement('div');
    picker.id = 'export-picker';
    picker.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
      z-index: 200;
    `;
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'max-width: 320px; width: 100%; display: flex; flex-direction: column; gap: 12px;';
    card.innerHTML = `
      <h3 style="font-size:20px; text-align:center;">Export</h3>
      <button class="btn btn-ghost export-option" data-export="png">
        <svg class="export-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
        PNG Image
      </button>
      <button class="btn btn-ghost export-option" data-export="csv">
        <svg class="export-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <path d="M14 2v6h6"/>
          <path d="M8 13h8M8 17h8M8 9h2"/>
        </svg>
        CSV Data
      </button>
      <button class="btn" style="background:transparent; border:1px solid var(--border);" data-export="cancel">Cancel</button>
    `;
    picker.appendChild(card);
    document.body.appendChild(picker);

    const closePicker = () => {
      picker.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') closePicker();
    };
    document.addEventListener('keydown', onKey);

    picker.addEventListener('click', (e) => {
      if (e.target === picker) closePicker();
    });
    card.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.export;
        if (action === 'png') exportPerformanceImage();
        else if (action === 'csv') exportCSV();
        closePicker();
      });
    });
    const firstBtn = card.querySelector('[data-export]');
    if (firstBtn) firstBtn.focus();
  }

  // Display weekly summary banner on Mondays
  async function showWeeklyRecap() {
    const today = new Date();
    if (today.getDay() !== 1) return;
    const dateStr = localDateISO(today);
    const lastShown = await MotsaJikiDB.getMeta('lastWeeklyRecapShown').catch(() => null);
    if (lastShown === dateStr) return;
    const weekData = StorageController.last7DaysVolume();
    const totalVolume = weekData.reduce((sum, d) => sum + d.volume, 0);
    const streak = StorageController.currentStreak();
    const banner = document.createElement('div');
    banner.className = 'weekly-banner';
    banner.innerHTML = `
      <div class="content">
        <div class="title">Weekly Recap</div>
        <div class="stats">Activity this week: ${Math.round(totalVolume).toLocaleString()}</div>
        <div class="stats">Current streak: ${streak} days</div>
      </div>
      <button class="close-btn" aria-label="Dismiss">&times;</button>
    `;
    document.body.appendChild(banner);
    banner.querySelector('.close-btn').addEventListener('click', () => {
      banner.remove();
    });
    await MotsaJikiDB.setMeta('lastWeeklyRecapShown', dateStr);
  }

  // Export public API methods
  global.MotsaJiki = {
    toast,
    escapeHtml,
    iconSvg,
    onData,
    renderTemplateFields,
    readTemplateFields,
    refreshSyncStatusUI,
    exportCSV,
    exportPerformanceImage,
    showExportPicker,
    setTheme,
    getStoredTheme
  };
})(window);
