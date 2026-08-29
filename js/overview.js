(function () {
  // Utility for escaping HTML strings
  const escapeHtml = (v) => (window.MotsaJiki && MotsaJiki.escapeHtml ? MotsaJiki.escapeHtml(v) : String(v ?? ''));

  // DOM node references
  const statStreak = document.getElementById('stat-streak');
  const statVolume = document.getElementById('stat-volume');
  const historyTable = document.getElementById('history-table');
  const bars = document.getElementById('volume-bars');
  const barLabels = document.getElementById('volume-bar-labels');
  const prList = document.getElementById('pr-list');
  const historyPrevBtn = document.getElementById('history-prev-btn');
  const historyNextBtn = document.getElementById('history-next-btn');
  const chartRangeToggle = document.getElementById('chart-range-toggle');
  const chartRangeLabel = document.getElementById('chart-range-label');

  // Prevent infinite sync rendering loops on load
  let didAutoSync = false;

  // Recent History pagination state
  const HISTORY_PAGE_SIZE = 12;
  let historyPage = 0;

  // Performance chart range state
  let chartRange = '7d';
  const CHART_RANGE_LABELS = {
    '7d': '7-Day Activity',
    '1m': '30-Day Activity',
    '3m': '3-Month Activity (Weekly)',
    '1y': '12-Month Activity'
  };

  // Render overview statistics, recent logs, chart, and personal records
  function render(state) {
    const templatesById = Object.fromEntries(StorageController.activeTemplates().map(t => [t.id, t]));

    // Update streak and volume metrics
    statStreak.innerHTML = `${StorageController.currentStreak()}<span class="unit">days</span>`;
    statVolume.innerHTML = `${Math.round(StorageController.totalVolume()).toLocaleString()}<span class="unit">score</span>`;

    // Render recent workout logs table (paginated)
    const sortedLogs = StorageController.activeLogs()
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalPages = Math.max(1, Math.ceil(sortedLogs.length / HISTORY_PAGE_SIZE));
    if (historyPage >= totalPages) historyPage = totalPages - 1;
    if (historyPage < 0) historyPage = 0;

    const logs = sortedLogs.slice(historyPage * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE);

    historyPrevBtn.disabled = historyPage === 0;
    historyPrevBtn.style.opacity = historyPrevBtn.disabled ? '0.4' : '1';
    historyPrevBtn.style.cursor = historyPrevBtn.disabled ? 'default' : 'pointer';
    historyNextBtn.disabled = historyPage >= totalPages - 1;
    historyNextBtn.style.opacity = historyNextBtn.disabled ? '0.4' : '1';
    historyNextBtn.style.cursor = historyNextBtn.disabled ? 'default' : 'pointer';

    if (logs.length === 0) {
      historyTable.innerHTML = '<div class="empty-state">No history yet — log a workout to see it here.</div>';
    } else {
      const rows = logs.map((log, i) => {
        const tpl = templatesById[log.templateId];
        const dateLabel = new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
        const vol = Math.round(StorageController.logVolume(log));
        const bg = i % 2 === 0 ? 'var(--level-1)' : '#0D0D0D';
        const name = (tpl && tpl.name) || 'Unknown';
        const exercise = log.metrics.exercise ? ' · ' + log.metrics.exercise : '';
        return `<div style="display:grid; grid-template-columns:1fr 2fr 1fr; gap:8px; padding:14px 16px; background:${bg}; border-bottom:1px solid var(--border); align-items:center;">
          <span style="font-family:var(--font-mono); font-size:13px;">${escapeHtml(dateLabel)}</span>
          <span>${escapeHtml(name)}${escapeHtml(exercise)}</span>
          <span style="font-family:var(--font-mono); font-weight:700; color:var(--primary-dim); text-align:right;">${vol.toLocaleString()}</span>
        </div>`;
      }).join('');
      historyTable.innerHTML = `<div style="display:grid; grid-template-columns:1fr 2fr 1fr; gap:8px; padding:12px 16px; background:#0D0D0D; border-bottom:1px solid var(--border); font-family:var(--font-mono); font-size:11px; color:var(--on-surface-variant); text-transform:uppercase;">
        <span>Date</span><span>Exercise</span><span style="text-align:right;">Score</span>
      </div>${rows}`;
    }

    // Render activity bar chart for the selected range
    chartRangeLabel.textContent = CHART_RANGE_LABELS[chartRange];
    const buckets = StorageController.volumeForRange(chartRange);
    const max = Math.max(1, ...buckets.map(d => d.volume));
    bars.innerHTML = buckets.map(d => {
      const pct = Math.round((d.volume / max) * 100);
      const isPeak = d.volume === max && d.volume > 0;
      return `<div class="bar-col"><div class="bar-fill${isPeak ? ' peak' : ''}" style="height:${pct}%;"></div></div>`;
    }).join('');
    // Decimate labels on denser ranges so text doesn't crowd — always keep the
    // most recent bucket's label visible as a right-edge anchor.
    const LABEL_STRIDE = { '7d': 1, '1m': 5, '3m': 2, '1y': 1 };
    const stride = LABEL_STRIDE[chartRange] || 1;
    barLabels.innerHTML = buckets.map((d, i) => {
      const show = i % stride === 0 || i === buckets.length - 1;
      return `<span>${show ? escapeHtml(d.label) : ''}</span>`;
    }).join('');

    // Render personal records
    const prs = StorageController.personalRecords();
    if (prs.length === 0) {
      prList.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No personal records yet.</div>';
    } else {
      prList.innerHTML = prs.map(pr => {
        const title = `${pr.exercise ? pr.exercise : pr.templateName} ${pr.label}`;
        return `
        <div class="card pr-card">
          <span class="pr-title"><svg class="icon" style="width:16px;height:16px;"><use href="/icons/icons.svg#icon-emoji_events"></use></svg>${escapeHtml(title)}</span>
          <span class="pr-value">${pr.value.toLocaleString()}<span style="font-size:14px; color:var(--on-surface-variant); font-family:var(--font-mono); margin-left:4px;">${escapeHtml(pr.unit || '')}</span></span>
        </div>`;
      }).join('');
    }
  }

  // Attach click listener for export dialog
  document.getElementById('export-btn').addEventListener('click', () => {
    MotsaJiki.showExportPicker();
  });

  // Recent History pagination controls
  historyPrevBtn.addEventListener('click', () => {
    if (historyPrevBtn.disabled) return;
    historyPage -= 1;
    render(StorageController.getState());
  });
  historyNextBtn.addEventListener('click', () => {
    if (historyNextBtn.disabled) return;
    historyPage += 1;
    render(StorageController.getState());
  });

  // Performance chart range toggle
  chartRangeToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.range-toggle-btn');
    if (!btn || !chartRangeToggle.contains(btn)) return;
    const range = btn.dataset.range;
    if (!range || range === chartRange) return;
    chartRange = range;
    chartRangeToggle.querySelectorAll('.range-toggle-btn').forEach(b => {
      b.classList.toggle('is-active', b === btn);
    });
    render(StorageController.getState());
  });

  // Subscribe to global data updates and trigger initial auto-sync
  MotsaJiki.onData(state => {
    render(state);
    if (!didAutoSync && GDriveEngine.isConnected()) {
      didAutoSync = true;
      StorageController.pullAndMerge().then(() => MotsaJiki.refreshSyncStatusUI());
    }
  });
})();