# Troubleshooting

> Common issues and how to fix them.  
> Last updated: March 18, 2026

---

## Native App

### App shows no gestures (blank screen)

**Cause:** Database not populated or sync failed.

**Fix:**
1. Check your network connection
2. Open Developer Tools (Settings → Developer) and tap "Force Sync"
3. If still blank, tap "Reset Database" → this drops SQLite and triggers a full re-sync

**Debug:**
```bash
# Check SQLite via Expo Go / Development build console
# Look for: [convexSyncService] Sync completed successfully
```

---

### "Database not initialized" error

**Cause:** `databaseService.initialize()` hasn't completed yet.

**Fix:** The app uses `useDbReady()` hook to gate navigation. If you're seeing this in a screen, make sure the screen waits for `isDbReady` before accessing the database.

---

### Video not playing in simulator

**Cause:** HLS streams sometimes don't work in the iOS Simulator.

**Fix:** Test video playback on a physical device or use Expo Go on a real phone.

---

### Expo build fails with "Module not found"

**Cause:** Missing workspace dependency or stale bun.lock.

**Fix:**
```bash
bun install --frozen-lockfile
# If still failing:
rm -rf node_modules bun.lock
bun install
```

---

### Type errors after pulling main

**Cause:** New types added to `@smog/types` or `@smog/shared` that your code doesn't use yet, or a breaking change in a package API.

**Fix:**
```bash
bun check-types 2>&1 | head -30  # See specific errors
bun install                        # Install any new packages
```

---

## Web App

### Blank admin panel

**Cause:** Not logged in as admin, or WorkOS session expired.

**Fix:**
1. Visit `/auth/login` and log in
2. Check that your user has `role: "admin"` in the Convex `users` table

---

### oRPC call fails with 401

**Cause:** Session cookie expired or missing.

**Fix:**
1. Log out and log back in
2. Check `WORKOS_API_KEY` and `WORKOS_CLIENT_ID` in `apps/server/.env`

---

### Sponsors wizard preview generation fails

**Cause:** Remotion server not running, or Convex not accessible.

**Fix:**
```bash
# Start all required services
bun dev

# Check Remotion server specifically
bun -F remotion dev
```

---

### "Failed to create sponsorships" on payment step

**Cause:** Gesture already has an active or pending sponsorship.

**Fix:** Check in the admin panel whether the selected gesture already has a sponsorship. If so, it must expire before a new one can be created.

---

### Mollie webhook not received locally

**Cause:** Mollie can't reach `localhost`.

**Fix:** Use [ngrok](https://ngrok.com/) to expose your local server:
```bash
ngrok http 3000
# Then set MOLLIE_WEBHOOK_URL=https://xxx.ngrok.app/api/webhooks/mollie
# in your Mollie test dashboard
```

---

## Convex

### "Convex not initialized" error

**Cause:** `CONVEX_URL` env var is missing or incorrect.

**Fix:**
1. Check `apps/server/.env` has `CONVEX_URL=https://your-project.convex.cloud`
2. Check `apps/web/.env` has `VITE_CONVEX_URL=https://your-project.convex.cloud`
3. Run `bun -F @smog/convex dev` and confirm connection

---

### Schema migration fails

**Cause:** Breaking change to the Convex schema without a data migration.

**Fix:**
1. Run `bun -F @smog/convex dev` and check the Convex dashboard for errors
2. If data migration is needed, write a migration function in `convex/migrations.ts`
3. For the local SQLite cache, increment `DATABASE_TARGET_VERSION` in `@smog/config`

---

## Build

### `bun build` fails with type errors

**Fix:**
```bash
bun check-types         # See all type errors first
bun check               # Fix auto-fixable lint errors
bun build               # Retry
```

### Turborepo cache stale

**Fix:**
```bash
bun run build -- --force  # Force rebuild ignoring cache
```

---

## Performance

### Native app slow to load gestures

**Cause:** SQLite query without an index, or too many gestures in memory.

**Fix:**
1. Check that `DATABASE_TARGET_VERSION` was incremented and indexes were created
2. Use `gestureService.searchGestures()` (which queries SQLite with indexes) instead of loading all then filtering in JS

### Web admin table slow

**Cause:** Rendering 500+ gestures in the DOM.

**Fix:** The `AdminTable` uses `limit: 500` on the query. For larger datasets, add pagination by lowering the limit and implementing a cursor.

---

## Getting More Help

1. Check the relevant doc in `docs/` for your area
2. Check the commit history: `git log --oneline --all` often reveals context
3. Use `bun check-types` — TypeScript errors usually point directly to the problem
4. Add temporary logging: `createLogger("debug").debug("value:", value)`
