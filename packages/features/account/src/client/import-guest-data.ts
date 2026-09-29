import {
  gestureIdSchema,
  LIST_DESCRIPTION_MAX,
  LIST_NAME_MAX,
} from "@smog/lists/schema";
import type {
  GuestData,
  LocalList,
  LocalStore,
  Mutator,
} from "@smog/local-store";
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

/** The account contract, keyed as `appContract` mounts it (the hooks' slice). */
export interface AccountSlice {
  account: AccountContract;
}

/** The one procedure the import calls. */
interface ImportSlice {
  account: Pick<AccountContract, "importGuestData">;
}

export interface ImportGuestDataOptions {
  /** The app's API client (`@smog/api/client`), or any client with `account`. */
  client: RpcClient<ImportSlice>;
  store: LocalStore;
  /**
   * The name a list gets when its device name is empty (localised by the
   * caller, e.g. `auth.import.untitledList`). Default `"—"`.
   */
  untitledListName?: string;
}

/** What one import call sends, and which device entries it covers. */
interface Payload {
  /** The consent choice sent (`decidedAt`), if any. */
  consentDecidedAt: number | undefined;
  favorites: ReadonlySet<string>;
  input: ImportGuestDataInput;
  /** Device ids that can never be imported (malformed), dropped from the device. */
  invalid: ReadonlySet<string>;
  /** The device lists sent, in the order of `input.lists`. */
  lists: readonly LocalList[];
}

const UNTITLED_LIST = "—";

function isGestureId(id: string): boolean {
  return gestureIdSchema.safeParse(id).success;
}

/**
 * Favorites and lists on the device, as the import prompt counts them
 * (malformed favorite ids, which no import can take, do not count).
 */
export function countGuestData(data: GuestData): {
  favorites: number;
  lists: number;
} {
  return {
    favorites: new Set(data.favorites.filter(isGestureId)).size,
    lists: data.lists.length,
  };
}

/**
 * `text` trimmed and cut to at most `max` UTF-16 units (Zod's measure)
 * without splitting a code point.
 */
function cut(text: string, max: number): string {
  let out = "";
  for (const char of text.trim()) {
    if (out.length + char.length > max) {
      break;
    }
    out += char;
  }
  return out.trim();
}

/**
 * The import payload within the contract's limits, so bad local data never
 * fails the call: unique, well-formed favorites (the oldest
 * `IMPORT_FAVORITES_MAX`; the rest stays for the next import), lists with
 * names and descriptions trimmed and cut to the list limits (an empty name
 * becomes `untitled`) and their well-formed unique ids, and the consent
 * choice once the guest decided. Malformed ids are counted, not sent.
 */
function toPayload(data: GuestData, untitled: string): Payload {
  const invalid = new Set<string>();
  const valid = (ids: readonly string[]): string[] =>
    [...new Set(ids)].filter((id) => {
      if (isGestureId(id)) {
        return true;
      }
      invalid.add(id);
      return false;
    });
  const favorites = valid(data.favorites).slice(0, IMPORT_FAVORITES_MAX);
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
        const description = cut(local.description ?? "", LIST_DESCRIPTION_MAX);
        return {
          ...(description ? { description } : {}),
          gestureIds: valid(local.gestureIds).slice(0, IMPORT_LIST_ITEMS_MAX),
          name:
            cut(local.name, LIST_NAME_MAX) ||
            cut(untitled, LIST_NAME_MAX) ||
            UNTITLED_LIST,
        };
      }),
    },
    invalid,
    lists,
  };
}

/**
 * Removes what the server stored and keeps the rest: lists it did not
 * create (`notCreated`), the items that did not fit (`unplaced`), anything
 * added on the device while the call ran, recent searches and preferences.
 * Malformed ids go too: no import could ever take them.
 */
function clearImported(payload: Payload, result: ImportResult): Mutator {
  const outcomes = new Map(
    payload.lists.map((local, index) => [local.id, result.lists[index]])
  );
  return (data) => ({
    ...data,
    consent:
      payload.consentDecidedAt !== undefined &&
      data.consent.decidedAt === payload.consentDecidedAt
        ? { analytics: null }
        : data.consent,
    favorites: data.favorites.filter(
      (id) => !(payload.favorites.has(id) || payload.invalid.has(id))
    ),
    lists: data.lists.flatMap((local): LocalList[] => {
      if (!outcomes.has(local.id)) {
        return [local];
      }
      const outcome = outcomes.get(local.id);
      // No outcome for a sent list (an older server): keep it, to be safe.
      if (!outcome || outcome.status === "notCreated") {
        return [local];
      }
      if (outcome.unplaced.length === 0) {
        return [];
      }
      const left = new Set(outcome.unplaced);
      return [
        {
          ...local,
          gestureIds: local.gestureIds.filter((id) => left.has(id)),
        },
      ];
    }),
  });
}

/**
 * Imports the guest's device data into the signed-in account
 * (`account.importGuestData`, spec §11), then clears from the device what
 * the server stored (favorites, lists, the consent choice); what it could
 * not take stays, and so do recent searches and preferences. On failure
 * nothing is cleared and the error is rethrown. With nothing to import it
 * makes no call. Malformed ids are skipped and counted in
 * `skippedUnknownGestures`.
 */
export async function importGuestData({
  client,
  store,
  untitledListName = UNTITLED_LIST,
}: ImportGuestDataOptions): Promise<ImportResult> {
  try {
    await store.ready;
    const payload = toPayload(store.getSnapshot(), untitledListName);
    const { input } = payload;
    if (
      input.favorites.length === 0 &&
      input.lists.length === 0 &&
      input.consent === undefined
    ) {
      return {
        ...EMPTY_IMPORT_RESULT,
        skippedUnknownGestures: payload.invalid.size,
      };
    }
    const result = await client.account.importGuestData(input);
    await store.update(clearImported(payload, result));
    return {
      ...result,
      skippedUnknownGestures:
        result.skippedUnknownGestures + payload.invalid.size,
    };
  } catch (error) {
    console.error("[account] Failed to import guest data:", error);
    throw error;
  }
}
