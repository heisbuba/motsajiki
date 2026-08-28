(function (global) {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FILE_NAME = 'workout.json';
  const CLIENT_ID_KEY = 'motsa-jiki:gdrive-client-id';
  const CONNECTED_KEY = 'motsa-jiki:gdrive-connected';
  const TOKEN_KEY = 'motsa-jiki:gdrive-token'; // sessionStorage: survives reload, not tab close
  const REFRESH_TOKEN_KEY = 'motsa-jiki:gdrive-refresh-token'; // localStorage: long-lived
  const FILE_ID_KEY = 'motsa-jiki:gdrive-file-id'; // localStorage: avoids a stale name-based lookup after the user renames the file
  const EXCHANGE_URL = '/api/gdrive/exchange';
  const REFRESH_URL = '/api/gdrive/refresh';
  // Google OAuth Web Client ID
  const DEFAULT_CLIENT_ID = '357624308945-h7j0flg2sg5jk13mf68lj8hgmfdv2pm2.apps.googleusercontent.com';

  let codeClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let cachedFileId = null;
  let gisLoaded = false;

  // Hydrate from sessionStorage on module load
  (function restoreToken() {
    try {
      const raw = sessionStorage.getItem(TOKEN_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.accessToken && saved.tokenExpiresAt > Date.now()) {
        accessToken = saved.accessToken;
        tokenExpiresAt = saved.tokenExpiresAt;
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch (err) {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  })();

  function persistToken() {
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, tokenExpiresAt }));
    } catch (err) { /* storage unavailable (private mode etc) -- token just won't survive reload */ }
  }

  function clearPersistedToken() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (err) {}
  }

  function getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  function setRefreshToken(token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  }

  function clearRefreshToken() {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  function getStoredFileId() {
    return localStorage.getItem(FILE_ID_KEY);
  }

  function setStoredFileId(id) {
    localStorage.setItem(FILE_ID_KEY, id);
  }

  function clearStoredFileId() {
    localStorage.removeItem(FILE_ID_KEY);
  }

  function getClientId() {
    return localStorage.getItem(CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;
  }

  function setClientId(id) {
    localStorage.setItem(CLIENT_ID_KEY, id.trim());
  }

  function hasEverConnected() {
    return localStorage.getItem(CONNECTED_KEY) === '1';
  }

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

  async function ensureCodeClient() {
    const clientId = getClientId();
    if (!clientId) throw new Error('No Google OAuth Client ID configured.');
    await loadGis();
    if (!codeClient) {
      codeClient = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: SCOPE,
        ux_mode: 'popup',
        callback: () => {} // overridden per-call below
      });
    }
    return codeClient;
  }

  // Requests a one-time authorization code via the popup consent screen.
  // Must be called from a click handler.
  function requestCode() {
    return ensureCodeClient().then(client => new Promise((resolve, reject) => {
      client.callback = (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        resolve(resp.code);
      };
      client.requestCode();
    }));
  }

  function hasValidToken() {
    return !!accessToken && Date.now() < tokenExpiresAt - 60000; // 60s safety margin
  }

  function applyTokenResponse({ access_token, expires_in }) {
    accessToken = access_token;
    tokenExpiresAt = Date.now() + (Number(expires_in || 3600) * 1000);
    persistToken();
  }

  // Sends the one-time code from requestCode() to our own backend (Cloudflare
  // Pages Function), which holds the OAuth client secret and does the actual
  // exchange with Google. Returns an access token now and, on first consent,
  // a refresh token we can use to renew silently for as long as it's valid --
  // days, weeks, until revoked -- with zero further browser UI.
  async function exchangeCode(code) {
    const res = await fetch(EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    if (!res.ok) throw new Error('Token exchange failed');
    return res.json();
  }

  // Server-to-server token renewal -- no GIS call, no popup, ever.
  async function refreshWithBackend(refreshToken) {
    const res = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!res.ok) throw new Error('Token refresh failed');
    return res.json();
  }

  // Silent renewal via our stored refresh token.
  async function trySilentAuth() {
    if (!getClientId()) return false;
    if (!hasEverConnected()) return false;
    if (hasValidToken()) return true;
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      applyTokenResponse(await refreshWithBackend(refreshToken));
      return true;
    } catch (err) {
      return false;
    }
  }

  // Must be called from a click handler. Runs the one-time consent popup and
  // hands the resulting code to our backend for exchange.
  async function signIn() {
    const clientId = getClientId();
    if (!clientId) {
      throw new Error('Google Drive is not configured. Ask the developer to add a Client ID.');
    }
    const code = await requestCode();
    const tokenResponse = await exchangeCode(code);
    applyTokenResponse(tokenResponse);
    if (tokenResponse.refresh_token) setRefreshToken(tokenResponse.refresh_token);
    localStorage.setItem(CONNECTED_KEY, '1');
    return true;
  }

  function signOut() {
    if (accessToken && global.google && google.accounts) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    cachedFileId = null;
    localStorage.removeItem(CONNECTED_KEY);
    clearPersistedToken();
    clearRefreshToken();
    clearStoredFileId();
  }

  function isConnected() {
    return hasValidToken();
  }

  async function ensureToken() {
    if (hasValidToken()) return accessToken;
    const ok = await trySilentAuth();
    if (!ok) throw new Error('Google Drive session expired -- reconnect required.');
    return accessToken;
  }

  async function findFileId() {
    if (cachedFileId) return cachedFileId;
    const stored = getStoredFileId();
    if (stored) {
      cachedFileId = stored;
      return cachedFileId;
    }
    // Fallback for the very first lookup before we've ever cached an ID
    // (e.g. right after signIn, or a fresh browser profile). Once found,
    // we persist the ID and never search by name again.
    const token = await ensureToken();
    const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
      fields: 'files(id,name)',
      q: `name='${FILE_NAME}' and trashed=false`
    });
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const data = await res.json();
    cachedFileId = (data.files && data.files[0]) ? data.files[0].id : null;
    if (cachedFileId) setStoredFileId(cachedFileId);
    return cachedFileId;
  }

  async function load() {
    const token = await ensureToken();
    const fileId = await findFileId();
    if (!fileId) return null;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 404) {
      // File was deleted, or permanently removed from the app's drive.file
      // grant some other way. Forget the stale ID so the next save() creates
      // a fresh file instead of retrying a dead one forever.
      cachedFileId = null;
      clearStoredFileId();
      return null;
    }
    if (!res.ok) throw new Error(`Drive read failed: ${res.status}`);
    return res.json();
  }

  async function save(doc) {
    const token = await ensureToken();
    const fileId = await findFileId();
    const body = JSON.stringify(doc, null, 2);
    const boundary = 'motsa-jiki-boundary';
    const metadata = fileId ? {} : { name: FILE_NAME, mimeType: 'application/json' };

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
    if (data.id) {
      cachedFileId = data.id;
      setStoredFileId(data.id);
    }
    return true;
  }

  global.GDriveEngine = {
    getClientId, setClientId, trySilentAuth, signIn, signOut,
    isConnected, hasEverConnected, load, save
  };
})(window);
