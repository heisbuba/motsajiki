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

  // Prevent infinite sync rendering loops on load
  let didAutoSync = false;

  // Render overview statistics, recent logs, chart, and personal records
  function render(state) {
    const templatesById = Object.fromEntries(StorageController.activeTemplates().map(t => [t.id, t]));

    // Update streak and volume metrics
    statStreak.innerHTML = `${StorageController.currentStreak()}<span class="unit">days</span>`;
    statVolume.innerHTML = `${Math.round(StorageController.totalVolume()).toLocaleString()}<span class="unit">score</span>`;

    // Render recent workout logs table
    const logs = StorageController.activeLogs()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 12);

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

    // Render 7-day activity bar chart
    const week = StorageController.last7DaysVolume();
    const max = Math.max(1, ...week.map(d => d.volume));
    bars.innerHTML = week.map(d => {
      const pct = Math.round((d.volume / max) * 100);
      const isPeak = d.volume === max && d.volume > 0;
      return `<div class="bar-col"><div class="bar-fill${isPeak ? ' peak' : ''}" style="height:${pct}%;"></div></div>`;
    }).join('');
    barLabels.innerHTML = week.map(d => `<span>${escapeHtml(d.label)}</span>`).join('');

    // Render personal records
    const prs = StorageController.personalRecords().slice(0, 6);
    if (prs.length === 0) {
      prList.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No personal records yet.</div>';
    } else {
      prList.innerHTML = prs.map(pr => {
        const title = `${pr.exercise ? pr.exercise : pr.templateName} ${pr.label}`;
        return `
        <div class="card pr-card">
          <span class="pr-title"><span class="material-symbols-outlined" style="font-size:16px;">emoji_events</span>${escapeHtml(title)}</span>
          <span class="pr-value">${pr.value.toLocaleString()}<span style="font-size:14px; color:var(--on-surface-variant); font-family:var(--font-mono); margin-left:4px;">${escapeHtml(pr.unit || '')}</span></span>
        </div>`;
      }).join('');
    }
  }

  // Attach click listener for export dialog
  document.getElementById('export-btn').addEventListener('click', () => {
    MotsaJiki.showExportPicker();
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