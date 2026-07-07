---
name: mollie-best-practices
description: >-
  Guides Mollie payments integration — API selection (Payments API vs Mollie
  Components vs hosted checkout), iDEAL and credit card flows for EU
  ecommerce, Medusa v2 custom payment provider implementation, webhook
  handling, return-URL polling, Components SDK styling pitfalls, and common
  API rejections (profileId, padding shorthand). Use when building,
  modifying, or reviewing any Mollie integration — including accepting
  payments in EU/NL stores, processing iDEAL, integrating Mollie Components
  for inline card forms, building a custom Medusa payment provider, or
  migrating from Stripe to Mollie. Captures Mollie-specific gotchas that
  the Stripe-best-practices skill does not cover.

---

Mollie account types: **regular API key** (`test_…`, `live_…`) is enough for single-profile merchants. **Organization access token** (OAuth) is only needed for platforms acting on behalf of multiple merchants — almost no direct integration needs it.

Default integration surface for Dutch / EU stores: **redirect to Mollie's hosted checkout for iDEAL, Bancontact, Klarna, PayPal, Apple Pay; use Mollie Components for inline credit cards**. Mixing both is the standard pattern — see `references/payments.md` for the decision matrix.

## Integration routing

| Building…                                                 | Recommended path                              | Details                    |
| --------------------------------------------------------- | --------------------------------------------- | -------------------------- |
| One-time payment via iDEAL / Bancontact / Klarna / PayPal | Payments API → redirect to `checkoutUrl`      | `references/payments.md`   |
| Inline credit card form (no host redirect for low-risk)   | Mollie Components SDK → `cardToken`           | `references/components.md` |
| Recurring subscriptions / saved cards                     | First payment with `sequenceType: "first"` + mandate / customer ID | `references/payments.md`   |
| Async confirmation                                        | Webhook + return-URL polling (always both)    | `references/webhooks.md`   |
| Medusa v2 backend (custom payment provider module)        | `AbstractPaymentProvider` extension           | `references/medusa.md`     |
| Storefront UI (Stripe-style picker, Components form)      | See pattern + gotcha list                     | `references/components.md` |
| Debugging API rejections                                  | Common errors index                           | `references/pitfalls.md`   |

Read the relevant reference before answering or writing code — Mollie's documented surface is small but the iframe SDK and Medusa integration have non-obvious traps.

## Critical rules

- **Never send `profileId` to `/v2/payments` with a regular API key.** The field is only valid for organization access tokens. With API key auth, Mollie rejects the request as `Non-existent body parameter "profileId"`. The profile is implicit from the key. (Storefront-side `profileId` for Mollie Components is a different mechanism — that one *is* required, exposed as `NEXT_PUBLIC_MOLLIE_PROFILE_ID` or equivalent.)
- **`redirectUrl` is required on every Payment create.** Even for inline card flows that auto-complete without 3DS, Mollie returns a `checkoutUrl` and the buyer is redirected through it. Always set a return page that polls for confirmation.
- **The Components iframe doesn't fill its container.** Mollie's `<input>` inside the iframe is its own (~22px) height, top-anchored. CSS from the parent cannot reach inside the sandbox. Vertical centring must happen via `paddingTop`/`paddingBottom` *inside* the iframe (in the `styles.base` object), never via outer flex.
- **`placeholder` option only works for `cardHolder`.** The other Components (`cardNumber`, `expiryDate`, `verificationCode`) ignore `placeholder`. `expiryDate` ships a locale-aware default ("MM / JJ" in nl); the others render empty. Use a `pointer-events-none` overlay span if you want visible hints.
- **Validation errors come on `dirty && error`, never on `touched`.** Mollie fires `change` with `touched: true` after a bare focus+blur with no input. Showing those errors makes empty fields look broken before the buyer interacts. The submit button stays disabled until every field reports `valid: true`, so empty fields can't slip past.
- **Webhooks are not sufficient on their own.** The buyer often lands on your return page before the webhook arrives. Implement *both*: webhook for the authoritative async signal, return-URL polling for snappy UX. Locally, you can skip the webhook entirely and rely on polling alone — set `MOLLIE_WEBHOOK_URL` empty.
- **Amounts are strings with 2 decimals, currency uppercase ISO-4217.** `{ value: "19.99", currency: "EUR" }`. Never `{ value: 19.99 }` (JSON number, rejected) or `{ value: "1999" }` (treated as €1,999).

## Key documentation

- [Payments API reference](https://docs.mollie.com/reference/v2/payments-api/create-payment) — Payment object, statuses, methods.
- [Mollie Components docs](https://docs.mollie.com/components/overview) — SDK surface, supported style properties.
- [Webhook reference](https://docs.mollie.com/overview/webhooks) — Body shape (`id=tr_xxx` form-urlencoded), retry behaviour.
- [Test cards](https://docs.mollie.com/overview/testing) — `4543 4740 0224 9996` (Visa, paid), `5454 5454 5454 5454` (MC, paid), any future expiry, any CVC.
- [iDEAL test banks](https://docs.mollie.com/payments/testing#testing-ideal) — In test mode, Mollie shows a status selector ("Paid"/"Failed"/"Expired") instead of a real bank handoff.

## Status reference

Mollie payment statuses and their Medusa `PaymentSessionStatus` mapping:

| Mollie status | Medusa session status | Meaning                              |
| ------------- | --------------------- | ------------------------------------ |
| `open`        | `pending`             | Waiting for buyer action             |
| `pending`     | `pending`             | Bank processing                      |
| `authorized`  | `authorized`          | Authorised for capture (Klarna etc.) |
| `paid`        | `captured`            | Money received                       |
| `canceled`    | `canceled`            | Buyer canceled or expired            |
| `expired`     | `canceled`            | Session timed out                    |
| `failed`      | `error`               | Payment declined / failed            |
