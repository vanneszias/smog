# API Routers

> Last updated: June 10, 2026

The Hono server mounts the oRPC handler at `/rpc` and the OpenAPI reference
handler at `/api-reference`. Router definitions live in
`packages/api/src/routers/`.

## Routers

| Router | Main procedures |
|---|---|
| `gestures` | `list`, `getById`, `search` |
| `categories` | `list`, `getByIds` |
| `favorites` | get IDs/gestures, toggle, check |
| `lists` | initialize, CRUD, sharing, list items, reordering |
| `users` | get/create current user, WorkOS lookup |
| `sponsorships` | list availability, preview, create, pay, success lookup, re-edit |
| `admin` | users, gestures, categories, sponsorships, Mux, audit logs |

## Example

```typescript
import { useQuery } from "@tanstack/react-query";
import { client, orpc } from "@/utils/orpc";

const gestures = useQuery(
  orpc.sponsorships.listGesturesWithSponsorship.queryOptions()
);

const preview = await client.sponsorships.generatePreview({
  gestureId,
  sponsorName,
  overlayText,
  logoImage,
});
```

## Gesture Inputs

- `gestures.list`: `{ cursor?: string; numItems?: number }`
- `gestures.getById`: `{ id: string }`
- `gestures.search`: `{ searchText: string; limit?: number }`

## Sponsorship Flow

- `listGesturesWithSponsorship`
- `generatePreview`
- `createBulkSponsorshipsSimplified`
- `createBulkPayment`
- `getSponsorshipsByPaymentId`
- `getByReEditToken`
- `reSubmitSponsorship`

The server recalculates pricing in Convex. Public re-edit procedures authenticate
with a random, expiring token rather than a user session.

## Admin Structure

`admin.verifyAdmin` checks access. Nested groups expose:

- `admin.users`
- `admin.gestures`
- `admin.categories`
- `admin.sponsorships`
- `admin.logs`

Admin sponsorship actions include listing, approval, rejection, expiry,
restoration, re-edit links, pending-payment cancellation, manual payment
marking, and CSV export.

## Authentication

`publicProcedure`, `protectedProcedure`, and `adminProcedure` are defined in the
API package. Protected requests pass a WorkOS bearer token through the request
context; admin procedures additionally verify the Convex user role.

## Plain Hono Routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/workos/callback` | Exchange WorkOS code |
| `POST` | `/auth/token/refresh` | Refresh access token |
| `POST` | `/auth/token/clear` | Clear web session cookie |
| `POST` | `/webhooks/mollie` | Verify payment update |
| `POST` | `/api/video/master-access` | Temporary Mux source URL |
| `POST` | `/api/email/trigger` | Authenticated internal email job |
| `GET` | `/api/email/preview/:template` | Render an admin-only sample email |

See [Payment Flow](./PAYMENT_FLOW.md) and
[Privacy and Analytics](./PRIVACY_AND_ANALYTICS.md).
