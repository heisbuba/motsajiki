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
      themeIcon.textContent = theme === 'dark' ? 'bedtime' : 'light_mode';
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
          '<span class="material-symbols-outlined" style="font-variation-settings:\'FILL\' 1;">fitness_center</span>' +
          ' MOTSA JIKI' +
        '</div>' +
        '<div style="display: flex; gap: 8px;">' +
          '<a class="icon-btn" href="/help" aria-label="Help and Legal Information">' +
            '<span class="material-symbols-outlined">help_outline</span>' +
           '</a>' +
          '<button class="icon-btn" id="theme-toggle-btn" aria-label="Toggle Theme">' +
            '<span class="material-symbols-outlined" id="theme-icon">bedtime</span>' +
          '</button>' +
          '<a class="icon-btn" href="' + syncHref + '" aria-label="Sync status">' +
            '<span class="material-symbols-outlined">cloud_sync</span>' +
          '</a>' +
        '</div>';
      document.body.insertBefore(header, document.body.firstChild);
    }

    if (!document.querySelector('nav.bottom-nav')) {
      const nav = document.createElement('nav');
      nav.className = 'bottom-nav';
      nav.innerHTML =
        '<a class="nav-item" data-nav-link="index.html" href="/">' +
          '<span class="material-symbols-outlined">event_note</span>Log' +
        '</a>' +
        '<a class="nav-item" data-nav-link="overview.html" href="/overview">' +
          '<span class="material-symbols-outlined">monitoring</span>Data' +
        '</a>' +
        '<a class="nav-item" data-nav-link="goals.html" href="/goals">' +
          '<span class="material-symbols-outlined">emoji_events</span>Goals' +
        '</a>' +
        '<a class="nav-item" data-nav-link="milestone.html" href="/milestone">' +
          '<span class="material-symbols-outlined">military_tech</span>Badges' +
        '</a>';
      document.body.appendChild(nav);
    }
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
    highlightActiveNav();
    wireSyncControls();
    wireThemeControls();

    const dateEl = document.getElementById('current-date');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
    }

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
    canvas.width = W; canvas.height = H;

    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#c3f400';
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    ctx.fillStyle = '#c3f400';
    ctx.font = 'bold 52px "Archivo Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MOTSA JIKI', W / 2, 110);

    ctx.fillStyle = '#9a9a98';
    ctx.font = '24px "JetBrains Mono", monospace';
    ctx.fillText(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), W / 2, 155);

    const stats = [
      { label: 'CURRENT STREAK', value: StorageController.currentStreak() + ' DAYS' },
      { label: 'TOTAL VOLUME', value: Math.round(StorageController.totalVolume()).toLocaleString() + ' UNITS' },
      { label: 'WORKOUTS LOGGED', value: StorageController.activeLogs().length.toString() }
    ];

    let y = 240;
    stats.forEach(s => {
      ctx.fillStyle = '#9a9a98';
      ctx.font = '20px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(s.label, 80, y);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 56px "Archivo Narrow", sans-serif';
      ctx.fillText(s.value, 80, y + 65);
      y += 130;
    });

    const prs = StorageController.personalRecords().slice(0, 3);
    if (prs.length > 0) {
      ctx.fillStyle = '#c3f400';
      ctx.font = 'bold 28px "Archivo Narrow", sans-serif';
      ctx.fillText('PERSONAL RECORDS', 80, y + 20);
      y += 50;
      prs.forEach(pr => {
        ctx.fillStyle = '#e5e2e1';
        ctx.font = '24px "Inter", sans-serif';
        ctx.fillText(`${pr.exercise ? pr.exercise : pr.templateName} ${pr.label}`, 80, y);
        ctx.fillStyle = '#c3f400';
        ctx.font = 'bold 36px "Archivo Narrow", sans-serif';
        ctx.fillText(`${pr.value.toLocaleString()} ${pr.unit || ''}`, 80, y + 42);
        y += 80;
      });
    }

    const status = StorageController.milestoneStatus();
    const unlocked = status.badges.filter(b => b.unlocked);
    if (unlocked.length > 0) {
      y += 20;
      ctx.fillStyle = '#c3f400';
      ctx.font = 'bold 28px "Archivo Narrow", sans-serif';
      ctx.fillText('BADGES EARNED', 80, y);
      y += 45;
      ctx.fillStyle = '#e5e2e1';
      ctx.font = '22px "Inter", sans-serif';
      unlocked.forEach((b, i) => {
        ctx.fillText(`★ ${b.name}`, 80, y + (i * 34));
      });
    }

    ctx.fillStyle = '#444';
    ctx.font = '18px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('motsa-jiki.app', W / 2, H - 50);

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
