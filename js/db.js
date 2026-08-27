(function (global) {
  // Database configuration and state initialization
  const DB_NAME = 'motsa-jiki';
  const LEGACY_DB_NAME = 'forge-track';
  const DB_VERSION = 1;
  let dbPromise = null;
  let migrated = false;

  // Open specified IndexedDB database instance and create required object stores
  function openNamed(name) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Retrieve single item from object store
  function storeGet(db, store, key) {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(store)) { resolve(undefined); return; }
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Write or update item in object store
  function storePut(db, store, key, value) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // Copy records from legacy database to active instance if target is empty
  async function migrateFromLegacy(targetDb) {
    if (migrated) return;
    migrated = true;
    let legacy = null;
    try {
      legacy = await openNamed(LEGACY_DB_NAME);
    } catch (_) {
      return;
    }
    try {
      const existing = await storeGet(targetDb, 'cache', 'doc');
      if (existing) return;

      const doc = await storeGet(legacy, 'cache', 'doc');
      if (doc) await storePut(targetDb, 'cache', 'doc', doc);

      const handle = await storeGet(legacy, 'handles', 'directory');
      if (handle) await storePut(targetDb, 'handles', 'directory', handle);

      for (const key of ['pendingFs', 'pendingDrive', 'lastWeeklyRecapShown']) {
        const val = await storeGet(legacy, 'meta', key);
        if (val !== undefined) await storePut(targetDb, 'meta', key, val);
      }
    } catch (e) {
      console.warn('[MotsaJikiDB] legacy migration skipped', e);
    } finally {
      try { legacy.close(); } catch (_) { }
    }
  }

  // Get or establish active database connection with migration check
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = openNamed(DB_NAME).then(async (db) => {
      await migrateFromLegacy(db);
      return db;
    });
    return dbPromise;
  }

  // Create transactional object store accessor
  function tx(store, mode) {
    return openDb().then(db => db.transaction(store, mode).objectStore(store));
  }

  // Read value by key from target object store
  function get(store, key) {
    return tx(store, 'readonly').then(os => new Promise((resolve, reject) => {
      const req = os.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  // Write key-value pair to target object store
  function set(store, key, value) {
    return tx(store, 'readwrite').then(os => new Promise((resolve, reject) => {
      const req = os.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    }));
  }

  // Remove key-value pair from target object store
  function del(store, key) {
    return tx(store, 'readwrite').then(os => new Promise((resolve, reject) => {
      const req = os.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    }));
  }

  // Public persistence API wrapper
  global.MotsaJikiDB = {
    getDoc: () => get('cache', 'doc'),
    setDoc: (doc) => set('cache', 'doc', doc),
    getDirectoryHandle: () => get('handles', 'directory'),
    setDirectoryHandle: (handle) => set('handles', 'directory', handle),
    clearDirectoryHandle: () => del('handles', 'directory'),
    getMeta: (key) => get('meta', key),
    setMeta: (key, value) => set('meta', key, value)
  };
})(window);