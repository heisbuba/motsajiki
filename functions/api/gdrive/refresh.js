import { json, isAllowedOrigin } from '../../_lib/http.js';

// POST /api/gdrive/refresh  { refresh_token }  ->  { access_token, expires_in }
export async function onRequestPost({ request, env }) {
  if (!isAllowedOrigin(request, env)) return json({ error: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_body' }, 400); }
  const { refresh_token } = body || {};
  if (!refresh_token) return json({ error: 'missing_refresh_token' }, 400);

  const params = new URLSearchParams({
    refresh_token,
    client_id: env.GDRIVE_CLIENT_ID,
    client_secret: env.GDRIVE_CLIENT_SECRET,
    grant_type: 'refresh_token'
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const data = await tokenRes.json();
  if (!tokenRes.ok) {
    // invalid_grant -- refresh token itself is dead (revoked, rotated, or
    // 6 months unused). Nothing to retry; caller must go through signIn() again.
    return json({ error: data.error || 'refresh_failed' }, 400);
  }

  return json({ access_token: data.access_token, expires_in: data.expires_in });
}
