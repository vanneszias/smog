import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { type RpcClientContext, TURNSTILE_HEADER } from "@smog/rpc/contract";
import type { AppContract } from "./contract";

export type { RpcClientContext } from "@smog/rpc/contract";
export type { AppContract } from "./contract";

/**
 * The typed client for the whole app contract. Each call takes the
 * `RpcClientContext`: `client.x.y(input, { context: { turnstileToken } })`.
 */
export type ApiClient = ContractRouterClient<AppContract, RpcClientContext>;

type HeaderRecord = Record<string, string>;

export interface CreateApiClientOptions {
  /**
   * The site origin (scheme + host + port); any path is ignored and the
   * client calls `<origin>/api/rpc`.
   */
  baseUrl: string;
  /** Replaces the global `fetch` (tests, or `credentials: "omit"` on mobile). */
  fetch?: (request: Request, init: RequestInit) => Promise<Response>;
  /** Extra headers per request, e.g. the Better Auth Expo `cookie`. */
  headers?: HeaderRecord | (() => HeaderRecord | Promise<HeaderRecord>);
}

/**
 * An oRPC client over `RPCLink` for `/api/rpc`. The site uses its own
 * origin (the session cookie goes along); mobile passes
 * `EXPO_PUBLIC_API_URL` and the cookie header from the auth client. A
 * `turnstileToken` in the call context becomes the `x-turnstile-token`
 * header of that call only.
 */
export function createApiClient({
  baseUrl,
  fetch: customFetch,
  headers,
}: CreateApiClientOptions): ApiClient {
  const link = new RPCLink<RpcClientContext>({
    headers: async ({ context }) => {
      const base = typeof headers === "function" ? await headers() : headers;
      return {
        ...base,
        ...(context.turnstileToken
          ? { [TURNSTILE_HEADER]: context.turnstileToken }
          : {}),
      };
    },
    url: new URL("/api/rpc", baseUrl).toString(),
    ...(customFetch
      ? {
          fetch: (request: Request, init: RequestInit) =>
            customFetch(request, init),
        }
      : {}),
  });
  return createORPCClient(link);
}

/** TanStack Query utils (`queryOptions`, `mutationOptions`, keys). */
export function createApiQueryUtils(client: ApiClient) {
  return createTanstackQueryUtils(client);
}

export type ApiQueryUtils = ReturnType<typeof createApiQueryUtils>;
