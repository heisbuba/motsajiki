(function () {
  // Utility to safely escape HTML special characters
  const escapeHtml = (v) => (window.MotsaJiki && MotsaJiki.escapeHtml ? MotsaJiki.escapeHtml(v) : String(v ?? ''));

  // Target DOM references
  const priorityWrap = document.getElementById('priority-goal-wrap');
  const activeList = document.getElementById('active-goals-list');
  const completedList = document.getElementById('completed-goals-list');

  // Form DOM references
  const templateSelect = document.getElementById('goal-template');
  const exerciseWrap = document.getElementById('goal-exercise-wrap');
  const exerciseInput = document.getElementById('goal-exercise');
  const metricSelect = document.getElementById('goal-metric');
  const targetValueInput = document.getElementById('goal-target-value');
  const typeSelect = document.getElementById('goal-type');
  const deadlineInput = document.getElementById('goal-deadline');
  const initBtn = document.getElementById('initialize-goal-btn');

  let templatesById = {};

  // Updates available target metric choices based on selected template
  function refreshMetricOptions() {
    const tpl = templatesById[templateSelect.value];
    metricSelect.innerHTML = '';
    if (!tpl) return;
    tpl.fields.filter(f => f.type === 'number').forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.key;
      opt.textContent = f.unit ? `${f.label} (${f.unit})` : f.label;
      metricSelect.appendChild(opt);
    });
    const hasExerciseField = tpl.fields.some(f => f.key === 'exercise');
    exerciseWrap.style.display = hasExerciseField ? 'flex' : 'none';
  }

  templateSelect.addEventListener('change', refreshMetricOptions);

  // Validates inputs and creates a new goal target
  initBtn.addEventListener('click', () => {
    const tpl = templatesById[templateSelect.value];
    if (!tpl) return;
    const targetValue = Number(targetValueInput.value);
    if (!targetValue || targetValue <= 0) {
      MotsaJiki.toast('Enter a target value greater than 0.', 'warn');
      return;
    }
    StorageController.addGoal({
      templateId: tpl.id,
      exerciseKey: exerciseWrap.style.display !== 'none' ? (exerciseInput.value || null) : null,
      targetField: metricSelect.value,
      targetValue,
      type: typeSelect.value,
      deadline: deadlineInput.value || null
    });
    targetValueInput.value = '';
    exerciseInput.value = '';
    deadlineInput.value = '';
    MotsaJiki.toast('New Goal Added.', 'success');
  });

  // Constructs a formatted target title string
  function goalTitle(goal, tpl) {
    const metricField = tpl && tpl.fields.find(f => f.key === goal.targetField);
    const metricLabel = metricField ? metricField.label : goal.targetField;
    const name = goal.exerciseKey ? goal.exerciseKey : (tpl ? tpl.name : 'Unknown');
    return `${goal.targetValue.toLocaleString()}${metricField && metricField.unit ? ' ' + metricField.unit : ''} ${metricLabel} — ${name}`;
  }

  // Builds the deadline status markup
  function deadlineMarkup(goal, progress) {
    const info = StorageController.goalDeadlineInfo(goal, progress);
    if (!info) return '';

    if (info.completedEarly) {
      return `<div class="deadline-row deadline-early">Completed early! 🎉</div>`;
    }
    if (info.overdue) {
      const daysPast = Math.abs(info.daysLeft);
      return `<div class="deadline-row"><span class="tag tag-overdue">Overdue</span><span class="meta">${daysPast} day${daysPast === 1 ? '' : 's'} past deadline</span></div>`;
    }
    const dayLabel = info.daysLeft === 0 ? 'Due today' : `${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'} left`;
    const paceLabel = info.perDay ? ` · ${Math.ceil(info.perDay).toLocaleString()}/day needed` : '';
    return `<div class="deadline-row"><span class="meta">${dayLabel}${paceLabel}</span></div>`;
  }

  // Renders target overview, priority display, and active/completed lists
  function render(state) {
    const templates = StorageController.activeTemplates();
    templatesById = Object.fromEntries(templates.map(t => [t.id, t]));

    const currentIds = templates.map(t => t.id).join(',');
    if (templateSelect.dataset.builtIds !== currentIds) {
      const prevValue = templateSelect.value;
      templateSelect.innerHTML = '';
      templates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        templateSelect.appendChild(opt);
      });
      templateSelect.dataset.builtIds = currentIds;
      if (prevValue && templates.some(t => t.id === prevValue)) templateSelect.value = prevValue;
      refreshMetricOptions();
    }

    const goals = StorageController.activeGoals();
    const active = goals.filter(g => !g.completed);
    const completed = goals.filter(g => g.completed);

    if (active.length === 0) {
      priorityWrap.innerHTML = '';
      activeList.innerHTML = '<div class="empty-state">No active targets. Set one below.</div>';
    } else {
      const sorted = active.slice().sort((a, b) => StorageController.goalProgress(b).pct - StorageController.goalProgress(a).pct);
      const [priority, ...rest] = sorted;
      const tplP = templatesById[priority.templateId];
      const pp = StorageController.goalProgress(priority);
      priorityWrap.innerHTML = `
        <div class="priority-goal">
          <span class="hero-label" style="margin:0;">PRIORITY GOAL</span>
          <h3 style="font-size:22px;">${escapeHtml(goalTitle(priority, tplP))}</h3>
          <div style="display:flex; align-items:baseline; gap:8px;">
            <span class="hero-value" style="font-size:48px;">${pp.pct}%</span>
            <span class="meta">COMPLETED</span>
          </div>
          <div class="progress-track lg"><div class="progress-fill" style="width:${pp.pct}%;"></div></div>
          <div class="goal-footer"><span>${pp.current.toLocaleString()} Current</span><span>${pp.remaining.toLocaleString()} Remaining</span></div>
          ${deadlineMarkup(priority, pp)}
        </div>`;

      activeList.innerHTML = rest.length === 0 ? '' : rest.map(g => {
        const tpl = templatesById[g.templateId];
        const p = StorageController.goalProgress(g);
        return `<div class="card goal-card">
          <div class="goal-row">
            <span class="goal-name">${escapeHtml(goalTitle(g, tpl))}</span>
            <span class="goal-pct">${p.pct}%</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${p.pct}%;"></div></div>
          <div class="goal-footer"><span>${p.remaining.toLocaleString()} left</span>
            <button class="log-delete" data-goal-id="${escapeHtml(g.id)}" aria-label="Delete goal"><svg class="icon" style="width:18px;height:18px;"><use href="/icons/icons.svg#icon-close"></use></svg></button>
          </div>
          ${deadlineMarkup(g, p)}
        </div>`;
      }).join('');

      activeList.querySelectorAll('[data-goal-id]').forEach(btn =>
        btn.addEventListener('click', () => { StorageController.deleteGoal(btn.dataset.goalId); MotsaJiki.toast('Goal removed.'); }));
    }

    completedList.innerHTML = completed.length === 0
      ? '<div class="empty-state">Nothing completed yet.</div>'
      : completed.map(g => {
          const tpl = templatesById[g.templateId];
          const info = StorageController.goalDeadlineInfo(g, StorageController.goalProgress(g));
          const earlyTag = info && info.completedEarly ? '<span class="tag tag-early">Early</span>' : '';
          return `<div class="goal-completed"><span class="name">${escapeHtml(goalTitle(g, tpl))}</span><span style="display:flex; align-items:center; gap:8px;">${earlyTag}<svg class="icon" style="color:var(--on-surface-variant);"><use href="/icons/icons.svg#icon-check_circle"></use></svg></span></div>`;
        }).join('');
  }

  // Evaluates goal completions before executing main render pass.
  MotsaJiki.onData(state => {
    const toComplete = StorageController.activeGoals()
      .filter(g => !g.completed && StorageController.goalProgress(g).pct >= 100)
      .map(g => g.id);
    if (toComplete.length > 0) StorageController.completeGoals(toComplete);
    render(state);
  });
})();