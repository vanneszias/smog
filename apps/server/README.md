# SMOG Server

Hono API running on Bun.

## Responsibilities

- oRPC and OpenAPI endpoints from `@smog/api`
- WorkOS OAuth callback, refresh, and logout
- Mollie payment webhook handling
- Remotion master-video access
- Transactional email rendering and BullMQ processing
- Sponsorship expiry, renewal reminder, and stale-payment jobs
- OpenTelemetry export when configured

Video composition runs in `apps/remotion`; the API coordinates jobs but does
not compose video with FFmpeg.

## Commands

```bash
bun -F server dev
bun -F server build
bun -F server check-types
```

## Environment

See the root `.env.example`. Core server values include:

```env
CONVEX_URL=
WORKOS_CLIENT_ID=
WORKOS_CLIENT_SECRET=
MOLLIE_API_KEY=
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
REMOTION_URL=http://localhost:3002
REMOTION_API_KEY=
INTERNAL_API_KEY=
CORS_ORIGIN=http://localhost:3001
REDIS_URL=redis://localhost:6379/1
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

Redis is required for queued email processing. IMAP settings are optional and
used to save sent mail.

## Routes

- `/rpc/*`: oRPC procedures
- `/api/*`: OpenAPI procedures
- `/auth/workos/callback`: WorkOS code exchange
- `/auth/token/refresh`: access-token refresh
- `/auth/token/clear`: logout cookie cleanup
- `/webhooks/mollie`: Mollie payment status
- `/api/video/master-access`: authenticated Remotion source access
- `/api/email/trigger`: authenticated internal email enqueueing
