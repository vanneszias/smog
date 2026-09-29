import { LIST_DESCRIPTION_MAX, LIST_NAME_MAX } from "@smog/lists/schema";
import type { GuestData, LocalStore, Mutator } from "@smog/local-store";
import type { RpcClient } from "@smog/rpc/react";
import type { AccountContract } from "../contract";
import {
  EMPTY_IMPORT_RESULT,
  IMPORT_FAVORITES_MAX,
  IMPORT_LIST_ITEMS_MAX,
  IMPORT_LISTS_MAX,
  type ImportGuestDataInput,
  type ImportResult,
} from "../schema";

/** The contract slice the import knows, keyed as `appContract` mounts it. */
export interface AccountSlice {
  account: AccountContract;
}

export interface ImportGuestDataOptions {
  /** The app's API client (`@smog/api/client`), or any client with `account`. */
  client: RpcClient<AccountSlice>;
  store: LocalStore;
}

/** What one import call sends, and which device entries it covers. */
interface Payload {
  /** The consent choice sent (`decidedAt`), if any. */
  consentDecidedAt: number | undefined;
  favorites: ReadonlySet<string>;
  input: ImportGuestDataInput;
  listIds: ReadonlySet<string>;
}

/** Favorites and lists on the device, as the import prompt counts them. */
export function countGuestData(data: GuestData): {
  favorites: number;
  lists: number;
} {
  return {
    favorites: new Set(data.favorites).size,
    lists: data.lists.length,
  };
}

/**
 * The import payload within the contract's limits: unique favorites (the
 * oldest `IMPORT_FAVORITES_MAX`; the rest stays for the next import),
 * lists with names and descriptions trimmed and cut to the list limits,
 * and the consent choice once the guest decided.
 */
function toPayload(data: GuestData): Payload {
  const favorites = [...new Set(data.favorites)].slice(0, IMPORT_FAVORITES_MAX);
  const lists = data.lists.slice(0, IMPORT_LISTS_MAX);
  const { analytics, decidedAt } = data.consent;
  const consent =
    analytics === null || decidedAt === undefined
      ? undefined
      : { analytics, decidedAt };
  return {
    consentDecidedAt: consent?.decidedAt,
    favorites: new Set(favorites),
    input: {
      ...(consent ? { consent } : {}),
      favorites,
      lists: lists.map((local) => {
        const description = local.description
          ?.trim()
          .slice(0, LIST_DESCRIPTION_MAX);
        return {
          ...(description ? { description } : {}),
          gestureIds: [...new Set(local.gestureIds)].slice(
            0,
            IMPORT_LIST_ITEMS_MAX
          ),
          name: local.name.trim().slice(0, LIST_NAME_MAX),
        };
      }),
    },
    listIds: new Set(lists.map((local) => local.id)),
  };
}

/**
 * Removes what the import covered and keeps the rest: anything added on
 * the device while the call ran, recent searches and preferences.
 */
function clearImported(payload: Payload): Mutator {
  return (data) => ({
    ...data,
    consent:
      payload.consentDecidedAt !== undefined &&
      data.consent.decidedAt === payload.consentDecidedAt
        ? { analytics: null }
        : data.consent,
    favorites: data.favorites.filter((id) => !payload.favorites.has(id)),
    lists: data.lists.filter((local) => !payload.listIds.has(local.id)),
  });
}

/**
 * Imports the guest's device data into the signed-in account
 * (`account.importGuestData`, spec §11), then clears the imported
 * favorites, lists and consent choice from the device; recent searches
 * and preferences stay. On failure nothing is cleared and the error is
 * rethrown. With nothing to import it makes no call.
 */
export async function importGuestData({
  client,
  store,
}: ImportGuestDataOptions): Promise<ImportResult> {
  await store.ready;
  const payload = toPayload(store.getSnapshot());
  const { input } = payload;
  if (
    input.favorites.length === 0 &&
    input.lists.length === 0 &&
    input.consent === undefined
  ) {
    return EMPTY_IMPORT_RESULT;
  }
  try {
    const result = await client.account.importGuestData(input);
    await store.update(clearImported(payload));
    return result;
  } catch (error) {
    console.error("[account] Failed to import guest data:", error);
    throw error;
  }
}
