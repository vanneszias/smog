# Mollie Components

## Table of contents

- What Components is (and what it isn't)
- SDK loading
- Profile ID
- Creating fields and mounting
- Styling — supported properties only
- Vertical alignment pitfall
- Placeholder support per field
- Validation events
- Tokenisation on submit
- Cardholder name

## What Components is (and what it isn't)

Mollie Components is a JS SDK that mounts **iframe-based** input fields (cardNumber, expiryDate, verificationCode, cardHolder) into your page. The fields render inside `iframe` elements served from `js.mollie.com`, so the card PAN/CVC never enters your DOM, bundle, or server. Submitting calls `mollie.createToken()`, which posts the inputs to Mollie and returns a single-use `cardToken` (`tok_…`) you forward to your backend.

It is **only for credit cards**. iDEAL, Bancontact, Klarna, PayPal, Apple Pay all use Mollie's hosted checkout flow — there is no inline equivalent. Don't try to build "Mollie Elements for iDEAL".

PCI consequence: with Components your business stays in PCI SAQ A (the lightest tier, 22-question self-attestation). The moment you `value=` a card number on an input you own, you fall into SAQ A-EP or higher.

## SDK loading

The SDK is a single `<script src="https://js.mollie.com/v1/mollie.js">` tag. In Next.js, load it via `<Script strategy="lazyOnload">` from a client component, and gate initialisation on the `onLoad` callback (or a `scriptLoaded` state):

```tsx
"use client"
import Script from "next/script"

const [ready, setReady] = useState(false)
const [mollie, setMollie] = useState<MollieInstance | null>(null)

useEffect(() => {
  if (ready && window.Mollie) {
    setMollie(window.Mollie(profileId, { locale, testmode: true }))
  }
}, [ready])

return (
  <>
    <Script src="https://js.mollie.com/v1/mollie.js" onLoad={() => setReady(true)} />
    {/* ... */}
  </>
)
```

Don't load the SDK in a server component — `window.Mollie` is browser-only. Don't bundle a `@mollie/components` npm package; Mollie's official path is the CDN script.

## Profile ID

Mollie Components needs your **profile ID** (`pfl_…`), exposed to the browser. This is *not* the API key — it's a public identifier that scopes the SDK to your account.

Pattern: `NEXT_PUBLIC_MOLLIE_PROFILE_ID=pfl_xxx` in `.env.local`. Find it at https://my.mollie.com → Developers → API keys (same screen as the API keys, but the profile ID line is separate).

**Note:** the same `pfl_` identifier is the field Mollie's Payments API rejects when sent server-side with a regular API key. The profile ID belongs in the SDK init on the browser, never in the `POST /v2/payments` body.

## Creating fields and mounting

```tsx
const mountRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (!mollie || !mountRef.current) return
  const component = mollie.createComponent("cardNumber", {
    styles: { /* see below */ },
  })
  component.mount(mountRef.current)
  return () => {
    component.unmount()
  }
}, [mollie])

return <div ref={mountRef} />
```

The mount target should be an empty `<div>` that Mollie owns. Don't add children — Mollie injects the iframe directly.

Components ship for: `cardHolder`, `cardNumber`, `expiryDate`, `verificationCode`. Mount each separately into its own div.

## Styling — supported properties only

Mollie's `styles` API forwards a *subset* of CSS into the iframe stylesheet. Officially supported (per docs):

- `backgroundColor`, `boxShadow`, `color`, `direction`, `opacity`
- `font`, `fontFamily`, `fontSize`, `fontSmoothing`, `fontStyle`, `fontVariant`, `fontWeight`
- `letterSpacing`, `lineHeight`
- `padding` (and per-side `paddingTop`/`paddingRight`/`paddingBottom`/`paddingLeft`)
- `textAlign`, `textDecoration`, `textShadow`, `textTransform`
- `::placeholder` pseudo-selector with the same set

Unsupported: `border`, `borderRadius`, `width`, `height`, `box-sizing`, `display`, `align-items`, `vertical-align`, `transform`, anything layout-affecting.

```ts
const styles = {
  base: {
    color: "rgb(0 0 0)",
    fontSize: "16px",
    fontFamily: getComputedStyle(document.documentElement)
      .getPropertyValue("--font-sans").trim(),
    fontWeight: "400",
    lineHeight: "16px",
    paddingTop: "14px",
    paddingBottom: "14px",
    paddingLeft: "0",
    paddingRight: "0",
    "::placeholder": { color: "rgb(0 0 0 / 0.45)" },
  },
  valid: { color: "rgb(0 0 0)" },
  invalid: { color: "rgb(0 0 0)" },
}
```

**Don't use the `padding` shorthand.** Mollie's iframe bridge parses it inconsistently — the horizontal value often doesn't apply. Use per-side keys (`paddingTop`, `paddingLeft`, etc.) and you'll get reliable results.

**Source the font from a CSS variable on the parent.** `getComputedStyle(document.documentElement).getPropertyValue("--font-sans")` resolves the same token the rest of your app uses, so the Components text matches the surrounding form without duplicating the font-family string.

## Vertical alignment pitfall

Mollie's `<input>` inside the iframe is its natural ~22px tall, top-anchored. If you put it inside a row taller than that, the text floats at the top and looks broken — and you cannot fix it with CSS from the parent because the iframe is sandboxed.

The fix lives **inside Mollie's `styles`**, not outside:

- `paddingTop` + `paddingBottom` push the line content within the input. For a 48px row target, `paddingTop: "14px"` + `paddingBottom: "14px"` around a 16px glyph yields a ~44px input that centres in the row.
- `lineHeight: "16px"` (matching the glyph height) keeps the line box tight so the padding does the centring, not a stretchy line box.
- The wrapper around the mount div should be `flex h-12 items-center` so the iframe lands at the row's vertical centre. Don't force iframe height via `[&_iframe]:h-full!` — it stretches the iframe but not the input inside, making the empty space worse.

## Placeholder support per field

Only `cardHolder` honours the `placeholder` option:

```ts
mollie.createComponent("cardHolder", { placeholder: "Naam kaarthouder" }) // works
mollie.createComponent("cardNumber", { placeholder: "1234..." })          // IGNORED
mollie.createComponent("verificationCode", { placeholder: "CVC" })        // IGNORED
mollie.createComponent("expiryDate")                                       // has built-in "MM / JJ" (localised)
```

For `cardNumber` and `verificationCode`, use a sibling `<span>` with `pointer-events-none` positioned over the mount div, gated on `!dirty`. Position both via `flex items-center` on a shared wrapper so the overlay text and the iframe text share the same vertical centre. Horizontal padding goes on the wrapper (Tailwind `px-3`), not in Mollie's styles — keeps the alignment between overlay and iframe content predictable.

## Validation events

Each Component fires a `change` event with `{ touched, dirty, valid, error }`:

```ts
component.addEventListener("change", (event) => {
  // event.touched : focused at least once
  // event.dirty   : has typed input
  // event.valid   : passes Mollie's format check
  // event.error   : string message in current locale, or undefined
})
```

**Gate error display on `dirty && error`, never `touched`.** A buyer who focuses and blurs an empty field gets `touched: true` with an "empty field" error — surfacing it makes the form look broken before they've interacted. The submit button stays disabled until every field is `valid`, so empty fields can't slip past silently.

Also listen to `focus` and `blur` if you need to drive your own visual state (highlighted borders, label motion). The events have no payload.

## Tokenisation on submit

```ts
const result = await mollie.createToken()
if (result.error) {
  // result.error.message — localised string
  return
}
const cardToken = result.token  // "tok_..."
// Forward to backend, which calls payments.create({ cardToken, ... })
```

The token is **single-use** and expires after a short window (~15 minutes). Don't store it server-side; consume it immediately in your `payments.create` call.

## Cardholder name

Skipping the `cardHolder` field is normal — Stripe's default Card Element doesn't have one either, and Mollie uses the cart's billing address name as the implicit cardholder. Only mount `cardHolder` if your design explicitly wants a separate field for it.
