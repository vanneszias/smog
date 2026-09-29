/**
 * Guest lists (spec §11): the `@smog/local-store` lists shaped like the
 * API's, so a screen renders both the same way.
 */
import { ORPCError } from "@orpc/client";
import type { GestureSummary } from "@smog/gestures/schema";
import type { GuestData, LocalList, Mutator } from "@smog/local-store";
import type { RpcClient } from "@smog/rpc/react";
import type { ListItem, ListSummary } from "../schema";
import { BY_IDS_CHUNK, type ListsSlice } from "./slice";

/**
 * The server's `INVALID_STATE`, for the same rule broken on a guest list,
 * so a screen handles both the same way (`isDefinedError`).
 */
export function invalidState(
  message: string
): ORPCError<"INVALID_STATE", undefined> {
  return new ORPCError("INVALID_STATE", {
    defined: true,
    message: `[lists] ${message}`,
    status: 409,
  });
}

export function toLocalSummary(list: LocalList): ListSummary {
  return {
    description: list.description ?? null,
    id: list.id,
    itemCount: list.gestureIds.length,
    name: list.name,
    shares: { edit: false, view: false },
    updatedAt: list.updatedAt,
  };
}

/** The guest's lists, most recently changed first (the API's order). */
export function selectLocalSummaries(data: GuestData): ListSummary[] {
  return data.lists
    .map(toLocalSummary)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

/** Sets the name and/or the description (`null` clears it). */
export function editLocalList(
  listId: string,
  changes: { description?: string | null; name?: string },
  now: number = Date.now()
): Mutator {
  return (data) => ({
    ...data,
    lists: data.lists.map((list) => {
      if (list.id !== listId) {
        return list;
      }
      const { description: _previous, ...rest } = list;
      const description =
        changes.description === undefined
          ? list.description
          : (changes.description ?? undefined);
      return {
        ...rest,
        ...(description === undefined ? {} : { description }),
        name: changes.name ?? list.name,
        updatedAt: now,
      };
    }),
  });
}

/** Summaries for ids, `BY_IDS_CHUNK` per call, in the order asked. */
export async function fetchSummaries(
  client: RpcClient<ListsSlice>,
  ids: readonly string[]
): Promise<GestureSummary[]> {
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += BY_IDS_CHUNK) {
    chunks.push(ids.slice(start, start + BY_IDS_CHUNK));
  }
  const pages = await Promise.all(
    chunks.map((chunk) => client.gestures.byIds({ ids: chunk }))
  );
  return pages.flat();
}

/**
 * The guest list's gestures in its order, positions `0..n-1` over the ones
 * still published (unknown ids are left out).
 */
export function toLocalItems(
  gestureIds: readonly string[],
  summaries: readonly GestureSummary[]
): ListItem[] {
  const byId = new Map(summaries.map((summary) => [summary.id, summary]));
  return gestureIds
    .flatMap((id) => {
      const summary = byId.get(id);
      return summary ? [summary] : [];
    })
    .map((summary, position) => ({ ...summary, position }));
}
