# Medusa v2 integration

Mollie has no official `@medusajs/payment-mollie` package — you ship a custom payment provider module. This reference documents the canonical Medusa v2 implementation.

## Table of contents

- Module layout
- Provider ID format
- AbstractPaymentProvider interface
- Status mapping
- session_id flow (matching Mollie payments back to Medusa sessions)
- One module class, multiple methods
- Region wiring
- Webhook route

## Module layout

```
apps/backend/src/modules/payment-mollie/
├── index.ts      # ModuleProvider export
└── service.ts    # AbstractPaymentProvider implementation
```

`index.ts`:

```ts
import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import MolliePaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [MolliePaymentProviderService],
})
```

## Provider ID format

When the Payment Module registers your provider, Medusa composes its container key as `pp_<service.identifier>_<config.id>` (see `@medusajs/payment/dist/loaders/providers.js`):

| `static identifier` | Config `id`   | Container key (= `provider_id` in API) |
| ------------------- | ------------- | -------------------------------------- |
| `"mollie"`          | `"ideal"`     | `pp_mollie_ideal`                      |
| `"mollie"`          | `"creditcard"`| `pp_mollie_creditcard`                 |

**Use the same service class for every method.** Register multiple instances with different `id` + `options.method` in `medusa-config.ts` — the service reads `this.config.method` to know what to send Mollie. This keeps method-specific logic in one place.

```ts
// medusa-config.ts
{
  resolve: "@medusajs/medusa/payment",
  options: {
    providers: [
      {
        resolve: "./src/modules/payment-mollie",
        id: "ideal",
        options: { apiKey: process.env.MOLLIE_API_KEY, method: "ideal" },
      },
      {
        resolve: "./src/modules/payment-mollie",
        id: "creditcard",
        options: { apiKey: process.env.MOLLIE_API_KEY, method: "creditcard" },
      },
    ],
  },
}
```

## AbstractPaymentProvider interface

```ts
import {
  AbstractPaymentProvider,
  BigNumber,
  MedusaError,
} from "@medusajs/framework/utils"
import createMollieClient, {
  MollieClient,
  PaymentMethod,
  PaymentStatus,
} from "@mollie/api-client"

type MollieOptions = {
  apiKey: string
  webhookUrl?: string  // optional — leave blank locally for polling-only
  method?: PaymentMethod
}

class MolliePaymentProviderService extends AbstractPaymentProvider<MollieOptions> {
  static identifier = "mollie"

  static validateOptions(options: Record<string, unknown>) {
    if (!options.apiKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Mollie payment provider requires `apiKey`"
      )
    }
  }

  protected client_: MollieClient
  protected logger_: Logger

  constructor(container: InjectedDependencies, options: MollieOptions) {
    super(container, options)
    this.logger_ = container.logger
    this.client_ = createMollieClient({ apiKey: options.apiKey })
  }

  // initiatePayment, authorizePayment, capturePayment, cancelPayment,
  // deletePayment, refundPayment, retrievePayment, updatePayment,
  // getPaymentStatus, getWebhookActionAndData — see method notes below.
}

export default MolliePaymentProviderService
```

Method-by-method notes:

- **`initiatePayment`** — create the Mollie payment. Pull `redirectUrl` from `input.data` (the storefront passes it). **Do not send `profileId`** with API-key auth (see SKILL.md critical rules). Return `{ id: payment.id, status, data: { mollie_id, checkout_url, status, method, session_id } }`. The `data` is stored on the payment session and exposed to the storefront — that's how the redirect URL gets to the buyer.
- **`authorizePayment`** — re-fetch the payment from Mollie, return mapped status. This is called by `cart.complete()` from the storefront's place-order flow. If status is `pending`, the order isn't created and the storefront retries.
- **`capturePayment`** — Mollie auto-captures most methods (iDEAL, card immediate, Bancontact). Pay-later methods (Klarna) require `client.paymentCaptures.create()`. For the common case, return `{ data: input.data ?? {} }` (no-op).
- **`cancelPayment`** / **`deletePayment`** — `client.payments.cancel(id)` if status is still `open`/`pending`. Silently ignore errors (already-settled payments throw).
- **`refundPayment`** — `client.paymentRefunds.create({ paymentId, amount })`. Amount in Mollie format (string with 2 decimals, uppercase currency).
- **`retrievePayment`** / **`getPaymentStatus`** — `client.payments.get(id)`, return mapped status.
- **`updatePayment`** — Mollie payments are immutable. If the cart amount changes (e.g., shipping recalculation), cancel the old payment and create a new one. Don't try to mutate in place.
- **`getWebhookActionAndData`** — re-fetch payment from Mollie, read `metadata.session_id`, map status to `PaymentActions`. Return `{ action: "captured" | "authorized" | "canceled" | "failed" | "pending" | "not_supported", data: { session_id, amount } }`.

## Status mapping

Mollie `PaymentStatus` → Medusa `PaymentSessionStatus`:

```ts
private mapStatus(status: PaymentStatus): PaymentSessionStatus {
  switch (status) {
    case PaymentStatus.paid:        return "captured"
    case PaymentStatus.authorized:  return "authorized"
    case PaymentStatus.canceled:
    case PaymentStatus.expired:     return "canceled"
    case PaymentStatus.failed:      return "error"
    case PaymentStatus.pending:
    case PaymentStatus.open:
    default:                        return "pending"
  }
}
```

## session_id flow (matching Mollie payments back to Medusa sessions)

The Payment Module **automatically injects the Medusa session id** into `input.data.session_id` when it calls your `initiatePayment`. Capture it and stash on Mollie's `metadata`:

```ts
const payment = await this.client_.payments.create({
  amount: this.formatAmount(amount, currency_code),
  description: `Order session ${sessionId}`,
  redirectUrl,
  metadata: { session_id: sessionId, customer_id: context?.customer?.id },
})
```

Then in `getWebhookActionAndData`, you read it back:

```ts
const payment = await this.client_.payments.get(mollieId)
const sessionId = (payment.metadata as Record<string, unknown>)?.session_id as string
return { action: "captured", data: { session_id: sessionId, amount: new BigNumber(...) } }
```

This is the bridge between Mollie's ID space (`tr_…`) and Medusa's (`payses_…`). Without it, webhook handlers can't find the right local session.

## Region wiring

Payment providers must be allowlisted on the region. In the initial seed:

```ts
await createRegionsWorkflow(container).run({
  input: {
    regions: [{
      name: "Europe",
      currency_code: "eur",
      countries: ["nl"],
      payment_providers: ["pp_mollie_ideal", "pp_mollie_creditcard", "pp_system_default"],
    }],
  },
})
```

For **existing regions** (already created by an earlier seed without the providers), run an upgrade step in `seed-bootstrap.ts`:

```ts
const { data: regions } = await query.graph({
  entity: "region",
  fields: ["id", "payment_providers.id"],
})
const stale = regions.filter((region) => {
  const ids = (region.payment_providers ?? [])
    .map((p) => p?.id)
    .filter((id): id is string => typeof id === "string")
  return REQUIRED_PAYMENT_PROVIDERS.some((needed) => !ids.includes(needed))
})
if (stale.length) {
  await updateRegionsWorkflow(container).run({
    input: {
      selector: { id: stale.map((r) => r.id) },
      update: { payment_providers: REQUIRED_PAYMENT_PROVIDERS },
    },
  })
}
```

The storefront's `/store/payment-providers?region_id=…` endpoint reads from this allowlist. If a region has no providers attached, the picker is empty.

## Webhook route

Single route handles all Mollie methods:

```ts
// apps/backend/src/api/mollie/webhook/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { IPaymentModuleService } from "@medusajs/framework/types"
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const mollieId = typeof body.id === "string" ? body.id : undefined
  if (!mollieId) {
    res.status(400).json({ error: "Missing Mollie payment id" })
    return
  }

  const paymentModule = req.scope.resolve<IPaymentModuleService>(Modules.PAYMENT)
  try {
    const result = await paymentModule.getWebhookActionAndData({
      provider: "mollie_ideal", // any of our Mollie provider ids; getWebhookActionAndData is method-agnostic
      payload: { data: body, rawData: req.rawBody as Buffer, headers: req.headers },
    })
    if (result.action !== "not_supported") {
      await processPaymentWorkflow(req.scope).run({ input: result })
    }
    res.sendStatus(200)
  } catch (err) {
    // Return 200 anyway — Mollie retries on non-2xx, and we don't want transient
    // processing failures to spam retries. The next status fetch reconciles.
    res.sendStatus(200)
  }
}
```

The `provider` value can be either Mollie provider ID — both share the same service class, so `getWebhookActionAndData` returns identical output. Medusa's `processPaymentWorkflow` looks up the local session by `session_id` (which we stored on Mollie's metadata) and applies the action.
