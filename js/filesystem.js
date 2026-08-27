(function (global) {
  const FILE_NAME = 'workout.json';
  let directoryHandle = null;
  let permissionGranted = false;

  // Verifies browser support for File System Access API
  function isSupported() {
    return typeof window.showDirectoryPicker === 'function';
  }
    
  // Checks if a directory handle is currently retained
  function hasHandle() {
    return !!directoryHandle;
  }

  // Prompts user to select a directory and stores handle reference
  async function connect() {
    if (!isSupported()) throw new Error('File System Access API not supported in this browser.');
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    directoryHandle = handle;
    permissionGranted = true;
    await MotsaJikiDB.setDirectoryHandle(handle);
    return true;
  }

  // Restores directory handle from IndexedDB and checks permission status
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

  // Re-requests permission using an existing handle (must originate from user gesture)
  async function reconnect() {
    if (!directoryHandle) return false;
    const status = await directoryHandle.requestPermission({ mode: 'readwrite' });
    permissionGranted = status === 'granted';
    return permissionGranted;
  }

  // Evaluates whether directory access is actively granted
  function isConnected() {
    return !!directoryHandle && permissionGranted;
  }

  // Returns name of connected target folder
  function folderName() {
    return directoryHandle ? directoryHandle.name : null;
  }

  // Clears handle reference and persistent storage state
  async function disconnect() {
    directoryHandle = null;
    permissionGranted = false;
    await MotsaJikiDB.clearDirectoryHandle();
  }

  // Reads and parses file contents from directory
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

  // Writes updated document JSON to target file
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