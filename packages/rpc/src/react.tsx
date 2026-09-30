import type { NestedClient } from "@orpc/client";
import type { AnyContractRouter, ContractRouterClient } from "@orpc/contract";
import type { RouterUtils } from "@orpc/tanstack-query";
import { useAuthState } from "@smog/auth/react";
import {
  type QueryClient,
  type QueryKey,
  useQueryClient,
} from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import type { RpcClientContext } from "./contract";

/**
 * A contract slice: named contract routers, e.g.
 * `{ gestures: GesturesContract }`. A mapped constraint, so an `interface`
 * (no index signature) works as well as a `type`.
 */
export type ContractSlice<T> = Record<keyof T, AnyContractRouter>;

/**
 * The typed oRPC client for a contract slice, with the per-call
 * `RpcClientContext` (`{ context: { turnstileToken } }`).
 */
export type RpcClient<TSlice extends ContractSlice<TSlice>> = {
  [K in keyof TSlice]: ContractRouterClient<TSlice[K], RpcClientContext>;
};

/** The TanStack Query utils (`queryOptions`, `mutationOptions`, keys). */
export type RpcQueryUtils<TSlice extends ContractSlice<TSlice>> = RouterUtils<
  RpcClient<TSlice>
>;

interface RpcValue {
  client: unknown;
  queryUtils: unknown;
}

const RpcReactContext = createContext<RpcValue | null>(null);

// biome-ignore lint/suspicious/noExplicitAny: oRPC's own bound for "a client with any client context".
type AnyClient = NestedClient<any>;

export interface RpcProviderProps<TClient extends AnyClient> {
  children?: ReactNode;
  client: TClient;
  queryUtils: RouterUtils<TClient>;
}

/**
 * Holds the app's one client and its query utils (created once by the app
 * from `@smog/api/client`). Feature hooks read them with `useRpcClient` /
 * `useRpcQuery`, typed by their own contract slice.
 */
export function RpcProvider<TClient extends AnyClient>({
  children,
  client,
  queryUtils,
}: RpcProviderProps<TClient>): ReactNode {
  return (
    <RpcReactContext.Provider value={{ client, queryUtils }}>
      {children}
    </RpcReactContext.Provider>
  );
}

function useRpcValue(hook: string): RpcValue {
  const value = useContext(RpcReactContext);
  if (!value) {
    throw new Error(`[rpc] ${hook} must be used inside <RpcProvider>`);
  }
  return value;
}

/**
 * The client, typed for the contract slice a feature knows, e.g.
 * `useRpcClient<{ gestures: GesturesContract }>()`. The provider holds the
 * whole app client, which has every slice, so the narrowing is safe as long
 * as the slice is mounted under the same key in `appContract`.
 */
export function useRpcClient<
  TSlice extends ContractSlice<TSlice>,
>(): RpcClient<TSlice> {
  return useRpcValue("useRpcClient").client as RpcClient<TSlice>;
}

/** The TanStack Query utils, typed for a contract slice (see `useRpcClient`). */
export function useRpcQuery<
  TSlice extends ContractSlice<TSlice>,
>(): RpcQueryUtils<TSlice> {
  return useRpcValue("useRpcQuery").queryUtils as RpcQueryUtils<TSlice>;
}

/** The last element of a user-scoped query key (`null`: no user). */
export interface UserScope {
  user: string | null;
}

/**
 * A query key scoped to the signed-in user, so another account signing in
 * on the same device never sees this one's cache (and `purgeOtherUsers`
 * can drop it). It extends the oRPC key, so `rpc.key()` still matches it.
 */
export function userScopedKey<TKey extends readonly unknown[]>(
  key: TKey,
  userId: string | undefined
): readonly [...TKey, UserScope] {
  return [...key, { user: userId ?? null }];
}

/**
 * Whether `queryKey` is `userScopedKey`-scoped to someone other than
 * `userId`: another user, or the guest (`null`) once a user is signed in,
 * so a guest's cache (their favorites' catalogue pages) never outlives the
 * sign-in.
 */
export function isOtherUsersKey(
  queryKey: QueryKey,
  userId: string | undefined
): boolean {
  const scope = queryKey.at(-1);
  if (typeof scope !== "object" || scope === null || !("user" in scope)) {
    return false;
  }
  const { user } = scope as UserScope;
  if (user === null) {
    return userId !== undefined;
  }
  return typeof user === "string" && user !== userId;
}

/** Removes every query scoped to someone other than `userId` (all features). */
export function purgeOtherUsers(
  queryClient: QueryClient,
  userId: string | undefined
): void {
  queryClient.removeQueries({
    predicate: (query) => isOtherUsersKey(query.queryKey, userId),
  });
}

/**
 * After a sign-out or an account switch, drops the previous user's cached
 * queries (every `userScopedKey`), before a persisted cache could keep
 * them. Mounted once per app (`<PurgeOtherUsers />`); feature hooks that
 * read user data call it too, so they are correct on their own.
 */
export function usePurgeOtherUsers(): void {
  const { status, user } = useAuthState();
  const queryClient = useQueryClient();
  const userId = user?.id;
  useEffect(() => {
    if (status !== "loading") {
      purgeOtherUsers(queryClient, userId);
    }
  }, [queryClient, status, userId]);
}

/** `usePurgeOtherUsers` as a component, for the app's provider tree. */
export function PurgeOtherUsers(): null {
  usePurgeOtherUsers();
  return null;
}
