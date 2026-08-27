(function () {
  // Utility for escaping HTML strings
  const escapeHtml = (v) => (window.MotsaJiki && MotsaJiki.escapeHtml ? MotsaJiki.escapeHtml(v) : String(v ?? ''));

  // DOM node references
  const levelEl = document.getElementById('status-level');
  const titleEl = document.getElementById('status-title');
  const xpLabel = document.getElementById('xp-progress-label');
  const xpFill = document.getElementById('xp-progress-fill');
  const gallery = document.getElementById('badge-gallery');
  const lockedList = document.getElementById('locked-list');

  //  Level tiers and titles
  function titleForLevel(level) {
    const tiers = ['Rookie', 'Apprentice', 'Contender', 'Grinder', 'Warrior', 'Beast', 'Titan', 'Legend', 'Mythic', 'Elder',  'Champion', 'Warden',  'Sage', 'Archon', 'Eternal'];
    const index = Math.min(tiers.length - 1, Math.floor((level - 1) / 5));
    return tiers[index];
  }
  
  // Render level progress, unlocked badge grid, and locked achievements
  function render(state) {
    const status = StorageController.milestoneStatus();
    levelEl.textContent = `LVL ${status.level}`;
    titleEl.textContent = titleForLevel(status.level);
    xpLabel.textContent = `${status.xpIntoLevel.toLocaleString()} / ${status.xpForNextLevel.toLocaleString()}`;
    xpFill.style.width = `${Math.round((status.xpIntoLevel / status.xpForNextLevel) * 100)}%`;

    const unlocked = status.badges.filter(b => b.unlocked);
    const locked = status.badges.filter(b => !b.unlocked);

    // Render unlocked badges gallery
    gallery.innerHTML = unlocked.length === 0
      ? '<div class="empty-state" style="grid-column:1/-1;">No badges unlocked yet — get logging.</div>'
      : unlocked.map(b => `
        <div class="badge-card">
          <div class="badge-hex"><span class="material-symbols-outlined">${escapeHtml(b.icon)}</span></div>
          <span class="badge-name">${escapeHtml(b.name)}</span>
          <span class="badge-desc">${escapeHtml(b.desc)}</span>
        </div>`).join('');

    // Render locked badges list with progress bars
    lockedList.innerHTML = locked.length === 0
      ? '<div class="empty-state">Everything unlocked. Well done.</div>'
      : locked.map(b => {
          const pct = Math.min(100, Math.round((b.progress / b.target) * 100));
          return `<div class="locked-row">
            <div class="top">
              <span style="display:flex; align-items:center; gap:8px;">
                <span class="material-symbols-outlined" style="font-size:18px;">lock</span> ${escapeHtml(b.name)}
              </span>
              <span class="progress-num">${b.progress.toLocaleString()} / ${b.target.toLocaleString()}</span>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%; background:var(--on-surface-variant); box-shadow:none;"></div></div>
          </div>`;
        }).join('');
  }

  // Subscribe to global data updates
  MotsaJiki.onData(render);
})();
