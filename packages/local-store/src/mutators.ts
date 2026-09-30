import { RECENT_SEARCHES_MAX } from "@smog/config/constants";
import { newId } from "@smog/utils";
import type { GuestData, LocalList } from "./schema";

/** A pure transformation, passed to `store.update`. */
export type Mutator = (data: GuestData) => GuestData;

export function newLocalListId(): string {
  return `loc_${newId()}`;
}

// Selectors

export function isFavorite(data: GuestData, gestureId: string): boolean {
  return data.favorites.includes(gestureId);
}

export function selectList(
  data: GuestData,
  listId: string
): LocalList | undefined {
  return data.lists.find((list) => list.id === listId);
}

// Favorites

/** Adds the gesture when missing and removes it when present. */
export function toggleFavorite(gestureId: string): Mutator {
  return (data) => ({
    ...data,
    favorites: isFavorite(data, gestureId)
      ? data.favorites.filter((id) => id !== gestureId)
      : [...data.favorites, gestureId],
  });
}

// Recent searches

/** Trims, dedupes case-insensitively, newest first, keeps the last 10. */
export function addRecentSearch(query: string): Mutator {
  const trimmed = query.trim();
  return (data) => {
    if (trimmed === "") {
      return data;
    }
    const lower = trimmed.toLowerCase();
    return {
      ...data,
      recentSearches: [
        trimmed,
        ...data.recentSearches.filter((item) => item.toLowerCase() !== lower),
      ].slice(0, RECENT_SEARCHES_MAX),
    };
  };
}

export function clearRecentSearches(): Mutator {
  return (data) => ({ ...data, recentSearches: [] });
}

// Lists

function mapList(
  listId: string,
  change: (list: LocalList) => LocalList
): Mutator {
  return (data) => {
    if (!selectList(data, listId)) {
      return data;
    }
    return {
      ...data,
      lists: data.lists.map((list) =>
        list.id === listId ? change(list) : list
      ),
    };
  };
}

export function createList(
  name: string,
  description?: string,
  id: string = newLocalListId(),
  now: number = Date.now()
): Mutator {
  return (data) => ({
    ...data,
    lists: [
      ...data.lists,
      {
        id,
        name,
        ...(description === undefined ? {} : { description }),
        createdAt: now,
        gestureIds: [],
        updatedAt: now,
      },
    ],
  });
}

export function renameList(
  listId: string,
  name: string,
  now: number = Date.now()
): Mutator {
  return mapList(listId, (list) => ({ ...list, name, updatedAt: now }));
}

export function deleteList(listId: string): Mutator {
  return (data) => ({
    ...data,
    lists: data.lists.filter((list) => list.id !== listId),
  });
}

/** Appends the gesture unless the list already has it. */
export function addToList(
  listId: string,
  gestureId: string,
  now: number = Date.now()
): Mutator {
  return mapList(listId, (list) =>
    list.gestureIds.includes(gestureId)
      ? list
      : { ...list, gestureIds: [...list.gestureIds, gestureId], updatedAt: now }
  );
}

export function removeFromList(
  listId: string,
  gestureId: string,
  now: number = Date.now()
): Mutator {
  return mapList(listId, (list) =>
    list.gestureIds.includes(gestureId)
      ? {
          ...list,
          gestureIds: list.gestureIds.filter((id) => id !== gestureId),
          updatedAt: now,
        }
      : list
  );
}

/** Sets the order. `gestureIds` must be a permutation of the current ids. */
export function reorderList(
  listId: string,
  gestureIds: readonly string[],
  now: number = Date.now()
): Mutator {
  return (data) => {
    const list = selectList(data, listId);
    if (!list) {
      throw new Error(`[localStore] Unknown list ${listId}`);
    }
    const expected = new Set(list.gestureIds);
    const given = new Set(gestureIds);
    if (
      gestureIds.length !== list.gestureIds.length ||
      given.size !== gestureIds.length ||
      [...given].some((id) => !expected.has(id))
    ) {
      throw new Error("[localStore] Reorder must be a permutation of the list");
    }
    return mapList(listId, (current) => ({
      ...current,
      gestureIds: [...gestureIds],
      updatedAt: now,
    }))(data);
  };
}

// Consent and preferences

/**
 * Records the analytics decision. `mirroredFrom` marks a copy of a
 * signed-in account's decision (its user id); a guest's own choice has none.
 */
export function setConsent(
  analytics: boolean,
  now: number = Date.now(),
  mirroredFrom?: string
): Mutator {
  return (data) => ({
    ...data,
    consent: {
      analytics,
      decidedAt: now,
      ...(mirroredFrom ? { mirroredFrom } : {}),
    },
  });
}

export function setPreferences(
  partial: Partial<GuestData["preferences"]>
): Mutator {
  return (data) => ({
    ...data,
    preferences: { ...data.preferences, ...partial },
  });
}

/** How many user ids `importDismissedFor` remembers (the newest). */
export const IMPORT_DISMISSED_MAX = 20;

/**
 * Remembers that `userId` dismissed the guest import prompt on this device
 * (the guest data stays). Keeps the newest `IMPORT_DISMISSED_MAX` ids.
 */
export function dismissImportFor(userId: string): Mutator {
  return (data) => {
    const current = data.preferences.importDismissedFor;
    if (current.includes(userId)) {
      return data;
    }
    return {
      ...data,
      preferences: {
        ...data.preferences,
        importDismissedFor: [...current, userId].slice(-IMPORT_DISMISSED_MAX),
      },
    };
  };
}
