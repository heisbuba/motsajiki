(function (global) {
  const { uid, nowIso, emptyDoc, migrate } = global.MotsaJikiSchema;

  let state = null;
  const listeners = new Set();

  function emit() {
    listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
  }

  function subscribe(fn) {
    listeners.add(fn);
    if (state) fn(state);
    return () => listeners.delete(fn);
  }

  // Collection and Document Conflict Resolution

  function mergeCollections(a = [], b = []) {
    const byId = new Map();
    a.forEach(r => byId.set(r.id, r));
    b.forEach(r => {
      const existing = byId.get(r.id);
      if (!existing) { byId.set(r.id, r); return; }
      const existingTime = Date.parse(existing.updatedAt || 0) || 0;
      const incomingTime = Date.parse(r.updatedAt || 0) || 0;
      byId.set(r.id, incomingTime >= existingTime ? r : existing);
    });
    return Array.from(byId.values());
  }

  function mergeDocs(a, b) {
    if (!a) return b;
    if (!b) return a;
    return {
      version: Math.max(a.version || 1, b.version || 1),
      lastUpdated: (Date.parse(a.lastUpdated) || 0) >= (Date.parse(b.lastUpdated) || 0) ? a.lastUpdated : b.lastUpdated,
      taskTemplates: mergeCollections(a.taskTemplates, b.taskTemplates),
      logs: mergeCollections(a.logs, b.logs),
      goals: mergeCollections(a.goals, b.goals)
    };
  }

  // Persistence & Remote Sync Management

  async function init() {
    const cached = await MotsaJikiDB.getDoc().catch(() => null);
    state = migrate(cached || emptyDoc());
    emit();

    const fsStatus = await FileSystemEngine.restore().catch(() => 'none');
    const driveOk = await GDriveEngine.trySilentAuth().catch(() => false);

    if (fsStatus === 'connected' || driveOk) {
      await pullAndMerge();
    }
    return { fsStatus, driveOk };
  }

  async function pullAndMerge() {
    let merged = state;
    if (FileSystemEngine.isConnected()) {
      try {
        const fsDoc = await FileSystemEngine.load();
        if (fsDoc) merged = mergeDocs(merged, migrate(fsDoc));
      } catch (e) { console.warn('[sync] FS load failed', e); }
    }
    if (GDriveEngine.isConnected()) {
      try {
        const driveDoc = await GDriveEngine.load();
        if (driveDoc) merged = mergeDocs(merged, migrate(driveDoc));
      } catch (e) { console.warn('[sync] Drive load failed', e); }
    }
    state = merged;
    await MotsaJikiDB.setDoc(state);
    await pushAll();
    emit();
  }

  async function pushAll() {
    await MotsaJikiDB.setDoc(state);
    if (FileSystemEngine.isConnected()) {
      try {
        await FileSystemEngine.save(state);
        await MotsaJikiDB.setMeta('pendingFs', false);
      } catch (e) {
        console.warn('[sync] FS save failed, will retry', e);
        await MotsaJikiDB.setMeta('pendingFs', true);
      }
    }
    if (GDriveEngine.isConnected()) {
      try {
        await GDriveEngine.save(state);
        await MotsaJikiDB.setMeta('pendingDrive', false);
      } catch (e) {
        console.warn('[sync] Drive save failed, will retry', e);
        await MotsaJikiDB.setMeta('pendingDrive', true);
      }
    }
  }

  async function flushPending() {
    if (!state) return;
    const [pendingFs, pendingDrive] = await Promise.all([
      MotsaJikiDB.getMeta('pendingFs').catch(() => false),
      MotsaJikiDB.getMeta('pendingDrive').catch(() => false)
    ]);
    if (pendingFs && FileSystemEngine.isConnected()) {
      try { await FileSystemEngine.save(state); await MotsaJikiDB.setMeta('pendingFs', false); }
      catch (e) { console.warn('[sync] FS retry still failing', e); }
    }
    if (pendingDrive && GDriveEngine.isConnected()) {
      try { await GDriveEngine.save(state); await MotsaJikiDB.setMeta('pendingDrive', false); }
      catch (e) { console.warn('[sync] Drive retry still failing', e); }
    }
  }

  async function pendingStatus() {
    const [fs, drive] = await Promise.all([
      MotsaJikiDB.getMeta('pendingFs').catch(() => false),
      MotsaJikiDB.getMeta('pendingDrive').catch(() => false)
    ]);
    return { fs: !!fs, drive: !!drive };
  }

  function mutate(fn) {
    const draft = JSON.parse(JSON.stringify(state));
    fn(draft);
    draft.lastUpdated = nowIso();
    state = draft;
    emit();
    return pushAll();
  }

  // State Mutation Operations

  function addLog({ templateId, notes, metrics }) {
    mutate(draft => {
      draft.logs.push({
        id: uid('log'), templateId, date: nowIso(), notes: notes || '',
        metrics: metrics || {}, updatedAt: nowIso(), deleted: false
      });
    });
  }

  function deleteLog(logId) {
    mutate(draft => {
      const rec = draft.logs.find(l => l.id === logId);
      if (rec) { rec.deleted = true; rec.updatedAt = nowIso(); }
    });
  }

  function updateLog(logId, patch) {
    mutate(draft => {
      const rec = draft.logs.find(l => l.id === logId);
      if (rec) { Object.assign(rec, patch); rec.updatedAt = nowIso(); }
    });
  }

  function addTemplate(tpl) {
    mutate(draft => {
      draft.taskTemplates.push(Object.assign({
        id: uid('tpl'), updatedAt: nowIso(), deleted: false
      }, tpl));
    });
  }

  function updateTemplate(id, patch) {
    mutate(draft => {
      const t = draft.taskTemplates.find(x => x.id === id);
      if (t) { Object.assign(t, patch); t.updatedAt = nowIso(); }
    });
  }

  function deleteTemplate(id) {
    mutate(draft => {
      const t = draft.taskTemplates.find(x => x.id === id);
      if (t) { t.deleted = true; t.updatedAt = nowIso(); }
    });
  }

  function addGoal({ templateId, exerciseKey, targetField, targetValue, type, deadline }) {
    mutate(draft => {
      draft.goals.push({
        id: uid('goal'), templateId, exerciseKey: exerciseKey || null,
        targetField, targetValue: Number(targetValue), type: type || 'cumulative',
        deadline: deadline || null, completed: false,
        createdAt: nowIso(), updatedAt: nowIso(), deleted: false
      });
    });
  }

  function completeGoal(goalId) {
    mutate(draft => {
      const g = draft.goals.find(x => x.id === goalId);
      if (g) { g.completed = true; g.updatedAt = nowIso(); }
    });
  }

  function deleteGoal(goalId) {
    mutate(draft => {
      const g = draft.goals.find(x => x.id === goalId);
      if (g) { g.deleted = true; g.updatedAt = nowIso(); }
    });
  }

  // Selectors and Metrics Calculation

  function activeLogs() { return (state.logs || []).filter(l => !l.deleted); }
  function activeTemplates() { return (state.taskTemplates || []).filter(t => !t.deleted); }
  function activeGoals() { return (state.goals || []).filter(g => !g.deleted); }

  function logsForDay(dateObj) {
    const key = dateObj.toDateString();
    return activeLogs().filter(l => new Date(l.date).toDateString() === key);
  }

  function currentStreak() {
    let streak = 0;
    const cursor = new Date();
    if (logsForDay(cursor).length === 0) cursor.setDate(cursor.getDate() - 1);
    while (logsForDay(cursor).length > 0) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function logVolume(log) {
    const m = log.metrics || {};
    if (m.weight && m.count) return Number(m.count) * Number(m.weight) * (Number(m.sets) || 1);
    if (m.count && m.sets) return Number(m.count) * Number(m.sets);
    if (m.count) return Number(m.count);
    if (m.distance) return Number(m.distance);
    if (m.duration) return Number(m.duration);
    
    const tpl = activeTemplates().find(t => t.id === log.templateId);
    if (tpl && tpl.fields) {
      return tpl.fields
        .filter(f => f.type === 'number' && m[f.key] !== undefined)
        .reduce((sum, f) => sum + Number(m[f.key]), 0);
    }
    return 0;
  }

  function totalVolume() {
    return activeLogs().reduce((sum, l) => sum + logVolume(l), 0);
  }

  function last7DaysVolume() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const vol = logsForDay(d).reduce((sum, l) => sum + logVolume(l), 0);
      days.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' })[0], date: d, volume: vol });
    }
    return days;
  }

  function personalRecords() {
    const byKey = new Map();
    activeLogs().forEach(log => {
      const tpl = activeTemplates().find(t => t.id === log.templateId);
      if (!tpl) return;
      const exerciseTag = log.metrics.exercise ? `:${log.metrics.exercise}` : '';
      tpl.fields.filter(f => f.type === 'number').forEach(f => {
        const val = Number(log.metrics[f.key]);
        if (!(val > 0)) return;
        const key = `${tpl.id}${exerciseTag}:${f.key}`;
        const existing = byKey.get(key);
        if (!existing || val > existing.value) {
          byKey.set(key, {
            key, value: val, unit: f.unit, label: f.label,
            templateName: tpl.name, exercise: log.metrics.exercise || null
          });
        }
      });
    });
    return Array.from(byKey.values()).sort((a, b) => b.value - a.value);
  }

  function goalProgress(goal) {
    const relevant = activeLogs().filter(l => {
      if (l.templateId !== goal.templateId) return false;
      if (goal.exerciseKey && l.metrics.exercise !== goal.exerciseKey) return false;
      return true;
    });
    let current;
    if (goal.type === 'max') {
      current = relevant.reduce((max, l) => Math.max(max, Number(l.metrics[goal.targetField]) || 0), 0);
    } else {
      current = relevant.reduce((sum, l) => sum + (Number(l.metrics[goal.targetField]) || 0), 0);
    }
    const pct = goal.targetValue > 0 ? Math.min(100, Math.round((current / goal.targetValue) * 100)) : 0;
    return { current, pct, remaining: Math.max(0, goal.targetValue - current) };
  }

  function milestoneStatus() {
    const totalLogs = activeLogs().length;
    const streak = currentStreak();
    const xp = totalLogs * 50 + streak * 20 + Math.floor(totalVolume());
    const level = Math.max(1, Math.floor(xp / 1000) + 1);
    const xpIntoLevel = xp % 1000;
    const badges = [
      { id: 'century', name: 'The Century', desc: '100 Workouts Logged', icon: 'workspace_premium', unlocked: totalLogs >= 100, progress: totalLogs, target: 100 },
      { id: 'iron-will', name: 'Iron Will', desc: '30 Day Streak', icon: 'local_fire_department', unlocked: streak >= 30, progress: streak, target: 30 },
      { id: 'powerhouse', name: 'Powerhouse', desc: '10,000 Activity Score', icon: 'fitness_center', unlocked: totalVolume() >= 10000, progress: Math.floor(totalVolume()), target: 10000 },
      { id: 'endurance', name: 'Endurance', desc: '7 Day Streak', icon: 'timer', unlocked: streak >= 7, progress: streak, target: 7 }
    ];
    return { level, xp, xpIntoLevel, xpForNextLevel: 1000, badges };
  }

  global.StorageController = {
    subscribe, init, pullAndMerge, mutate, flushPending, pendingStatus,
    addLog, updateLog, deleteLog, addTemplate, updateTemplate, deleteTemplate,
    addGoal, completeGoal, deleteGoal,
    getState: () => state,
    activeLogs, activeTemplates, activeGoals,
    currentStreak, totalVolume, last7DaysVolume, personalRecords,
    goalProgress, milestoneStatus, logVolume
  };
})(window);