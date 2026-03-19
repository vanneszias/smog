# API Routers

> Last updated: March 18, 2026  
> See also: [ARCHITECTURE.md](./ARCHITECTURE.md), [PAYMENT_FLOW.md](./PAYMENT_FLOW.md)

## Overview

The API layer uses **oRPC** (type-safe RPC over HTTP) with **Zod** input/output schemas. All routers are defined in `packages/api/src/routers/` and mounted on the Hono server in `apps/server/src/index.ts`.

The web app imports the client from `@/utils/orpc` and calls procedures directly — no code generation required.

```typescript
// Web app usage
import { client, orpc } from "@/utils/orpc";

// Query (TanStack Query)
const { data } = useQuery(orpc.sponsorships.listGesturesWithSponsorship.queryOptions());

// Mutation
const result = await client.sponsorships.generatePreview({ gestureId, sponsorName });
```

---

## Router Structure

```
packages/api/src/routers/
├── admin/
│   ├── gestures.ts      — Gesture CRUD for admin panel
│   └── sponsorships.ts  — Sponsorship management for admin panel
├── categories.ts         — Category listing
├── gestures.ts           — Public gesture queries
├── sponsorships.ts       — Sponsor purchase flow (public)
└── users.ts              — User profile
```

---

## `categories` Router

### `categories.list`
List all active categories.

```typescript
// Input: none
// Output: Category[]
const categories = await client.categories.list();
```

---

## `gestures` Router

### `gestures.list`
List all active gestures (paginated).

```typescript
// Input: { limit?: number; cursor?: string }
// Output: { gestures: Gesture[]; nextCursor?: string }
```

### `gestures.get`
Get a single gesture by ID.

```typescript
// Input: { gestureId: string }
// Output: Gesture
```

---

## `sponsorships` Router

### `sponsorships.listGesturesWithSponsorship`
List all gestures with their current sponsorship status. Used by the sponsor selection page.

```typescript
// Input: none
// Output: GestureWithSponsorshipData[]
// (includes gesture fields + sponsorship field if any)
```

### `sponsorships.generatePreview`
Generate a pre-composed preview video for one gesture + overlay combination.  
Triggers a Remotion render and uploads to MUX.

```typescript
// Input:
{
  gestureId: string;
  sponsorName: string;
  logoImage?: string;   // Base64 data URL (optional)
  overlayText: string;
}
// Output: { playbackId: string }
```

### `sponsorships.createBulkSponsorshipsSimplified`
Create Convex sponsorship records after preview generation (before payment).

```typescript
// Input:
{
  gestureIds: string[];
  sponsorName: string;
  sponsorEmail: string;
  contactFullName: string;
  contactCompany?: string;
  overlayText: string;
  logoImage?: string;
  includeLogo: boolean;
  durationYears: number;            // Always 1
  previewVideoPlaybackIds: string[]; // One per gesture, same order as gestureIds
  invoiceRequested?: boolean;
  invoiceName?: string;
  invoiceVatNumber?: string;
  invoiceEmail?: string;
}
// Output: { sponsorshipIds: string[] }
```

### `sponsorships.createBulkPayment`
Create a Mollie payment for multiple sponsorships and return the checkout URL.

```typescript
// Input: { sponsorshipIds: string[]; amount: number }
// Output: { checkoutUrl: string; paymentId: string }
```

### `sponsorships.getSponsorshipsByPaymentId`
Look up sponsorships by Mollie payment ID. Used by the success page.

```typescript
// Input: { paymentId: string }
// Output: SponsorshipWithGesture[]
```

---

## `admin/gestures` Router

Requires admin authentication.

### `admin.gestures.listAll`
List all gestures including inactive ones.

```typescript
// Input: { includeInactive?: boolean; limit?: number }
// Output: AdminGesture[]
```

### `admin.gestures.update`
Update one or more fields of a gesture.

```typescript
// Input: { gestureId: string; name?: string; info?: string; playbackId?: string;
//           concept?: string[]; categoryIds?: string[]; isActive?: boolean }
// Output: { success: boolean }
```

### `admin.gestures.create`
Create a new gesture.

```typescript
// Input: { name: string; playbackId: string; info?: string;
//           concept?: string[]; categoryIds?: string[] }
// Output: { gestureId: string }
```

---

## `admin/sponsorships` Router

Requires admin authentication.

### `admin.sponsorships.listAll`
List all sponsorships with optional status filter.

```typescript
// Input: { status?: string; limit?: number }
// Output: SponsorshipWithGesture[]
```

### `admin.sponsorships.approve`
Approve a pending sponsorship. Triggers Remotion render + email.

```typescript
// Input: { sponsorshipId: string }
// Output: { success: boolean }
```

### `admin.sponsorships.reject`
Reject a pending sponsorship with a reason. Sends rejection email.

```typescript
// Input: { sponsorshipId: string; reason: string }
// Output: { success: boolean }
```

### `admin.sponsorships.forceExpire`
Force-expire an active sponsorship.

```typescript
// Input: { sponsorshipId: string }
// Output: { success: boolean }
```

### `admin.sponsorships.generateReEditLink`
Generate a signed re-edit token link (valid 7 days) for the sponsor to resubmit.

```typescript
// Input: { sponsorshipId: string }
// Output: { url: string }
```

### `admin.sponsorships.markPaidManually`
Manually mark a sponsorship as paid (for offline payments).

```typescript
// Input: { sponsorshipId: string }
// Output: { success: boolean }
```

---

## Error Handling

All procedures throw structured errors that oRPC serialises as HTTP error responses:

```typescript
// Structured error thrown in router
throw new ConvexError("Gesture not found");

// Client receives:
// { code: "CONVEX_ERROR", message: "Gesture not found", recoverable: true }
```

Error codes are defined in `packages/types/src/api.ts` as `ApiErrorCode`.

---

## Authentication

Protected routes use the `authMiddleware` from `@smog/auth`:

```typescript
// Public procedure
export const listGestures = publicProcedure.query(async () => { ... });

// Authenticated procedure  
export const createGesture = authProcedure.mutation(async ({ ctx }) => {
  const { userId } = ctx.auth;
  ...
});

// Admin-only procedure
export const approveSponsorship = adminProcedure.mutation(async ({ ctx }) => {
  // ctx.auth.role === "admin" is guaranteed
  ...
});
```

---

## Webhook Endpoints

These are plain Hono routes (not oRPC) mounted in `apps/server/src/index.ts`:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/webhooks/mollie` | Mollie payment status updates |
| `POST` | `/api/webhooks/mux` | MUX upload completion events |

See [PAYMENT_FLOW.md](./PAYMENT_FLOW.md) for the full Mollie webhook flow.
