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

  // Date bucketing helpers for range-based aggregation

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function startOfWeek(d) {
    // Monday-aligned week start
    const x = startOfDay(d);
    const day = x.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(x, diff);
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  }

  const RANGE_CONFIG = {
    '7d': { count: 7, unit: 'day', label: d => d.toLocaleDateString('en-US', { weekday: 'short' })[0] },
    '1m': { count: 30, unit: 'day', label: d => String(d.getDate()) },
    '3m': { count: 13, unit: 'week', label: d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
    '1y': { count: 12, unit: 'month', label: d => d.toLocaleDateString('en-US', { month: 'short' }) }
  };

  function logsForDay(dateObj) {
    const key = dateObj.toDateString();
    return activeLogs().filter(l => new Date(l.date).toDateString() === key);
  }

  function logsForRange(start, end) {
    return activeLogs().filter(l => {
      const t = new Date(l.date);
      return t >= start && t < end;
    });
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

  function volumeForRange(range) {
    const cfg = RANGE_CONFIG[range];
    if (!cfg) throw new Error(`[StorageController] Unknown range: ${range}`);

    const today = startOfDay(new Date());
    const buckets = [];

    if (cfg.unit === 'day') {
      for (let i = cfg.count - 1; i >= 0; i--) {
        const start = addDays(today, -i);
        buckets.push({ start, end: addDays(start, 1) });
      }
    } else if (cfg.unit === 'week') {
      const currentWeekStart = startOfWeek(today);
      for (let i = cfg.count - 1; i >= 0; i--) {
        const start = addDays(currentWeekStart, -7 * i);
        buckets.push({ start, end: addDays(start, 7) });
      }
    } else if (cfg.unit === 'month') {
      const currentMonthStart = startOfMonth(today);
      for (let i = cfg.count - 1; i >= 0; i--) {
        const start = addMonths(currentMonthStart, -i);
        buckets.push({ start, end: addMonths(start, 1) });
      }
    }

    return buckets.map(b => {
      const vol = logsForRange(b.start, b.end).reduce((sum, l) => sum + logVolume(l), 0);
      return { label: cfg.label(b.start), date: b.start, volume: vol };
    });
  }

  function last7DaysVolume() {
    return volumeForRange('7d');
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

  // Derives deadline pacing/overdue info for a goal. Returns null if no deadline set.
  // "overdue" is computed live from the current date, never persisted, so it can't
  // go stale or need conflict resolution across synced devices.
  function goalDeadlineInfo(goal, progress) {
    if (!goal.deadline) return null;
    const now = startOfDay(new Date());
    const due = startOfDay(new Date(goal.deadline));
    const daysLeft = Math.round((due - now) / 86400000);
    const overdue = !goal.completed && daysLeft < 0;
    const completedEarly = !!goal.completed && daysLeft >= 0;
    // Per-day pace only makes sense for cumulative goals with time still remaining.
    const perDay = (!goal.completed && goal.type !== 'max' && daysLeft > 0)
      ? progress.remaining / daysLeft
      : null;
    return { daysLeft, overdue, completedEarly, perDay };
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
    currentStreak, totalVolume, last7DaysVolume, volumeForRange, personalRecords,
    goalProgress, goalDeadlineInfo, milestoneStatus, logVolume
  };
})(window);
