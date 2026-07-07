# Webhooks & confirmation

## Table of contents

- Why both webhook and polling
- Webhook body shape
- Local development
- Idempotency
- Verifying authenticity
- Return-URL polling pattern

## Why both webhook and polling

Mollie webhooks are the authoritative async signal — they fire when the payment status changes (paid, canceled, failed, refunded, chargeback…). They are the *only* way to learn about:

- Bank-side delays after the buyer leaves Mollie's hosted page
- Refunds / chargebacks issued from the Mollie Dashboard
- Klarna / pay-later state transitions days after authorisation

But the buyer often lands back on your return URL **before** the webhook arrives — bank → Mollie → your storefront round-trip is usually 1–3 seconds, while the webhook is best-effort and can lag by a few seconds. Without polling, the buyer sees a "pending" page for that gap.

Standard pattern: **implement both**.

- Webhook: persists the change in your database, fires order-completion side-effects, deals with refunds/chargebacks.
- Return-URL polling: gives the buyer immediate confirmation by hitting the payment status API yourself on the return page.

## Webhook body shape

Mollie POSTs the webhook as `application/x-www-form-urlencoded` with a single body parameter:

```
id=tr_xxxxxxxxxx
```

There is no payload data — just the payment ID. **Always re-fetch the payment from Mollie's API in your handler** to get current status. The body is untrusted; an attacker who guessed the URL could spoof it, and you'd authorise an order based on an empty form.

```ts
export async function POST(req: Request) {
  const form = await req.formData()
  const id = form.get("id")
  if (typeof id !== "string") return new Response("Bad request", { status: 400 })

  const payment = await client.payments.get(id)
  // payment.status is now trustworthy — act on it
}
```

Mollie expects a 2xx response within ~15 seconds. Non-2xx responses are retried with exponential backoff for 24 hours. **Return 200 even on processing failures** — repeated retries spam your logs and don't help; reconciliation happens via the next webhook or via polling on the next page load.

## Local development

Mollie can't reach `localhost`, so during local dev you have two options:

1. **Skip the webhook entirely.** Leave `webhookUrl` blank when calling `payments.create`. Mollie won't try to notify you, and return-URL polling alone handles confirmation. This is the recommended local path — zero ngrok/cloudflared friction.
2. **Tunnel:** `cloudflared tunnel --url http://localhost:9001` gives a one-shot public URL for a session. Set `MOLLIE_WEBHOOK_URL` to the issued hostname and webhooks light up.

In production, always set `MOLLIE_WEBHOOK_URL` to your public backend hostname. No code change needed between environments — the same provider code handles "webhook unset" gracefully.

## Idempotency

Webhook fires multiple times for the same payment (status changes from `pending` → `paid`, then later from `paid` → `refunded`, etc.). Your handler must be idempotent:

- Look up the local session/order by the Mollie ID (or by `metadata.session_id` you stored on the payment).
- If the local state already matches what Mollie reports, return 200 without side-effects.
- Use database transactions / advisory locks for "transition to paid" — two simultaneous webhook deliveries shouldn't both fire order-confirmation emails.

**Note on the create side:** `@mollie/api-client@4.x` doesn't expose Mollie's `Idempotency-Key` HTTP header — see `references/payments.md` → "Idempotency (SDK limitation)". Don't try to pass an idempotency key to `payments.create` via the SDK; it'll silently be ignored. Medusa's payment-session workflow prevents double-initiates at the orchestration layer for most flows.

## Verifying authenticity

Mollie does **not** sign webhook bodies (no HMAC header like Stripe's `Stripe-Signature`). Authenticity comes from "re-fetch via authenticated API call" — the body is just a pointer, the truth lives in Mollie's API which only your API key can read.

Don't add custom token/secret URLs (`/mollie/webhook?token=…`) thinking that adds security; the re-fetch is what protects you. The webhook endpoint can be entirely public.

## Return-URL polling pattern

After the buyer is redirected back to your `redirectUrl`:

```tsx
// /[country]/payment/return?cart_id=cart_xxx (client component)
"use client"

const MAX_ATTEMPTS = 12
const RETRY_DELAY_MS = 2000

useEffect(() => {
  let cancelled = false
  let attempt = 0

  async function tick() {
    try {
      await placeOrder(cartId) // server action; redirects on success
    } catch (err) {
      if (isNextRedirectError(err)) throw err // success path
      if (cancelled) return
      if (++attempt >= MAX_ATTEMPTS) {
        setError(err.message)
        return
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      if (!cancelled) tick()
    }
  }
  tick()
  return () => { cancelled = true }
}, [cartId])
```

The server action calls Mollie via your `authorizePayment` provider method, which checks current status:

- `paid` → return `captured`, Medusa creates the order, the redirect fires.
- `pending` / `open` → return `pending`, the server action throws, the client retries.
- `canceled` / `failed` → return `error`, the client shows a retry CTA.

Cap retries at ~24 seconds total (12 × 2s). Beyond that, ask the buyer to refresh or contact support — the webhook will reconcile in the background.
