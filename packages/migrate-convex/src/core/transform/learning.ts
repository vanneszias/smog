/**
 * The learning transform (phase 8 ruling 9; carry 24): Convex
 * `user_favorites`, `gesture_lists` and `gesture_list_items` →
 * `favorite`, `list`, `list_item` and `list_share`, in `30-learning`.
 *
 * - **Favorites** are the union of `user_favorites` and the items of each
 *   user's `isDefaultFavorites` list, at the earliest `created_at`. Rows of
 *   a guest, of a user dropped for no email, of an unknown user, or of a
 *   missing gesture are dropped and counted. An account over
 *   `FAVORITE_IDS_MAX` is warned about (`ids` returns the newest 5000).
 * - **Lists:** every non-default list of a migrated user becomes a `list`
 *   with its `list_item`s, renumbered `0..n-1` in the old `position,
 *   createdAt, _id` order; a repeated gesture keeps its first item.
 *   `added_by` is the mapped user, or NULL (a guest's item on a real
 *   user's shared list is kept). Names and descriptions are trimmed to 80
 *   and 280 (an empty name becomes `Lijst`; an empty description NULL).
 * - **Long lists are split** into consecutive lists of at most
 *   `LIST_ITEMS_MAX`: `Name`, `Name (2)` …, each suffixed name truncating
 *   its base to stay within 80 characters, and taking the next free
 *   suffix when the owner already has a list of that name. An account
 *   that then has more than `LISTS_MAX` lists is a **blocker**.
 * - **Shares:** only `visibility = "shared"` lists: `viewShareToken` →
 *   `view`, `editShareToken` → `edit` only with `allowSharedEditing`
 *   (otherwise it is counted and dropped). Tokens keep their values
 *   (staging replaces them, `pseudonymiser(target).shareToken`);
 *   `created_by` is the owner; a split list's shares stay on part 1.
 *   Old `/lists/<convexListId>` links to an owner's own list now answer
 *   not found (reported).
 *
 * Users are found through `legacyIdRef("user", …)` (a claimed account
 * keeps its own id); gestures and lists by their `legacyUuid`. Merged
 * duplicate accounts (`resolveUsers`) bring their favorites and lists to
 * the oldest one.
 */
import { favorite, list, listItem, listShare } from "@smog/db";
import { FAVORITE_IDS_MAX } from "@smog/favorites/schema";
import {
  LIST_DESCRIPTION_MAX,
  LIST_ITEMS_MAX,
  LIST_NAME_MAX,
  LISTS_MAX,
} from "@smog/lists/schema";
import { insertRow, legacyIdRef, type RawSql } from "../emit";
import type { GestureListItemRow, GestureListRow } from "../export-schema";
import { legacyKey, legacyUuid } from "../ids";
import type { TransformContext, TransformResult } from "../plan";
import { type ReportIssue, section } from "../report";
import { type Pseudonymiser, pseudonymiser } from "../target";
import { catalogIds } from "./catalog";
import {
  ISSUE_IDS_MAX,
  type MigratedUser,
  migratedLegacyId,
  type ResolvedUsers,
  resolveUsers,
  truncateText,
} from "./users";

/** The name of a list whose name is empty after trimming. */
const EMPTY_LIST_NAME = "Lijst";

/** `base (n)`, with `base` truncated so the whole stays within `LIST_NAME_MAX`. */
export function suffixedListName(base: string, n: number): string {
  const suffix = ` (${n})`;
  return `${truncateText(base, LIST_NAME_MAX - suffix.length)}${suffix}`;
}

/** Old item order: `position`, then `createdAt`, then `_id`. */
function itemOrder(a: GestureListItemRow, b: GestureListItemRow): number {
  if (a.position !== b.position) {
    return a.position - b.position;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  if (a._id === b._id) {
    return 0;
  }
  return a._id < b._id ? -1 : 1;
}

type ListRowValues = Omit<typeof list.$inferInsert, "ownerId"> & {
  ownerId: RawSql;
};
type ListItemValues = Omit<typeof listItem.$inferInsert, "addedBy"> & {
  addedBy: RawSql | null;
};
type FavoriteValues = Omit<typeof favorite.$inferInsert, "userId"> & {
  userId: RawSql;
};
type ListShareValues = Omit<typeof listShare.$inferInsert, "createdBy"> & {
  createdBy: RawSql;
};

export interface LearningTransformResult extends TransformResult {
  readonly rows: {
    readonly favorite: readonly FavoriteValues[];
    readonly list: readonly ListRowValues[];
    readonly listItem: readonly ListItemValues[];
    readonly listShare: readonly ListShareValues[];
  };
}

interface Drops {
  guest: number;
  missingGesture: number;
  noEmail: number;
  unknownUser: number;
}

function newDrops(): Drops {
  return { guest: 0, missingGesture: 0, noEmail: 0, unknownUser: 0 };
}

/** The migrated account of `ownerId`, or the reason it has none (counted in `drops`). */
function ownerOf(
  users: ResolvedUsers,
  byLegacyId: ReadonlyMap<string, MigratedUser>,
  ownerId: string,
  drops: Drops
): MigratedUser | null {
  const resolution = users.byConvexId.get(ownerId);
  if (!resolution) {
    drops.unknownUser += 1;
    return null;
  }
  if (resolution.kind === "guest") {
    drops.guest += 1;
    return null;
  }
  if (resolution.kind === "noEmail") {
    drops.noEmail += 1;
    return null;
  }
  return byLegacyId.get(resolution.legacyId) ?? null;
}

interface FavoriteEntry {
  createdAt: number;
  gestureId: string;
  owner: MigratedUser;
}

interface Favorites {
  drops: Drops;
  entries: FavoriteEntry[];
  merged: number;
  missingGestureIds: string[];
}

function collectFavorites(
  context: TransformContext,
  users: ResolvedUsers,
  byLegacyId: ReadonlyMap<string, MigratedUser>,
  gestures: ReadonlyMap<string, string>,
  defaultItems: readonly { item: GestureListItemRow; ownerId: string }[]
): Favorites {
  const drops = newDrops();
  const byKey = new Map<string, FavoriteEntry>();
  const missingGestureIds: string[] = [];
  let merged = 0;
  const add = (
    sourceId: string,
    ownerId: string,
    gestureConvexId: string,
    createdAt: number
  ) => {
    const owner = ownerOf(users, byLegacyId, ownerId, drops);
    if (!owner) {
      return;
    }
    const gestureId = gestures.get(gestureConvexId);
    if (!gestureId) {
      drops.missingGesture += 1;
      missingGestureIds.push(sourceId);
      return;
    }
    const key = legacyKey(owner.legacyId, gestureId);
    const existing = byKey.get(key);
    if (existing) {
      merged += 1;
      existing.createdAt = Math.min(existing.createdAt, createdAt);
      return;
    }
    byKey.set(key, { createdAt, gestureId, owner });
  };
  for (const row of context.data.user_favorites) {
    add(row._id, row.userId, row.gestureId, row.createdAt);
  }
  for (const { item, ownerId } of defaultItems) {
    add(item._id, ownerId, item.gestureId, item.createdAt);
  }
  return { drops, entries: [...byKey.values()], merged, missingGestureIds };
}

/** A migrated list part: its id, its name and its items. */
interface ListPart {
  readonly id: string;
  readonly items: readonly GestureListItemRow[];
  readonly name: string;
  readonly part: number;
}

interface PlannedList {
  readonly owner: MigratedUser;
  readonly parts: readonly ListPart[];
  readonly row: GestureListRow;
}

function limited(ids: readonly string[]): readonly string[] {
  return ids.slice(0, ISSUE_IDS_MAX);
}

interface UserIndex {
  readonly byLegacyId: ReadonlyMap<string, MigratedUser>;
  readonly users: ResolvedUsers;
}

interface ListSelection {
  defaultItems: { item: GestureListItemRow; ownerId: string }[];
  defaultLists: number;
  /** Shared default lists with share tokens (review I-1): their links stop working. */
  defaultShared: string[];
  defaultShareTokens: number;
  drops: Drops;
  kept: { owner: MigratedUser; row: GestureListRow }[];
  skippedItems: number;
}

/** The lists that migrate, and the default lists' items (favorites). */
function selectLists(
  context: TransformContext,
  index: UserIndex,
  itemsByList: ReadonlyMap<string, readonly GestureListItemRow[]>
): ListSelection {
  const selection: ListSelection = {
    defaultItems: [],
    defaultLists: 0,
    defaultShared: [],
    defaultShareTokens: 0,
    drops: newDrops(),
    kept: [],
    skippedItems: 0,
  };
  for (const row of context.data.gesture_lists) {
    const items = itemsByList.get(row._id) ?? [];
    if (row.isDefaultFavorites) {
      selection.defaultLists += 1;
      selection.defaultItems.push(
        ...items.map((item) => ({ item, ownerId: row.ownerId }))
      );
      const tokens =
        row.visibility === "shared"
          ? [row.viewShareToken, row.editShareToken].filter(Boolean).length
          : 0;
      if (tokens > 0) {
        selection.defaultShareTokens += tokens;
        selection.defaultShared.push(row._id);
      }
      continue;
    }
    const owner = ownerOf(
      index.users,
      index.byLegacyId,
      row.ownerId,
      selection.drops
    );
    if (owner) {
      selection.kept.push({ owner, row });
    } else {
      selection.skippedItems += items.length;
    }
  }
  return selection;
}

/** Each kept list's trimmed name (or `EMPTY_LIST_NAME`), and every owner's taken names. */
function listNames(kept: ListSelection["kept"]): {
  baseNames: Map<string, string>;
  emptyNames: string[];
  takenByOwner: Map<string, Set<string>>;
} {
  const baseNames = new Map<string, string>();
  const emptyNames: string[] = [];
  const takenByOwner = new Map<string, Set<string>>();
  for (const { owner, row } of kept) {
    const trimmed = truncateText(row.name.trim(), LIST_NAME_MAX);
    if (trimmed.length === 0) {
      emptyNames.push(row._id);
    }
    const name = trimmed || EMPTY_LIST_NAME;
    baseNames.set(row._id, name);
    const taken = takenByOwner.get(owner.legacyId) ?? new Set<string>();
    taken.add(name);
    takenByOwner.set(owner.legacyId, taken);
  }
  return { baseNames, emptyNames, takenByOwner };
}

interface ItemDrops {
  duplicate: number;
  missingGesture: string[];
}

/** A list's items in the old order, without missing gestures and repeats. */
function cleanItems(
  items: readonly GestureListItemRow[],
  gestures: ReadonlyMap<string, string>,
  drops: ItemDrops
): GestureListItemRow[] {
  const seen = new Set<string>();
  const out: GestureListItemRow[] = [];
  for (const item of [...items].sort(itemOrder)) {
    if (!gestures.has(item.gestureId)) {
      drops.missingGesture.push(item._id);
    } else if (seen.has(item.gestureId)) {
      drops.duplicate += 1;
    } else {
      seen.add(item.gestureId);
      out.push(item);
    }
  }
  return out;
}

/**
 * The parts of a list: at most `LIST_ITEMS_MAX` items each; part 1 keeps
 * the name, the others take the next free `Name (n)` of the owner.
 */
function splitList(
  listId: string,
  base: string,
  items: readonly GestureListItemRow[],
  taken: Set<string>
): Promise<ListPart[]> {
  const count = Math.max(1, Math.ceil(items.length / LIST_ITEMS_MAX));
  const names = [base];
  let suffix = 1;
  while (names.length < count) {
    suffix += 1;
    const name = suffixedListName(base, suffix);
    if (!taken.has(name)) {
      taken.add(name);
      names.push(name);
    }
  }
  return Promise.all(
    names.map(async (name, index) => ({
      id: await legacyUuid(
        "list",
        index === 0 ? listId : legacyKey(listId, String(index + 1))
      ),
      items: items.slice(index * LIST_ITEMS_MAX, (index + 1) * LIST_ITEMS_MAX),
      name,
      part: index + 1,
    }))
  );
}

/** The shares a list gets (on its first part), and the tokens it drops. */
function sharesOf(row: GestureListRow): {
  editDropped: number;
  privateDropped: number;
  tokens: { role: "view" | "edit"; token: string }[];
} {
  const view = row.viewShareToken;
  const edit = row.editShareToken;
  if (row.visibility !== "shared") {
    return {
      editDropped: 0,
      privateDropped: (view ? 1 : 0) + (edit ? 1 : 0),
      tokens: [],
    };
  }
  const tokens: { role: "view" | "edit"; token: string }[] = [];
  if (view) {
    tokens.push({ role: "view", token: view });
  }
  if (edit && row.allowSharedEditing) {
    tokens.push({ role: "edit", token: edit });
  }
  return {
    editDropped: edit && !row.allowSharedEditing ? 1 : 0,
    privateDropped: 0,
    tokens,
  };
}

interface Rows {
  addedByCleared: number;
  /** Lists whose edit token is dropped (shared editing off). */
  editTokenLists: string[];
  editTokensDropped: number;
  items: ListItemValues[];
  lists: ListRowValues[];
  privateTokensDropped: number;
  shares: ListShareValues[];
}

/** A part's `list_item` rows, positions `0..n-1`, `added_by` mapped or NULL. */
function addItemRows(
  part: ListPart,
  users: ResolvedUsers,
  gestures: ReadonlyMap<string, string>,
  rows: Rows
): void {
  for (const [position, item] of part.items.entries()) {
    const addedBy = migratedLegacyId(users, item.addedBy);
    rows.addedByCleared +=
      item.addedBy !== undefined && addedBy === null ? 1 : 0;
    rows.items.push({
      addedBy: addedBy === null ? null : legacyIdRef("user", addedBy),
      createdAt: new Date(item.createdAt),
      gestureId: gestures.get(item.gestureId) ?? "",
      listId: part.id,
      position,
    });
  }
}

async function listRowsOf(
  planned: readonly PlannedList[],
  users: ResolvedUsers,
  gestures: ReadonlyMap<string, string>,
  pseudo: Pseudonymiser
): Promise<Rows> {
  const rows: Rows = {
    addedByCleared: 0,
    editTokenLists: [],
    editTokensDropped: 0,
    items: [],
    lists: [],
    privateTokensDropped: 0,
    shares: [],
  };
  for (const { owner, parts, row } of planned) {
    const description = truncateText(
      (row.description ?? "").trim(),
      LIST_DESCRIPTION_MAX
    );
    for (const part of parts) {
      rows.lists.push({
        createdAt: new Date(row.createdAt),
        description: pseudo.listDescription(description || null),
        id: part.id,
        name: pseudo.listName(rows.lists.length + 1, part.name),
        ownerId: legacyIdRef("user", owner.legacyId),
        updatedAt: new Date(row.updatedAt),
      });
      addItemRows(part, users, gestures, rows);
    }
    const shares = sharesOf(row);
    rows.editTokensDropped += shares.editDropped;
    rows.editTokenLists.push(...(shares.editDropped > 0 ? [row._id] : []));
    rows.privateTokensDropped += shares.privateDropped;
    for (const { role, token } of shares.tokens) {
      const key = legacyKey(row._id, role);
      rows.shares.push({
        createdAt: new Date(row.createdAt),
        createdBy: legacyIdRef("user", owner.legacyId),
        // biome-ignore lint/performance/noAwaitInLoops: at most two shares per list, in order.
        id: await legacyUuid("list_share", key),
        listId: parts[0]?.id ?? "",
        revokedAt: null,
        role,
        token: await pseudo.shareToken(key, token),
      });
    }
  }
  return rows;
}

function countBy<T>(
  entries: readonly T[],
  key: (entry: T) => string,
  weight: (entry: T) => number = () => 1
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(key(entry), (counts.get(key(entry)) ?? 0) + weight(entry));
  }
  return counts;
}

interface LearningFacts {
  defaultShared: readonly string[];
  defaultShareTokens: number;
  editTokenLists: readonly string[];
  emptyNames: readonly string[];
  listsPerOwner: ReadonlyMap<string, number>;
  missingGestures: readonly string[];
  overFavorites: readonly string[];
  overLists: readonly string[];
  planned: number;
  splitLists: readonly string[];
}

function learningIssues(facts: LearningFacts): ReportIssue[] {
  const issues: ReportIssue[] = [];
  if (facts.overLists.length > 0) {
    issues.push({
      code: "tooManyLists",
      count: facts.overLists.length,
      details: facts.overLists.map((legacyId) => ({
        lists: facts.listsPerOwner.get(legacyId) ?? 0,
        user: legacyId,
      })),
      ids: limited(facts.overLists),
      message: `${facts.overLists.length} account(s) would have more than ${LISTS_MAX} lists after the long lists are split: merge or delete lists in the old admin, then plan again.`,
      severity: "blocker",
    });
  }
  if (facts.overFavorites.length > 0) {
    issues.push({
      code: "tooManyFavorites",
      count: facts.overFavorites.length,
      ids: limited(facts.overFavorites),
      message: `${facts.overFavorites.length} account(s) have more than ${FAVORITE_IDS_MAX} favorites: all are migrated, but the app shows the newest ${FAVORITE_IDS_MAX} as favorites.`,
      severity: "warning",
    });
  }
  if (facts.splitLists.length > 0) {
    issues.push({
      code: "listSplit",
      count: facts.splitLists.length,
      ids: limited(facts.splitLists),
      message: `${facts.splitLists.length} list(s) hold more than ${LIST_ITEMS_MAX} gestures and are split into consecutive lists "Name", "Name (2)" …; their shares stay on the first part.`,
      severity: "info",
    });
  }
  if (facts.missingGestures.length > 0) {
    issues.push({
      code: "missingGesture",
      count: facts.missingGestures.length,
      ids: limited(facts.missingGestures),
      message: `${facts.missingGestures.length} favorite(s) or list item(s) point at a gesture the export does not have; they are dropped.`,
      severity: "warning",
    });
  }
  if (facts.emptyNames.length > 0) {
    issues.push({
      code: "emptyListName",
      count: facts.emptyNames.length,
      ids: limited(facts.emptyNames),
      message: `${facts.emptyNames.length} list(s) have an empty name; they are named "${EMPTY_LIST_NAME}".`,
      severity: "warning",
    });
  }
  if (facts.defaultShared.length > 0) {
    issues.push({
      code: "defaultListSharesDropped",
      count: facts.defaultShareTokens,
      ids: limited(facts.defaultShared),
      message: `${facts.defaultShared.length} default favorites list(s) were shared: their ${facts.defaultShareTokens} share link(s) now answer not found, since favorites are not a shareable list any more (the favorites themselves are migrated).`,
      severity: "warning",
    });
  }
  if (facts.editTokenLists.length > 0) {
    issues.push({
      code: "editTokenDropped",
      count: facts.editTokenLists.length,
      ids: limited(facts.editTokenLists),
      message: `${facts.editTokenLists.length} shared list(s) kept an edit token with shared editing off (the old app then opened it read-only): those edit links now answer not found; their view links keep working.`,
      severity: "warning",
    });
  }
  if (facts.planned > 0) {
    issues.push({
      code: "listBookmarks",
      message:
        "Old /lists/<convex list id> links to an owner's own list now answer not found (owners find their lists under their account). Migrated share links keep their token: the view links of shared lists and the edit links of lists with shared editing on; a default favorites list's links and edit links with editing off answer not found (defaultListSharesDropped, editTokenDropped).",
      severity: "info",
    });
  }
  return issues;
}

/** The `30-learning` transform (see the module comment). */
export async function learningTransform(
  context: TransformContext
): Promise<LearningTransformResult> {
  const pseudo = pseudonymiser(context.target);
  const users = await resolveUsers(context);
  const byLegacyId = new Map(
    users.users.map((entry) => [entry.legacyId, entry])
  );
  const { gestures } = await catalogIds(context);
  const itemsByList = new Map<string, GestureListItemRow[]>();
  for (const item of context.data.gesture_list_items) {
    const items = itemsByList.get(item.listId) ?? [];
    items.push(item);
    itemsByList.set(item.listId, items);
  }
  const listIds = new Set(context.data.gesture_lists.map((row) => row._id));
  const itemsUnknownList = context.data.gesture_list_items.filter(
    (item) => !listIds.has(item.listId)
  ).length;

  const selection = selectLists(context, { byLegacyId, users }, itemsByList);
  const { baseNames, emptyNames, takenByOwner } = listNames(selection.kept);
  const itemDrops: ItemDrops = { duplicate: 0, missingGesture: [] };
  const planned: PlannedList[] = [];
  for (const { owner, row } of selection.kept) {
    const items = cleanItems(
      itemsByList.get(row._id) ?? [],
      gestures,
      itemDrops
    );
    // biome-ignore lint/performance/noAwaitInLoops: in order: each list's suffixes depend on the names the earlier ones took.
    const parts = await splitList(
      row._id,
      baseNames.get(row._id) ?? EMPTY_LIST_NAME,
      items,
      takenByOwner.get(owner.legacyId) ?? new Set<string>()
    );
    planned.push({ owner, parts, row });
  }
  const listsPerOwner = countBy(
    planned,
    (entry) => entry.owner.legacyId,
    (entry) => entry.parts.length
  );
  const rows = await listRowsOf(planned, users, gestures, pseudo);

  const favorites = collectFavorites(
    context,
    users,
    byLegacyId,
    gestures,
    selection.defaultItems
  );
  const favoriteRows: FavoriteValues[] = favorites.entries.map((entry) => ({
    createdAt: new Date(entry.createdAt),
    gestureId: entry.gestureId,
    userId: legacyIdRef("user", entry.owner.legacyId),
  }));
  const favoritesPerUser = countBy(
    favorites.entries,
    (entry) => entry.owner.legacyId
  );
  const splitLists = planned
    .filter((entry) => entry.parts.length > 1)
    .map((entry) => entry.row._id);
  const issues = learningIssues({
    defaultShared: selection.defaultShared,
    defaultShareTokens: selection.defaultShareTokens,
    editTokenLists: rows.editTokenLists,
    emptyNames,
    listsPerOwner,
    missingGestures: [
      ...favorites.missingGestureIds,
      ...itemDrops.missingGesture,
    ],
    overFavorites: [...favoritesPerUser]
      .filter(([, count]) => count > FAVORITE_IDS_MAX)
      .map(([legacyId]) => legacyId),
    overLists: [...listsPerOwner]
      .filter(([, count]) => count > LISTS_MAX)
      .map(([legacyId]) => legacyId),
    planned: planned.length,
    splitLists,
  });

  return {
    group: "30-learning",
    resetKeys: {
      rows: {
        favorite: favorites.entries.map((entry) => [
          entry.owner.id,
          entry.gestureId,
        ]),
        list: rows.lists.map((row) => row.id),
        list_item: rows.items.map((row) => [row.listId, row.gestureId]),
        list_share: rows.shares.map((row) => row.id),
      },
    },
    rows: {
      favorite: favoriteRows,
      list: rows.lists,
      listItem: rows.items,
      listShare: rows.shares,
    },
    sections: [
      section(
        "learning",
        {
          defaultListShareTokensDropped: selection.defaultShareTokens,
          defaultListsMerged: selection.defaultLists,
          favorites: favoriteRows.length,
          favoritesDroppedGuest: favorites.drops.guest,
          favoritesDroppedMissingGesture: favorites.drops.missingGesture,
          favoritesDroppedNoEmail: favorites.drops.noEmail,
          favoritesDroppedUnknownUser: favorites.drops.unknownUser,
          favoritesMergedDuplicates: favorites.merged,
          listItemAddedByCleared: rows.addedByCleared,
          listItems: rows.items.length,
          listItemsDroppedDuplicate: itemDrops.duplicate,
          listItemsDroppedMissingGesture: itemDrops.missingGesture.length,
          listItemsDroppedOwner: selection.skippedItems,
          listItemsDroppedUnknownList: itemsUnknownList,
          listShareEditTokensDropped: rows.editTokensDropped,
          listSharePrivateTokensDropped: rows.privateTokensDropped,
          listShares: rows.shares.length,
          lists: rows.lists.length,
          listsDroppedGuest: selection.drops.guest,
          listsDroppedNoEmail: selection.drops.noEmail,
          listsDroppedUnknownUser: selection.drops.unknownUser,
          listsSplit: splitLists.length,
        },
        issues
      ),
    ],
    statements: [
      ...favoriteRows.map((row) =>
        insertRow(favorite, row, [[favorite.userId, favorite.gestureId]])
      ),
      ...rows.lists.map((row) => insertRow(list, row, [[list.id]])),
      ...rows.items.map((row) =>
        insertRow(listItem, row, [[listItem.listId, listItem.gestureId]])
      ),
      ...rows.shares.map((row) => insertRow(listShare, row, [[listShare.id]])),
    ],
  };
}
