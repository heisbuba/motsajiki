(function (global) {
  const CURRENT_VERSION = 3;

  // Generates unique identifiers with an optional prefix
  function uid(prefix) {
    const raw = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(16).slice(2)));
    return prefix ? `${prefix}_${raw}` : raw;
  }

  // Returns current ISO timestamp
  function nowIso() {
    return new Date().toISOString();
  }

  // Returns this device's current local calendar day as YYYY-MM-DD.
  // Fixed at call time so it never drifts when read back on a device in a different timezone.
  function localDateISO(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Returns default task template configurations
  const DEFAULT_TEMPLATES = () => ([
    {
      id: 'tpl_jump_rope',
      name: 'Jump Rope',
      category: 'Cardio',
      icon: 'trip_origin',
      fields: [
        { key: 'count', label: 'Jumps', type: 'number', unit: 'reps' },
        { key: 'duration', label: 'Duration', type: 'number', unit: 'min' }
      ],
      updatedAt: nowIso(),
      deleted: false
    },
    {
      id: 'tpl_calisthenics',
      name: 'Calisthenics',
      category: 'Strength',
      icon: 'sports_gymnastics',
      fields: [
        { key: 'exercise', label: 'Exercise', type: 'text', unit: '' },
        { key: 'count', label: 'Reps', type: 'number', unit: 'reps' },
        { key: 'sets', label: 'Sets', type: 'number', unit: 'sets' },
        { key: 'weight', label: 'Added Weight', type: 'number', unit: 'lbs' }
      ],
      updatedAt: nowIso(),
      deleted: false
    },
    {
      id: 'tpl_running',
      name: 'Running',
      category: 'Cardio',
      icon: 'directions_run',
      fields: [
        { key: 'distance', label: 'Distance', type: 'number', unit: 'mi' },
        { key: 'duration', label: 'Duration', type: 'number', unit: 'min' }
      ],
      updatedAt: nowIso(),
      deleted: false
    },
    {
      id: 'tpl_plank',
      name: 'Plank',
      category: 'Strength',
      icon: 'timer',
      fields: [
        { key: 'duration', label: 'Duration', type: 'number', unit: 'sec' }
      ],
      updatedAt: nowIso(),
      deleted: false
    }
  ]);

  // Creates an empty schema document structure
  function emptyDoc() {
    return {
      version: CURRENT_VERSION,
      lastUpdated: nowIso(),
      taskTemplates: DEFAULT_TEMPLATES(),
      logs: [],
      goals: []
    };
  }

  // Migrates legacy or partial documents to the target schema version
  function migrate(doc) {
    if (!doc || typeof doc !== 'object') return emptyDoc();

    const out = {
      version: CURRENT_VERSION,
      lastUpdated: doc.lastUpdated || nowIso(),
      taskTemplates: Array.isArray(doc.taskTemplates) ? doc.taskTemplates.slice() : [],
      logs: Array.isArray(doc.logs) ? doc.logs.slice() : [],
      goals: Array.isArray(doc.goals) ? doc.goals.slice() : []
    };

    const fillRecord = (r) => Object.assign(
      { updatedAt: doc.lastUpdated || nowIso(), deleted: false },
      r
    );

    out.taskTemplates = out.taskTemplates.map(fillRecord);
    out.logs = out.logs.map(fillRecord).map(l => {
      if (l.localDate) return l;
      const basis = l.date ? new Date(l.date) : new Date(l.updatedAt || doc.lastUpdated || Date.now());
      return Object.assign({ localDate: localDateISO(basis) }, l);
    });
    out.goals = out.goals.map(fillRecord);

    if (out.taskTemplates.length === 0) {
      out.taskTemplates = DEFAULT_TEMPLATES();
    }

    return out;
  }

  global.MotsaJikiSchema = { CURRENT_VERSION, uid, nowIso, localDateISO, emptyDoc, migrate, DEFAULT_TEMPLATES };
})(window);