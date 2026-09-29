# @smog/rpc

The oRPC base (spec §7): the per-request context, procedure builders,
middleware, the shared error map and the React provider.

| Subpath | Contents | Runs on |
|---|---|---|
| `@smog/rpc` | `RpcContext`, `implementRpc`, `requireUser`, `requireAdmin`, `rateLimit`, `requireTurnstile`, `logErrors`, `rpcHandlerOptions` (`limitRequests`, `loadSession`, `mapValidationErrors`), `base` / `publicProcedure` / `userProcedure` / `adminProcedure` | Worker |
| `@smog/rpc/contract` | `baseContract` (`oc` with `ERRORS`), `ERRORS`, `roleSchema`, `RpcClientContext`, `TURNSTILE_HEADER` | everywhere |
| `@smog/rpc/react` | `RpcProvider`, `useRpcClient`, `useRpcQuery` | site + mobile |
| `@smog/rpc/testing` | `makeRpcContext`, `makeSession` | tests |

## A feature, end to end

Features are contract-first (spec §7): a `./contract`, and a router from
`implementRpc(contract)`. The router-first builders (`base`,
`publicProcedure`, `userProcedure`, `adminProcedure`) exist for tests and
tooling only; a feature procedure built with them would bypass its
contract, so features do not use them.

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
  `<ip>:<procedure path>`, `RATE_LIMITED` when over. Both site transports
  use `rpcHandlerOptions`: `limitRequests("RL_API", "api")` per IP first,
  then `loadSession` (the session is read only after the limit passed),
  so the handler's `RATE_LIMITED` is `defined: true` too. The site also
  applies `RL_AUTH` to `POST /api/auth/*` (sign-out and get-session exempt).
- `requireTurnstile`: the `x-turnstile-token` header, checked with
  siteverify (a network error counts as invalid); skipped when
  `TURNSTILE_SECRET_KEY` is unset, which only `dev` allows. Headers per
  surface: rpc procedures read `x-turnstile-token` (`TURNSTILE_HEADER`);
  Better Auth's captcha plugin on `/api/auth/*` reads `x-captcha-response`
  (the auth client sends it). The token goes with one call through the
  client context (below).
- `logErrors`: logs unexpected errors as `[rpc:<path>]` and returns a bare
  `INTERNAL_SERVER_ERROR`.
- `mapValidationErrors` (handler `clientInterceptors`): input validation
  failures become `VALIDATION` with Zod's flattened field errors.

## Turnstile per call

`RpcClientContext` (`{ turnstileToken? }`) is the client context of every app
client (`ApiClient`, `useRpcClient<Slice>()`, `useRpcQuery<Slice>()`); the
link sends the token as `x-turnstile-token` for that call only:

```tsx
const rpc = useRpcQuery<{ sponsorships: SponsorshipsContract }>();
const checkout = useMutation(
  rpc.sponsorships.checkout.mutationOptions({ context: { turnstileToken } })
);
// or: client.sponsorships.checkout(input, { context: { turnstileToken } })
```

`createApiClient({ baseUrl })` takes an origin; any path in it is ignored
(the client always calls `<origin>/api/rpc`).
