# Pitfalls

A running index of mistakes the Stripe-best-practices skill *won't* warn you about, because they're specific to Mollie's API shape, SDK bridge, or iframe sandbox.

## API rejections

### `Non-existent body parameter "profileId"`

**Cause:** sending `profileId: "pfl_…"` to `POST /v2/payments` with a regular API key (`test_…` / `live_…`).

**Why:** `profileId` is only valid on requests authenticated with an **organization access token** (OAuth), where one token spans multiple profiles and you need to specify which. API keys are already scoped to one profile.

**Fix:** remove `profileId` from the `payments.create` payload. The same `pfl_…` value is still needed on the storefront for the Mollie Components SDK — exposed as `NEXT_PUBLIC_MOLLIE_PROFILE_ID` and consumed by `window.Mollie(profileId, {...})`. Two different mechanisms, same identifier, only the SDK init needs it.

### `amount.value must be a string`

**Cause:** `{ amount: { value: 19.99, currency: "EUR" } }`.

**Fix:** `{ amount: { value: "19.99", currency: "EUR" } }`. Always a string with exactly two decimals.

### `amount.value does not match the required format`

**Cause:** `{ value: "19.9" }`, `{ value: "20" }`, `{ value: "19.999" }`.

**Fix:** `Number(amount).toFixed(2)` before sending. Strictly two decimals.

### `currency must be a valid ISO 4217 currency code`

**Cause:** `{ currency: "eur" }` or `{ currency: "Eur" }`.

**Fix:** `currency.toUpperCase()`. Mollie's SDK doesn't normalise.

### `redirectUrl is required`

**Cause:** creating a Payment without `redirectUrl`, even for card flows with a `cardToken` that you expect to auto-complete.

**Fix:** always pass `redirectUrl`. Mollie always returns a `checkoutUrl` and expects the buyer to flow through it, even when no 3DS is needed.

## Components SDK

### `cardNumber` / `verificationCode` placeholder doesn't show

**Cause:** `mollie.createComponent("cardNumber", { placeholder: "1234 ..." })`.

**Why:** only `cardHolder` honours the `placeholder` option. The other fields ignore it.

**Fix:** render a `pointer-events-none` overlay span on top of the mount div, gated on `!dirty` from the change-event state. Use `flex items-center` on both the overlay and the wrapper so they share the row's vertical centre.

### `padding` shorthand applies vertical but not horizontal

**Cause:** `styles.base.padding: "14px 12px"`.

**Why:** Mollie's iframe style bridge doesn't parse the shorthand reliably — sometimes only the first value gets through.

**Fix:** use per-side keys: `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`. Move horizontal positioning to your wrapper (`px-3` on the row) and let Mollie's padding handle only the vertical centring.

### Typed text top-aligned in the iframe row

**Cause:** Mollie's `<input>` is ~22px tall, top-anchored in the iframe. Outer flex / `items-center` can't reach inside the sandbox.

**Fix (only one that works):** vertical padding inside `styles.base`. For a 48px row target:
```ts
{
  fontSize: "16px",
  lineHeight: "16px",
  paddingTop: "14px",
  paddingBottom: "14px",
}
```
14 + 16 + 14 = 44px input, centres in a 48px wrapper via outer `flex items-center`.

### Forcing iframe height makes things worse

**Cause:** `[&_iframe]:h-full!` on the panel wrapper.

**Why:** the iframe stretches to fill, but Mollie's input inside stays at its natural ~22px height anchored to the top — now you have *more* empty space below, and the click target is still small.

**Fix:** don't force iframe height. Let it size to content; centre it in the row via the wrapper's `flex items-center`. Pad the input internally (above).

### Validation error appears before the buyer types

**Cause:** `onErrorChange(event.error || null)` called for every `change` event without gating.

**Why:** Mollie fires `change` with `touched: true` after a bare focus+blur of an empty field, with an "is empty" error attached.

**Fix:** gate on `event.dirty && event.error`. The submit button stays disabled on `!valid` so empty fields can't slip past silently — the gating just hides noise.

### Multiple field errors clobber each other

**Cause:** parent stores a single `errorMessage` string updated by every field's change handler. Last write wins; fixing one field hides errors on others.

**Fix:** track per-field errors in a map, surface the first non-null one upward. `FIELD_KEYS.map(k => errors[k]).find(Boolean)`.

## Medusa integration

### Region payment-providers picker is empty after adding Mollie

**Cause:** restarted the backend with the new `medusa-config.ts`, but the existing region row in the DB still only references `pp_system_default`.

**Fix:** run an upgrade step that calls `updateRegionsWorkflow` with the new provider list. Don't rely on the initial seed (it only runs against fresh DBs). See `references/medusa.md` → "Region wiring" for the idempotent pattern.

### Storefront still shows only Manual Payment after backend restart

**Cause:** Next.js fetch cache. `listCartPaymentMethods` uses `cache: "force-cache"` with a `payment_providers` tag.

**Fix:** restart the storefront with `dev:clean` (kills port, removes `.next`, restarts), or trigger a `revalidateTag("payment_providers")` from a route handler.

### Webhook handler can't find the local session

**Cause:** didn't store `session_id` on Mollie's `metadata` when creating the payment.

**Fix:** in `initiatePayment`, set `metadata: { session_id: input.data?.session_id }`. The Payment Module auto-injects `session_id` into `input.data` before calling your provider — you just need to forward it.

### `processPaymentWorkflow` does nothing after webhook fires

**Cause:** `getWebhookActionAndData` returned `{ action: "not_supported" }` because metadata lookup failed.

**Fix:** check that `payment.metadata.session_id` exists (i.e., the create-payment step actually stored it). Webhook-only payments created outside Medusa won't have this field — handle that case explicitly.

## Local development

### Mollie can't reach `localhost`

Mollie's webhook delivery service doesn't speak your `127.0.0.1`. Two options:

1. **Skip the webhook entirely locally** — leave `MOLLIE_WEBHOOK_URL` blank. The provider won't send `webhookUrl` to Mollie, and return-URL polling handles confirmation. Recommended.
2. **Tunnel:** `cloudflared tunnel --url http://localhost:9001`. Set the resulting URL as `MOLLIE_WEBHOOK_URL`.

### Test API key leaked in chat / git

Test keys (`test_…`) can't move real money, so the blast radius is essentially zero. Still, treat it as a clean-habit drill: dashboard → Developers → API keys → Revoke, generate a new one.

## Misc

### Mollie's hosted checkout shows English even when buyer locale is Dutch

**Cause:** missing `locale` field on `payments.create`.

**Fix:** pass BCP-47 underscore form: `locale: "nl_NL"`. Mollie defaults to the buyer's browser Accept-Language only if you don't pass anything; if you pass an unknown value (`"nl-NL"` with hyphen) it falls back to English.

### iDEAL test flow asks you to pick a status, not a bank

In test mode, Mollie skips the real bank handoff and shows a "Paid / Failed / Expired" picker so you can drive each terminal state. In live mode, you get the real iDEAL bank picker. Don't be surprised by the test-mode shape.
