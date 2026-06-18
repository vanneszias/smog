# Payments

## Table of contents

- API surface
- Method-specific flows
- Amount format
- Redirect URL contract
- Description, metadata, locale
- Sequence type (saved cards / subscriptions)
- Refunds and cancellations

## API surface

Mollie has one core endpoint for accepting money: `POST /v2/payments`. There is no equivalent of Stripe's PaymentIntent vs Checkout Session distinction — every payment is a single resource that either redirects the buyer (most methods) or completes inline (cards with a `cardToken` and no 3DS).

```ts
// @mollie/api-client
const payment = await client.payments.create({
  amount: { currency: "EUR", value: "19.99" },
  description: "Order #1234",
  redirectUrl: "https://shop.example.com/payment/return?cart_id=abc",
  webhookUrl: "https://api.example.com/mollie/webhook",
  method: "ideal",            // omit to let Mollie pick at checkout
  metadata: { session_id },   // anything you'll need on webhook lookup
  cardToken: tok_from_components, // only for inline card flow
  locale: "nl_NL",
})
```

You read back `payment.id` (format `tr_…`), `payment.status`, and `payment.getCheckoutUrl()` (or `payment._links.checkout.href`).

## Method-specific flows

### iDEAL, Bancontact, Klarna, PayPal, Apple Pay

All redirect-based. Flow:

1. Backend creates payment with `method: "ideal"` (or similar) — Mollie returns a `checkoutUrl`.
2. Storefront `window.location.href = checkoutUrl`. Buyer completes payment on Mollie's hosted page (which in turn redirects through the bank/wallet).
3. Buyer returns to `redirectUrl`. Status is whatever Mollie has at that moment.
4. Storefront polls the payment until `paid` / `canceled` / `failed`, then finalises the order.

For iDEAL specifically you can pre-fill the bank with `issuer: "ideal_INGBNL2A"` (Mollie also shows a picker if omitted).

### Credit card via Mollie Components

Inline card form using the Components SDK. The card never touches your DOM / server.

1. Storefront mounts Components iframes (cardNumber, expiryDate, verificationCode — see `references/components.md`).
2. On submit, JS calls `mollie.createToken()` → `{ token: "tok_…" }`.
3. Storefront sends the token to backend via your "initiate payment" mutation.
4. Backend creates payment with `method: "creditcard"` + `cardToken: "tok_…"`.
5. Mollie returns a `checkoutUrl`. **Always redirect through it**, even when no 3DS is needed — it acts as the success thank-you and bounces back to `redirectUrl`. This unifies the post-payment flow.

### Method-agnostic ("show me everything")

Omit `method` entirely. Mollie's hosted checkout shows a method picker, lets the buyer choose, and runs the rest. Useful as a single integration covering everything; downside is the storefront UI is two-step ("Pay" button → Mollie's picker) instead of method-first.

## Amount format

Mollie wants amounts as strings with exactly two decimal places, plus an uppercase ISO-4217 currency code:

```ts
{ value: "19.99", currency: "EUR" }
```

Common bugs:

- `{ value: 19.99 }` — JSON number, rejected (`value must be a string`).
- `{ value: "1999" }` — interpreted as €1,999.00.
- `{ value: "19.9" }` — rejected (`value does not match the required format`).
- Forgetting to uppercase the currency: `"eur"` is rejected by some Mollie SDK versions.

When integrating with Medusa whose cart totals come as `BigNumber`, convert via `parseFloat(new BigNumber(amount).toString()).toFixed(2)`.

## Redirect URL contract

`redirectUrl` is **required**. Set it to a page on your storefront that:

1. Reads the cart / session identifier from the URL.
2. Polls Mollie (via your backend) for current payment status.
3. Finalises the order when `paid` (or `authorized` for pay-later methods like Klarna).
4. Shows an error / "try again" path on `canceled` / `expired` / `failed`.

Use a stable URL pattern like `/[country]/order/processing?cart_id=…`. Don't include the order id in the URL — no order exists yet at the time the URL is generated.

## Description, metadata, locale

- `description`: shown to the buyer on Mollie's hosted page and on bank statements. Keep it human-readable (`"Order #1234 — kairos.shop"`), not internal IDs.
- `metadata`: arbitrary key-value blob, max 1KB, returned on every `GET /payments/:id` and on webhook lookups. **Always store the upstream session / cart ID here** so your webhook handler can map the Mollie payment back to your domain object.
- `locale`: BCP-47 underscore form (`nl_NL`, `en_US`, `de_DE`, `fr_FR`). Mollie's hosted checkout localises accordingly. Defaults to the buyer's browser locale if omitted.

## Sequence type (saved cards / subscriptions)

For recurring billing or saved cards:

- First payment: pass `sequenceType: "first"` + a `customerId` (created via `POST /v2/customers`). Mollie creates a mandate during this payment.
- Subsequent off-session charges: `sequenceType: "recurring"` + same `customerId`. No buyer interaction, no `redirectUrl` needed (though Mollie still accepts one).

The `customerId` is Mollie's identifier (`cst_…`), not your own customer ID. Store it on your Medusa customer record (a module link to a "mollie_customer" entity is the clean shape).

## Refunds and cancellations

- Cancel a pending payment: `client.payments.cancel(id)`. Only works while the payment is `open` or `pending` (i.e., not yet captured). After `paid`, you must refund.
- Refund: `client.paymentRefunds.create({ paymentId, amount: { currency, value } })`. Partial refunds supported. Mollie issues refund IDs (`re_…`) which you should store alongside the payment.

## Idempotency (SDK limitation)

Mollie's REST API accepts an `Idempotency-Key` HTTP header on `POST /v2/payments` and `POST /v2/payments/:id/refunds` for safe retries. **`@mollie/api-client@4.x` does NOT expose this header** — the `create(parameters)` signature only accepts the body parameters, no per-request options object. Verified against `node_modules/@mollie/api-client/dist/types/binders/payments/PaymentsBinder.d.ts`:

```ts
create(parameters: CreateParameters): Promise<Payment>;
create(parameters: CreateParameters, callback: Callback<Payment>): void;
```

To get idempotent creates with the v4 SDK you'd have to bypass the SDK and use raw `fetch` against Mollie's HTTP API. Not worth doing for most integrations — Medusa's payment session lifecycle already prevents double-initiates at the workflow level. Reconsider when migrating to `@mollie/api-client@5+` if/when it exposes per-request headers.
