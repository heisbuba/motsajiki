import { json, isAllowedOrigin } from '../../_lib/http.js';

// POST /api/gdrive/exchange  { code }  ->  { access_token, expires_in, refresh_token }
export async function onRequestPost({ request, env }) {
  if (!isAllowedOrigin(request, env)) return json({ error: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_body' }, 400); }
  const { code } = body || {};
  if (!code) return json({ error: 'missing_code' }, 400);

  const origin = request.headers.get('Origin') || '';
  const params = new URLSearchParams({
    code,
    client_id: env.GDRIVE_CLIENT_ID,
    client_secret: env.GDRIVE_CLIENT_SECRET,
    // GIS's initCodeClient in popup mode defaults redirect_uri to the page's
    // own origin -- this MUST match exactly or the exchange is rejected.
    redirect_uri: origin,
    grant_type: 'authorization_code'
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const data = await tokenRes.json();
  if (!tokenRes.ok) return json({ error: data.error || 'exchange_failed' }, 400);

  return json({
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: data.refresh_token || null // null if Google didn't issue a new one -- see notes
  });
}
