(function () {
  // Utility to safely escape HTML special characters
  const escapeHtml = (v) => (window.MotsaJiki && MotsaJiki.escapeHtml ? MotsaJiki.escapeHtml(v) : String(v ?? ''));

  // Log Form DOM references
  const selector = document.getElementById('template-selector');
  const fieldsContainer = document.getElementById('log-fields-container');
  const notesInput = document.getElementById('log-notes');
  const addBtn = document.getElementById('add-log-btn');
  const activityList = document.getElementById('activity-list');
  const todayCount = document.getElementById('today-count');
  const startWorkoutBtn = document.getElementById('start-workout-btn');

  let templatesById = {};
  let editingLogId = null;

  // Custom Template Manager DOM references
  const toggleBtn = document.getElementById('toggle-custom-template-btn');
  const ctForm = document.getElementById('custom-template-form');
  const ctManageList = document.getElementById('ct-manage-list');
  const ctName = document.getElementById('ct-name');
  const ctCategory = document.getElementById('ct-category');
  const ctFieldsList = document.getElementById('ct-fields-list');
  const ctAddFieldBtn = document.getElementById('ct-add-field-btn');
  const ctSaveBtn = document.getElementById('ct-save-btn');
  let ctFieldRows = [];
  let editingTemplateId = null;

  // Adds a metric input row to the custom task builder form
  function addCtFieldRow(prefill) {
    const row = { id: Math.random().toString(36).slice(2) };
    ctFieldRows.push(row);
    const el = document.createElement('div');
    el.style.cssText = 'display:grid; grid-template-columns:2fr 1fr 1fr auto; gap:8px; align-items:center;';
    el.innerHTML = `
      <input class="control" style="height:40px;" placeholder="Label (e.g. Reps)" value="${escapeHtml((prefill && prefill.label) || '')}" data-ct-label />
      <input class="control" style="height:40px;" placeholder="Unit" value="${escapeHtml((prefill && prefill.unit) || '')}" data-ct-unit />
      <select class="control" style="height:40px;" data-ct-type>
        <option value="number" ${!prefill || prefill.type === 'number' ? 'selected' : ''}>Number</option>
        <option value="text" ${prefill && prefill.type === 'text' ? 'selected' : ''}>Text</option>
      </select>
      <button class="log-delete" type="button" aria-label="Remove metric"><span class="material-symbols-outlined" style="font-size:18px;">close</span></button>`;
    el.querySelector('button').addEventListener('click', () => {
      ctFieldRows = ctFieldRows.filter(r => r.id !== row.id);
      el.remove();
    });
    row.el = el;
    ctFieldsList.appendChild(el);
  }

  // Resets custom task builder form to initial state
  function resetCtForm() {
    editingTemplateId = null;
    ctName.value = '';
    ctCategory.value = '';
    ctFieldsList.innerHTML = '';
    ctFieldRows = [];
    ctSaveBtn.textContent = 'Save Task';
  }

  // Populates task builder form with template details for editing
  function openCtFormForEdit(tpl) {
    editingTemplateId = tpl.id;
    ctName.value = tpl.name;
    ctCategory.value = tpl.category || '';
    ctFieldsList.innerHTML = '';
    ctFieldRows = [];
    tpl.fields.forEach(f => addCtFieldRow(f));
    ctSaveBtn.textContent = 'Update Task';
    ctForm.style.display = 'flex';
    ctForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Renders the list of user-created custom tasks
  function renderManageList() {
    const customTemplates = StorageController.activeTemplates().filter(t => t.custom);
    if (customTemplates.length === 0) {
      ctManageList.innerHTML = '';
      return;
    }
    ctManageList.innerHTML = `<span class="field-label">Your Custom Tasks</span>` + customTemplates.map(t => `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; background:var(--level-2); border:1px solid var(--border); border-radius:var(--radius);">
        <span style="font-weight:600;">${escapeHtml(t.name)}</span>
        <span style="display:flex; gap:4px;">
          <button class="icon-btn" style="width:32px; height:32px;" data-edit-tpl="${escapeHtml(t.id)}" aria-label="Edit"><span class="material-symbols-outlined" style="font-size:18px;">edit</span></button>
          <button class="icon-btn" style="width:32px; height:32px; color:var(--secondary);" data-delete-tpl="${escapeHtml(t.id)}" aria-label="Delete"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>
        </span>
      </div>`).join('');

    ctManageList.querySelectorAll('[data-edit-tpl]').forEach(btn =>
      btn.addEventListener('click', () => openCtFormForEdit(templatesById[btn.dataset.editTpl])));
    ctManageList.querySelectorAll('[data-delete-tpl]').forEach(btn =>
      btn.addEventListener('click', () => {
        if (!confirm('Delete this task? Past logs stay in your history.')) return;
        StorageController.deleteTemplate(btn.dataset.deleteTpl);
        MotsaJiki.toast('Task deleted.');
        if (editingTemplateId === btn.dataset.deleteTpl) { resetCtForm(); ctForm.style.display = 'none'; }
      }));
  }

  // Toggles visibility of the custom task builder form
  toggleBtn.addEventListener('click', () => {
    const showing = ctForm.style.display !== 'none';
    if (showing) {
      ctForm.style.display = 'none';
      resetCtForm();
    } else {
      ctForm.style.display = 'flex';
      if (ctFieldRows.length === 0) addCtFieldRow({ label: 'Reps', unit: 'reps', type: 'number' });
    }
  });

  ctAddFieldBtn.addEventListener('click', () => addCtFieldRow());

  // Handles saving or updating custom tasks
  ctSaveBtn.addEventListener('click', () => {
    const name = ctName.value.trim();
    if (!name) { MotsaJiki.toast('Give the task a name.', 'warn'); return; }

    const rawRows = ctFieldRows.map(row => ({
      label: row.el.querySelector('[data-ct-label]').value.trim(),
      unit: row.el.querySelector('[data-ct-unit]').value.trim(),
      type: row.el.querySelector('[data-ct-type]').value
    }));

    if (rawRows.length === 0) {
      MotsaJiki.toast('Add at least one metric.', 'warn');
      return;
    }
    if (rawRows.some(r => !r.label)) {
      MotsaJiki.toast('All metrics need a label.', 'warn');
      return;
    }

    const usedKeys = new Set();
    const fields = rawRows.map((r, index) => {
      let key = r.label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || `field_${index}`;
      let n = 2;
      const base = key;
      while (usedKeys.has(key)) {
        key = `${base}_${n++}`;
      }
      usedKeys.add(key);
      return { key, label: r.label, unit: r.unit, type: r.type };
    });

    if (editingTemplateId) {
      StorageController.updateTemplate(editingTemplateId, {
        name, category: ctCategory.value.trim() || 'Custom', fields
      });
      MotsaJiki.toast(`"${name}" updated.`);
    } else {
      StorageController.addTemplate({
        name, category: ctCategory.value.trim() || 'Custom', icon: 'fitness_center', fields, custom: true
      });
      MotsaJiki.toast(`"${name}" task created.`);
    }
    resetCtForm();
    ctForm.style.display = 'none';
  });

  // Updates options in the template select dropdown
  function renderTemplateOptions(templates) {
    const prevValue = selector.value;
    selector.innerHTML = '';
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      selector.appendChild(opt);
    });
    if (prevValue && templates.some(t => t.id === prevValue)) selector.value = prevValue;
    onTemplateChange();
  }

  // Handles dynamic form field generation when template selection changes
  function onTemplateChange() {
    const tpl = templatesById[selector.value];
    if (tpl) MotsaJiki.renderTemplateFields(tpl, fieldsContainer);
  }

  selector.addEventListener('change', onTemplateChange);

  // Submits a new workout log or updates an existing entry
  addBtn.addEventListener('click', () => {
    const tpl = templatesById[selector.value];
    if (!tpl) return;
    const metrics = MotsaJiki.readTemplateFields(fieldsContainer);
    if (Object.keys(metrics).length === 0) {
      MotsaJiki.toast('Enter at least one value before logging.', 'warn');
      return;
    }
    if (editingLogId) {
      StorageController.updateLog(editingLogId, { templateId: tpl.id, notes: notesInput.value, metrics });
      editingLogId = null;
      addBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">add</span> Add Log';
      addBtn.classList.remove('btn-primary');
      addBtn.classList.add('btn-ghost');
      MotsaJiki.toast('Log updated.');
    } else {
      StorageController.addLog({ templateId: tpl.id, notes: notesInput.value, metrics });
      MotsaJiki.toast('Logged.');
    }
    notesInput.value = '';
    MotsaJiki.renderTemplateFields(tpl, fieldsContainer);
  });

  startWorkoutBtn.addEventListener('click', () => {
    document.getElementById('template-selector').closest('section').scrollIntoView({ behavior: 'smooth' });
  });

  // Returns display icon for a task template
  function iconForTemplate(tpl) {
    return (tpl && tpl.icon) || 'fitness_center';
  }

  // Formats primary and secondary metric values for display
  function summarizeMetrics(tpl, metrics) {
    if (!tpl) return { primary: '', secondary: '' };
    const numeric = tpl.fields.filter(f => f.type === 'number' && metrics[f.key] !== undefined);
    if (numeric.length === 0) return { primary: '', secondary: '' };
    const primary = numeric[0];
    const secondary = numeric[1];
    return {
      primary: `${escapeHtml(metrics[primary.key])} <span style="font-size:12px; color:var(--on-surface-variant); font-weight:500;">${escapeHtml(primary.unit || '')}</span>`,
      secondary: secondary ? `${escapeHtml(metrics[secondary.key])} ${escapeHtml(secondary.unit || '')}` : ''
    };
  }

  // Renders state data, custom task management, and today's activity list
  function render(state) {
    const templates = StorageController.activeTemplates();
    templatesById = Object.fromEntries(templates.map(t => [t.id, t]));
    renderTemplateOptions(templates);
    renderManageList();

    const today = new Date();
    const logs = StorageController.activeLogs()
      .filter(l => new Date(l.date).toDateString() === today.toDateString())
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    todayCount.textContent = `${logs.length} ENTR${logs.length === 1 ? 'Y' : 'IES'}`;

    if (logs.length === 0) {
      activityList.innerHTML = '<div class="empty-state">No logs yet today. Add your first one above.</div>';
      return;
    }

    activityList.innerHTML = '';
    logs.forEach(log => {
      const tpl = templatesById[log.templateId];
      const { primary, secondary } = summarizeMetrics(tpl, log.metrics);
      const time = new Date(log.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const name = (tpl && tpl.name) || 'Unknown';
      const exercise = log.metrics.exercise ? ' · ' + log.metrics.exercise : '';
      const row = document.createElement('div');
      row.className = 'log-item';
      row.innerHTML = `
        <div class="log-icon"><span class="material-symbols-outlined">${escapeHtml(iconForTemplate(tpl))}</span></div>
        <div class="log-main">
          <span class="log-name">${escapeHtml(name)}${escapeHtml(exercise)}</span>
          <span class="log-time">${escapeHtml(time)}</span>
        </div>
        <div class="log-metrics">
          <span class="log-metric-primary">${primary}</span>
          <span class="log-metric-secondary">${secondary}</span>
        </div>
        <div class="log-actions">
          <button class="log-edit" aria-label="Edit log">
            <span class="material-symbols-outlined" style="font-size:20px;">edit</span>
          </button>
          <button class="log-delete" data-log-id="${escapeHtml(log.id)}" aria-label="Delete log">
            <span class="material-symbols-outlined" style="font-size:20px;">close</span>
          </button>
        </div>`;
      row.querySelector('.log-delete').addEventListener('click', () => {
        StorageController.deleteLog(log.id);
        MotsaJiki.toast('Log removed.');
      });
      row.querySelector('.log-edit').addEventListener('click', () => {
        editingLogId = log.id;
        selector.value = log.templateId;
        onTemplateChange();
        notesInput.value = log.notes || '';
        fieldsContainer.querySelectorAll('[data-field-key]').forEach(input => {
          if (log.metrics[input.dataset.fieldKey] !== undefined) {
            input.value = log.metrics[input.dataset.fieldKey];
          }
        });
        addBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">save</span> Update Log';
        addBtn.classList.remove('btn-ghost');
        addBtn.classList.add('btn-primary');
        document.getElementById('template-selector').closest('section').scrollIntoView({ behavior: 'smooth' });
      });
      activityList.appendChild(row);
    });
  }

  MotsaJiki.onData(render);
})();