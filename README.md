# MotsaJiki

User-first and privacy-focused offline workout tracker. Nothing shiny; just getting the job done. No Personal data needed. Just the goals, counts, and streaks.

## Features

- Log workouts and track counts and streaks
- Set goals and earn milestone badges
- Works fully offline (data stored locally in IndexedDB)
- Optional Google Drive sync across devices

## Getting Started
This is a static app (no build step). Logging, goals, badges, and offline storage all work with zero configuration.
 
1. Clone the repo:
```
   git clone https://github.com/heisbuba/motsajiki.git
   cd motsajiki
```
2. Serve it with any static file server, e.g.:
```
   npx serve .
```
 
### Google Drive sync (optional)
Sync is not plug-and-play. To get it working locally or on your own deployment, follow steps below:
 
1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, enable the Drive API, configure the OAuth consent screen, and create an OAuth 2.0 Client ID (Web application). Add the exact origin you'll serve the app from (e.g. `http://localhost:8788`) as an authorized JavaScript origin — the backend rejects the token exchange on any mismatch.
2. Replace `DEFAULT_CLIENT_ID` in `js/gdrive.js` with your own client ID. The app doesn't currently expose a UI setting for this (there's an unused `setClientId()` helper, but nothing calls it), so editing the constant is the only way to point the frontend at your OAuth client.
3. Run the app through Cloudflare's dev server so `/functions/api/gdrive/*` is live:
```
   npx wrangler pages dev .
```
4. Set your client ID and secret as env vars (or in `.dev.vars`):
```
   GDRIVE_CLIENT_ID=...
   GDRIVE_CLIENT_SECRET=...
```
   `ALLOWED_ORIGIN` is optional — if unset, the API accepts requests from any origin.

## Contribute
Issues and pull requests are welcome on [GitHub](https://github.com/heisbuba/motsajiki). If you're filing a bug, include steps to reproduce; if you're proposing a feature, open an issue first so it can be discussed before you put in the work on a PR.

## Licence
MIT © Buba. See [LICENSE](LICENSE) for the full text.
