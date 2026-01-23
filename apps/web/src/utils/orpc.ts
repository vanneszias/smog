import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@smog/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type AccessTokenProvider = () => Promise<string | null> | string | null;

let accessTokenProvider: AccessTokenProvider | null = null;

export function setORPCAccessTokenProvider(
  provider: AccessTokenProvider | null
) {
  accessTokenProvider = provider;
}

async function getAccessTokenFromProvider(): Promise<string | null> {
  try {
    const provider = accessTokenProvider;
    if (!provider) {
      return null;
    }
    return await provider();
  } catch {
    return null;
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - how long before refetch in background
      gcTime: 24 * 60 * 60 * 1000, // 24 hours - match localStorage persist duration
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      toast.error(`Error: ${error.message}`, {
        action: {
          label: "retry",
          onClick: () => {
            queryClient.invalidateQueries();
          },
        },
      });
    },
  }),
});

export const link = new RPCLink({
  url: `${import.meta.env.VITE_SERVER_URL}/rpc`,
  async fetch(_url, options) {
    const token = await getAccessTokenFromProvider();
    const headers = new Headers(
      (options as RequestInit | undefined)?.headers || {}
    );

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return fetch(_url, {
      ...(options as RequestInit),
      credentials: "include",
      headers,
    });
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
