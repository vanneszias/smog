# Troubleshooting

> Last updated: June 10, 2026

## Native

### No gestures or search results

1. Confirm `EXPO_PUBLIC_CONVEX_URL` is present in the root `.env`.
2. Confirm the device can reach the Convex deployment.
3. Check the Expo console for a Convex query or authentication error.
4. Restart the development build after changing build-time environment values.

The app no longer has a local SQLite database or force-sync/reset workflow.

### WorkOS sign-in fails

Check `EXPO_PUBLIC_WORKOS_CLIENT_ID`, `EXPO_PUBLIC_SERVER_URL`, the registered
`smog://auth-callback` redirect, and server `WORKOS_CLIENT_ID` /
`WORKOS_CLIENT_SECRET`. Use a development build rather than Expo Go.

### Video does not play

Verify the Mux playback ID and network access. Simulator media behavior can
differ from physical devices, so reproduce on a device before changing player
code.

## Web and API

### Admin page is empty or unauthorized

Sign in at `/login`, then confirm the Convex user has `role: "admin"`. A valid
WorkOS account alone does not grant admin access.

### oRPC returns 401

Check the browser refresh-token cookie, `VITE_SERVER_URL`, server
`WORKOS_CLIENT_ID` / `WORKOS_CLIENT_SECRET`, and CORS credentials. Log out and
back in after changing auth configuration.

### Sponsor preview fails

Run `bun -F remotion dev`, verify `REMOTION_URL` and `REMOTION_API_KEY`, then
check Mux credentials. The API polls the Remotion job for up to two minutes.

### Mollie webhook is not received locally

Mollie cannot call `localhost`. Expose port 3000 with a tunnel and configure the
payment webhook as:

```text
https://<public-host>/webhooks/mollie
```

The router omits a webhook URL for local `CORS_ORIGIN`, so use a public origin
when testing the full callback.

### Transactional email is not sent

Check `REDIS_URL`, SMTP settings, and the server log for the BullMQ worker.
IMAP affects sent-mail archiving, not delivery.

## Analytics

### No events

Confirm the user granted consent. For web, check the server has
`OPENPANEL_CLIENT_ID`, `OPENPANEL_CLIENT_SECRET`, and
`OPENPANEL_API_URL=https://analytics.zias.be/api`. For native, check the
`EXPO_PUBLIC_OPENPANEL_*` values. Tracking intentionally does nothing before
consent.

### Native SDK initialization warning

Expo 55 can trigger the generic `@openpanel/sdk` fallback. Events should still
arrive. Check the subsequent log for a fallback failure before treating the
warning as fatal.

### Consent test

1. Clear site/app storage.
2. Confirm no OpenPanel requests before a choice.
3. Grant consent and navigate. Web should call `/analytics/track`; native should
   call OpenPanel directly.
4. Withdraw consent from privacy/settings.
5. Confirm navigation no longer produces events.

## Convex and Builds

For schema errors, run `bun -F @smog/convex dev` and inspect the deployment
output. Convex schema changes may require an explicit migration before making a
field required.

For repository verification:

```bash
bun check
bun check-types
bun run build
knip --no-progress --no-config-hints
```
