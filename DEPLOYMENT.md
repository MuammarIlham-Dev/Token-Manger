# Token Manager deployment

Token Manager is a static Vite app. The Vercel configuration at the repository root builds only `artifacts/ai-token-timer` and serves its static output. No API server, serverless function, or database is needed or deployed.

## Deploy to Vercel

1. Import this repository into Vercel and keep the project root set to the repository root.
2. Let Vercel use the repository's `vercel.json` build, install, output, and SPA rewrite settings.
3. Deploy. The app's `/ide/...` routes are rewritten to the static app shell.

The app stores profiles, timer timestamps, preferences, and activity in IndexedDB for the current browser and site origin. Users do not share data or sync between devices. Browser site data can be deleted, so users should export JSON backups from **Preferences & backups**.

If profiles are still in the previous API-backed version, open that version's `/api/profiles` URL, save the JSON response, then import the file from **Preferences & backups** in the new app. For a local database, start the old API with `pnpm --filter @workspace/api-server run dev`, open `http://localhost:5000/api/profiles`, and save its JSON response. The old single cooldown is migrated to the quota timer; the token timer starts ready with a one-hour duration, which you can adjust per profile.

Token refresh and quota reset timers are manually started per profile. They use the device's wall clock and recalculate from saved end timestamps after reload or sleep. Notifications work only while the app is open and permission has been granted. Token Manager does not connect to AI providers or read their actual usage/quota state.
