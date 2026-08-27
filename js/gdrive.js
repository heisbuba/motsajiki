(function (global) {
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE_NAME = 'workout.json';
  const CLIENT_ID_KEY = 'motsa-jiki:gdrive-client-id';
  // Google OAuth Web Client ID
  const DEFAULT_CLIENT_ID = '';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let cachedFileId = null;
  let gisLoaded = false;

  // Retrieves stored OAuth client ID or fallback default
  function getClientId() {
    return localStorage.getItem(CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;
  }

  // Persists custom OAuth client ID to local storage
  function setClientId(id) {
    localStorage.setItem(CLIENT_ID_KEY, id.trim());
  }

  // Dynamically loads Google Identity Services library script
  function loadGis() {
    if (gisLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => { gisLoaded = true; resolve(); };
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });
  }

  // Initializes GIS token client instance
  async function ensureTokenClient() {
    const clientId = getClientId();
    if (!clientId) throw new Error('No Google OAuth Client ID configured.');
    await loadGis();
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: () => {} // overridden per-call below
      });
    }
    return tokenClient;
  }

  // Checks if active access token is present and unexpired
  function hasValidToken() {
    return !!accessToken && Date.now() < tokenExpiresAt - 60000; // 60s safety margin
  }

  // Requests access token via GIS client
  function requestToken(promptMode) {
    return ensureTokenClient().then(client => new Promise((resolve, reject) => {
      client.callback = (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + (Number(resp.expires_in || 3600) * 1000);
        resolve(accessToken);
      };
      client.requestAccessToken({ prompt: promptMode });
    }));
  }

  // Silent attempt only -- safe to call on every page load without a user gesture.
  async function trySilentAuth() {
    if (!getClientId()) return false;
    if (hasValidToken()) return true;
    try {
      await requestToken('');
      return true;
    } catch (err) {
      return false;
    }
  }

  // Must be called from a click handler.
  async function signIn() {
    const clientId = getClientId();
    if (!clientId) {
      throw new Error('Google Drive is not configured. Ask the developer to add a Client ID.');
    }
    await requestToken('consent');
    return true;
  }

  // Revokes active token and clears local session state
  function signOut() {
    if (accessToken && global.google && google.accounts) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    cachedFileId = null;
  }

  // Returns connection status based on token validity
  function isConnected() {
    return hasValidToken();
  }

  // Returns valid token or attempts silent renewal
  async function ensureToken() {
    if (hasValidToken()) return accessToken;
    const ok = await trySilentAuth();
    if (!ok) throw new Error('Google Drive session expired -- reconnect required.');
    return accessToken;
  }

  // Queries appDataFolder for target state file ID
  async function findFileId() {
    if (cachedFileId) return cachedFileId;
    const token = await ensureToken();
    const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
      spaces: 'appDataFolder',
      fields: 'files(id,name)',
      q: `name='${FILE_NAME}'`
    });
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const data = await res.json();
    cachedFileId = (data.files && data.files[0]) ? data.files[0].id : null;
    return cachedFileId;
  }

  // Downloads application state JSON from appDataFolder
  async function load() {
    const token = await ensureToken();
    const fileId = await findFileId();
    if (!fileId) return null;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Drive read failed: ${res.status}`);
    return res.json();
  }

  // Uploads or updates application state JSON in appDataFolder
  async function save(doc) {
    const token = await ensureToken();
    const fileId = await findFileId();
    const body = JSON.stringify(doc, null, 2);
    const boundary = 'motsa-jiki-boundary';
    const metadata = fileId ? {} : { name: FILE_NAME, parents: ['appDataFolder'] };

    const multipartBody =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n` +
      `--${boundary}--`;

    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const res = await fetch(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    });
    if (!res.ok) throw new Error(`Drive write failed: ${res.status}`);
    const data = await res.json();
    cachedFileId = data.id || cachedFileId;
    return true;
  }

  // Public module API
  global.GDriveEngine = {
    getClientId, setClientId, trySilentAuth, signIn, signOut,
    isConnected, load, save
  };
})(window);