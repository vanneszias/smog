# Payment Flow

> Last updated: March 18, 2026  
> See also: [DATA_FLOW.md](./DATA_FLOW.md)

## Overview

SMOG uses **Mollie** as its payment provider for sponsorship purchases. The flow is:

1. Sponsor completes wizard and clicks "Proceed to payment"
2. Server creates Mollie payment and returns a checkout URL
3. Sponsor completes payment on Mollie's hosted checkout
4. Mollie sends a webhook to confirm payment
5. Server updates sponsorship status

---

## Step-by-Step Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ Web App (apps/web)                                               │
│                                                                  │
│ 1. POST /api/sponsorships/create-bulk-simplified                 │
│    Body: { gestureIds, sponsorName, ..., previewVideoPlaybackIds }│
│    Response: { sponsorshipIds: string[] }                        │
│                                                                  │
│ 2. POST /api/sponsorships/create-bulk-payment                    │
│    Body: { sponsorshipIds, amount }                              │
│    Response: { checkoutUrl: string }                             │
│                                                                  │
│ 3. window.location.href = checkoutUrl                            │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│ Mollie Checkout (hosted)                                         │
│ Sponsor enters card/bank details and pays                        │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼ (payment completed)
┌──────────────────────────────────────────────────────────────────┐
│ Mollie → POST /api/webhooks/mollie                               │
│ Body: { id: molliePaymentId }                                    │
│                                                                  │
│ Server:                                                          │
│ 1. Fetches payment status from Mollie API                        │
│ 2. If paid:                                                      │
│    a. Updates sponsorships: status → pending_approval            │
│    b. Sends confirmation email to sponsor                        │
│    c. Notifies admin via email                                   │
│ 3. If failed/cancelled: logs and does nothing                    │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼ (admin action in admin dashboard)
┌──────────────────────────────────────────────────────────────────┐
│ Admin approves                                                   │
│ 1. Status → active                                               │
│ 2. Server queues Remotion render job                             │
│ 3. Remotion composes final video with sponsor overlay            │
│ 4. MUX upload → returns sponsoredVideoPlaybackId                 │
│ 5. Convex gesture updated with sponsoredVideoPlaybackId          │
│ 6. Confirmation email sent to sponsor                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## Redirect After Payment

After Mollie payment, the sponsor is redirected to `/sponsors/success?paymentId=xxx`.

The success page:
1. Fetches sponsorship details using `paymentId`
2. Shows confirmation message with gesture names
3. Explains what happens next (admin review timeline)

---

## Re-Edit Flow

If a sponsor needs to update their logo or sponsor name after payment but before approval:

1. Admin generates a re-edit link from the admin dashboard
2. Link is valid for 7 days
3. Sponsor visits the link → pre-fills wizard with existing data
4. Sponsor submits updated details
5. Sponsorship moves back to `pending_approval`

---

## Pricing

Pricing is calculated client-side for display and server-side for the actual charge:

| Item | Price |
|------|-------|
| Base price per gesture per year | €50.00 (5000 cents) |
| Logo add-on per gesture | €10.00 (1000 cents) |

Constants are defined in `packages/config/src/constants.ts` (`PRICE_PER_YEAR_CENTS`, `LOGO_ADDON_CENTS`).

The Convex `createBulkSimplified` mutation recalculates the price server-side using the same constants (kept local to avoid Convex runtime dependency issues).

---

## Mollie Configuration

Mollie credentials are managed via environment variables:

```
MOLLIE_API_KEY=live_xxx  (or test_xxx for development)
```

The Mollie client is initialised in `packages/auth/src/server.ts` and used in `packages/api/src/routers/sponsorships.ts`.

---

## Testing Payments

For development and testing, use Mollie's test mode:
- Set `MOLLIE_API_KEY=test_xxx`
- Use Mollie's [test payment methods](https://docs.mollie.com/overview/testing)
- Webhooks can be tested using [ngrok](https://ngrok.com/) or the Mollie dashboard webhook simulator
