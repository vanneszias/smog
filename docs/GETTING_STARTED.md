# Getting Started

> Last updated: June 10, 2026

## Prerequisites

- Bun 1.1 or newer
- Node.js 20 or newer for tools that require Node
- Xcode for iOS development
- Android Studio for Android development
- A Convex deployment and credentials for WorkOS, Mux, Mollie, and Remotion
- Redis when testing queued email locally

## Install

```bash
git clone <repo-url> smog
cd smog
cp .env.example .env
bun install
```

The repository uses one root `.env`. All supported variables and comments live
in [`.env.example`](../.env.example).

## Minimum Local Configuration

```env
CONVEX_URL=https://your-project.convex.cloud
VITE_CONVEX_URL=https://your-project.convex.cloud
EXPO_PUBLIC_CONVEX_URL=https://your-project.convex.cloud

WORKOS_CLIENT_ID=client_xxx
WORKOS_CLIENT_SECRET=sk_xxx
VITE_WORKOS_CLIENT_ID=client_xxx
VITE_WORKOS_REDIRECT_URI=http://localhost:3001/callback

VITE_SERVER_URL=http://localhost:3000
EXPO_PUBLIC_SERVER_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
```

For sponsorship development, also configure Mux, Mollie, Remotion, SMTP, and
Redis values from `.env.example`.

OpenPanel is optional in development. Web analytics is relayed through the
server so the client secret is never exposed to the browser. Analytics remains
disabled when client credentials are absent:

```env
OPENPANEL_API_URL=https://analytics.zias.be/api
OPENPANEL_CLIENT_ID=
OPENPANEL_CLIENT_SECRET=

EXPO_PUBLIC_OPENPANEL_API_URL=https://analytics.zias.be/api
EXPO_PUBLIC_OPENPANEL_CLIENT_ID=
EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET=
```

Never expose a client secret through a `VITE_*` variable. The native SDK still
requires a native client secret in the compiled app; use a separate,
least-privileged OpenPanel client for native.

## Start Services

```bash
bun dev
```

Or run them separately:

```bash
bun -F @smog/convex dev
bun -F server dev
bun -F web dev
bun -F remotion dev
bun -F native dev
```

The native app uses development builds because it includes native modules:

```bash
bun -F native ios
bun -F native android
```

## Architecture Notes

- Native and web read gesture, favorite, and list data directly from Convex.
- WorkOS provides OAuth identity; the API handles token exchange and refresh.
- Sponsor previews and final videos are composed by Remotion and stored in Mux.
- Mollie hosts payment entry; SMOG does not receive full card or bank details.
- OpenPanel starts only after explicit analytics consent.

## Verification

Run the same checks used before release:

```bash
bun check
bun check-types
bun -F web test
bun -F @smog/convex test
bun -F @smog/hooks test
bun -F @smog/shared test
bun run build
knip --no-progress --no-config-hints
```

See [Architecture](./ARCHITECTURE.md), [Data Flow](./DATA_FLOW.md),
[Payment Flow](./PAYMENT_FLOW.md), and
[Privacy and Analytics](./PRIVACY_AND_ANALYTICS.md).
