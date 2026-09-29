import { useAuthState } from "@smog/auth/react";
import { createList, newLocalListId } from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { z } from "zod";
import {
  LISTS_MAX,
  type ListSummary,
  listDescriptionSchema,
  listNameSchema,
} from "../schema";
import { invalidState, selectLocalSummaries, toLocalSummary } from "./local";
import { forUser, LISTS_STALE_TIME, useListsRpc } from "./slice";

/** What `create` takes: the contract's rules, applied to guests too. */
const createInputSchema = z.object({
  description: listDescriptionSchema.optional(),
  name: listNameSchema,
});

export type CreateListInput = z.input<typeof createInputSchema>;

export type ListsStatus = "error" | "loading" | "ready";

export interface UseListsResult {
  /** Creates a list (on the device for guests) and returns its summary. */
  create: (input: CreateListInput) => Promise<ListSummary>;
  error: unknown;
  /** Most recently changed first. */
  lists: ListSummary[];
  status: ListsStatus;
}

export function queryStatus(query: {
  isError: boolean;
  isPending: boolean;
}): ListsStatus {
  if (query.isError) {
    return "error";
  }
  return query.isPending ? "loading" : "ready";
}

/**
 * The user's lists: the API when signed in, the device for guests (spec
 * §11). Screens use it the same way in both cases.
 */
export function useLists(): UseListsResult {
  const auth = useAuthState();
  const signedIn = auth.status === "signedIn";
  const rpc = useListsRpc();
  const queryClient = useQueryClient();
  const store = useLocalStoreInstance();
  const local = useLocalStore(selectLocalSummaries);

  const mine = rpc.mine.queryOptions({ staleTime: LISTS_STALE_TIME });
  const remote = useQuery({
    ...mine,
    enabled: signedIn,
    queryKey: forUser(mine.queryKey, auth.user?.id),
  });
  const remoteCreate = useMutation(
    rpc.create.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: rpc.key() }),
    })
  );
  const { mutateAsync } = remoteCreate;

  const create = useCallback(
    async (input: CreateListInput): Promise<ListSummary> => {
      if (signedIn) {
        return await mutateAsync(input);
      }
      const parsed = createInputSchema.parse(input);
      const id = newLocalListId();
      // The account's limit applies on the device too (the import keeps it).
      await store.update((data) => {
        if (data.lists.length >= LISTS_MAX) {
          throw invalidState(`At most ${LISTS_MAX} lists`);
        }
        return createList(
          parsed.name,
          parsed.description ?? undefined,
          id
        )(data);
      });
      const created = store.getSnapshot().lists.find((list) => list.id === id);
      if (!created) {
        throw new Error("[lists] Failed to create a local list");
      }
      return toLocalSummary(created);
    },
    [mutateAsync, signedIn, store]
  );

  if (auth.status === "loading") {
    return { create, error: null, lists: [], status: "loading" };
  }
  if (!signedIn) {
    return { create, error: null, lists: local, status: "ready" };
  }
  return {
    create,
    error: remote.error,
    lists: remote.data ?? [],
    status: queryStatus(remote),
  };
}
