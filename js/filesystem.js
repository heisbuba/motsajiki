(function (global) {
  const FILE_NAME = 'workout.json';
  let directoryHandle = null;
  let permissionGranted = false;

  function isSupported() {
    return typeof window.showDirectoryPicker === 'function';
  }
    
  function hasHandle() {
    return !!directoryHandle;
  }
  async function connect() {
    if (!isSupported()) throw new Error('File System Access API not supported in this browser.');
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    directoryHandle = handle;
    permissionGranted = true;
    await MotsaJikiDB.setDirectoryHandle(handle);
    return true;
  }

  // Called on every page load. Restores the handle from IndexedDB
  async function restore() {
    if (!isSupported()) return 'none';
    const handle = await MotsaJikiDB.getDirectoryHandle().catch(() => null);
    if (!handle) return 'none';
    directoryHandle = handle;
    const status = await handle.queryPermission({ mode: 'readwrite' }).catch(() => 'denied');
    permissionGranted = status === 'granted';
    if (permissionGranted) return 'connected';
    return 'needs-permission';
  }

  // Must be called from within a user gesture (click) handler.
  async function reconnect() {
    if (!directoryHandle) return false;
    const status = await directoryHandle.requestPermission({ mode: 'readwrite' });
    permissionGranted = status === 'granted';
    return permissionGranted;
  }

  function isConnected() {
    return !!directoryHandle && permissionGranted;
  }

  function folderName() {
    return directoryHandle ? directoryHandle.name : null;
  }

  async function disconnect() {
    directoryHandle = null;
    permissionGranted = false;
    await MotsaJikiDB.clearDirectoryHandle();
  }

  async function load() {
    if (!directoryHandle) return null;
    try {
      const fileHandle = await directoryHandle.getFileHandle(FILE_NAME, { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (err) {
      if (err && err.name === 'NotFoundError') return null; 
      console.error('[FileSystemEngine] read error', err);
      throw err;
    }
  }

  async function save(doc) {
    if (!directoryHandle) return false;
    const fileHandle = await directoryHandle.getFileHandle(FILE_NAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(doc, null, 2));
    await writable.close();
    return true;
  }

  global.FileSystemEngine = {
    isSupported, connect, restore, reconnect, disconnect,
    isConnected, hasHandle, folderName, load, save
  };
})(window);
