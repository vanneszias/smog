# @smog/rpc

The oRPC base (spec §7): the per-request context, procedure builders,
middleware, the shared error map and the React provider.

| Subpath | Contents | Runs on |
|---|---|---|
| `@smog/rpc` | `RpcContext`, `base`, `publicProcedure` / `userProcedure` / `adminProcedure`, `implementRpc`, `requireUser`, `requireAdmin`, `rateLimit`, `limitRequests`, `requireTurnstile`, `logErrors`, `mapValidationErrors` | Worker |
| `@smog/rpc/contract` | `baseContract` (`oc` with `ERRORS`), `ERRORS`, `roleSchema` | everywhere |
| `@smog/rpc/react` | `RpcProvider`, `useRpcClient`, `useRpcQuery` | site + mobile |
| `@smog/rpc/testing` | `makeRpcContext`, `makeSession` | tests |

## A feature, end to end

The contract starts from `baseContract`, so every procedure declares the
shared error map and clients get the codes typed:

```ts
// packages/features/gestures/src/contract.ts
import { baseContract } from "@smog/rpc/contract";
import { z } from "zod";
import { gestureSchema } from "./schema";

export const gesturesContract = {
  bySlug: baseContract
    .input(z.object({ slug: z.string() }))
    .output(gestureSchema),
};
export type GesturesContract = typeof gesturesContract;
```

The server implements its slice with `implementRpc` (rpc context and
`logErrors` on every procedure); guards and limits go per procedure:

```ts
// packages/features/gestures/src/server/router.ts
import { implementRpc, rateLimit, requireUser } from "@smog/rpc";
import { gesturesContract } from "../contract";

const os = implementRpc(gesturesContract);

export const gesturesRouter = os.router({
  bySlug: os.bySlug.handler(async ({ context, input, errors }) => {
    const gesture = await findBySlug(context.db, input.slug);
    if (!gesture) throw errors.NOT_FOUND();
    return gesture;
  }),
});
```

`@smog/api` mounts it under the same key in `appContract` / `appRouter`
(`{ gestures: gesturesContract }`).

## Hooks: typed by the feature's own slice

A feature's `./client` must not import `@smog/api` (that is the package that
imports the features; `bun run boundaries` rejects it). The app creates the
one client with `@smog/api/client` and puts it in `RpcProvider`; a feature
hook asks for the client or the TanStack Query utils **typed by its own
slice**, keyed exactly as `appContract` mounts it:

```tsx
// packages/features/gestures/src/client/use-gesture.ts
import { useRpcQuery } from "@smog/rpc/react";
import { useQuery } from "@tanstack/react-query";
import type { GesturesContract } from "../contract";

interface Slice {
  gestures: GesturesContract;
}

export function useGesture(slug: string) {
  const rpc = useRpcQuery<Slice>();
  return useQuery(rpc.gestures.bySlug.queryOptions({ input: { slug } }));
}
```

```tsx
// App root (site or mobile)
import { createApiClient, createApiQueryUtils } from "@smog/api/client";
import { RpcProvider } from "@smog/rpc/react";

const client = createApiClient({ baseUrl: window.location.origin });
const queryUtils = createApiQueryUtils(client);

<RpcProvider client={client} queryUtils={queryUtils}>{children}</RpcProvider>;
```

The provider holds the whole app client, which has every slice, so
`useRpcClient<Slice>()` / `useRpcQuery<Slice>()` only narrow the type. The
narrowing is correct as long as the slice key (`gestures`) matches the key in
`appContract`; `@smog/api`'s type-check fails if a feature router does not
implement its contract under that key.

## Middleware and limits

- `userProcedure` / `requireUser`: `UNAUTHORIZED` without a session, and
  `context.user` is the signed-in user. `adminProcedure` / `requireAdmin`:
  `FORBIDDEN` unless `role === "admin"`.
- `rateLimit("RL_SPONSOR")`: a Workers Rate Limiting binding keyed by
  `<ip>:<procedure path>`, `RATE_LIMITED` when over. The site applies
  `RL_API` per IP to every request of both transports (`limitRequests`) and
  `RL_AUTH` to `POST /api/auth/*`.
- `requireTurnstile`: the `x-turnstile-token` header, checked with
  siteverify; skipped when `TURNSTILE_SECRET_KEY` is unset (dev).
- `logErrors`: logs unexpected errors as `[rpc:<path>]` and returns a bare
  `INTERNAL_SERVER_ERROR`.
- `mapValidationErrors` (handler `clientInterceptors`): input validation
  failures become `VALIDATION` with Zod's flattened field errors.
