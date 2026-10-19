import { describe, expect, test } from "bun:test";
import { legacyIdRef } from "../src/core/emit";
import type {
  GestureListItemRow,
  GestureListRow,
  GestureRow,
  UserFavoriteRow,
} from "../src/core/export-schema";
import { legacyKey, legacyUuid } from "../src/core/ids";
import {
  learningTransform,
  suffixedListName,
} from "../src/core/transform/learning";
import {
  conflictProblems,
  fixtureContext,
  ges,
  lst,
  user,
} from "./transform-helpers";

const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ref = (suffix: string) => legacyIdRef("user", user(suffix));

function gestures(count: number): GestureRow[] {
  return Array.from({ length: count }, (_, index) => ({
    _creationTime: 1_740_000_000_000 + index,
    _id: `kg7gen${String(index).padStart(5, "0")}`,
    categoryIds: [],
    concept: [],
    info: "",
    isActive: true,
    lastUpdated: 1_740_000_000_000,
    name: `Gebaar ${index}`,
    playbackId: `genPlayback${index}`,
  }));
}

function listRow(
  id: string,
  owner: string,
  name: string,
  extra: Partial<GestureListRow> = {}
): GestureListRow {
  return {
    _creationTime: 1_740_000_000_000,
    _id: id,
    allowSharedEditing: false,
    createdAt: 1_740_000_000_000,
    isDefaultFavorites: false,
    name,
    ownerId: owner,
    updatedAt: 1_740_000_000_000,
    visibility: "private",
    ...extra,
  };
}

function items(listId: string, gestureRows: readonly GestureRow[]) {
  return gestureRows.map(
    (row, index): GestureListItemRow => ({
      _creationTime: 1_740_000_000_000 + index,
      _id: `${listId}-item-${index}`,
      createdAt: 1_740_000_000_000 + index,
      gestureId: row._id,
      listId,
      // Old positions need not be dense: they are renumbered.
      position: index * 2,
    })
  );
}

describe("the learning transform", () => {
  test("unites favorites with the default list's items at the earliest time, and drops the rest", async () => {
    const result = await learningTransform(await fixtureContext());
    const mama = await legacyUuid("gesture", ges("mam1"));
    const papa = await legacyUuid("gesture", ges("pap1"));
    expect(result.rows.favorite).toEqual([
      // fav1 (Ada, Mama) and the default list's item: the item is older.
      {
        createdAt: new Date(1_735_689_950_000),
        gestureId: mama,
        userId: ref("ada1"),
      },
      // fav4 (dup2, merged into dup1) and fav5 (dup1): the older one.
      {
        createdAt: new Date(1_735_690_030_000),
        gestureId: papa,
        userId: ref("dup1"),
      },
      // fav7: a user whose email came from the WorkOS export.
      {
        createdAt: new Date(1_735_690_060_000),
        gestureId: mama,
        userId: ref("noe1"),
      },
      // fav8: the account an admin made with `admin:grant --create` before the import.
      {
        createdAt: new Date(1_735_690_070_000),
        gestureId: await legacyUuid("gesture", ges("ete1")),
        userId: ref("pre1"),
      },
      // fav9: a second row of upg1's WorkOS id (M-3).
      {
        createdAt: new Date(1_735_690_080_000),
        gestureId: papa,
        userId: ref("upg1"),
      },
      // The default list's other item.
      {
        createdAt: new Date(1_735_689_960_000),
        gestureId: papa,
        userId: ref("ada1"),
      },
    ]);
    const counts = result.sections[0]?.counts ?? {};
    expect(counts.favoritesDroppedGuest).toBe(1);
    expect(counts.favoritesDroppedNoEmail).toBe(1);
    expect(counts.favoritesDroppedMissingGesture).toBe(1);
    expect(counts.favoritesMergedDuplicates).toBe(2);
    expect(counts.defaultListsMerged).toBe(1);
  });

  test("migrates every non-default list of a migrated user, renumbered, with added_by mapped or NULL", async () => {
    const result = await learningTransform(await fixtureContext());
    const ids = await Promise.all(
      ["lst1", "lst2", "lst3", "dup2", "pre1"].map((suffix) =>
        legacyUuid("list", lst(suffix))
      )
    );
    expect(result.rows.list.map((row) => row.id)).toEqual(ids);
    expect(result.rows.list[1]).toEqual({
      createdAt: new Date(1_735_690_110_000),
      description: "Gedeelde fixture beschrijving",
      id: ids[1] ?? "",
      name: "Samen leren",
      ownerId: ref("ada1"),
      updatedAt: new Date(1_735_690_111_000),
    });
    // The duplicate account's list moved to the oldest account.
    expect(result.rows.list[3]?.ownerId).toEqual(ref("dup1"));
    expect(result.rows.list[0]?.description).toBe("Thuis");
    const shared = result.rows.listItem.filter((row) => row.listId === ids[1]);
    expect(
      shared.map((row) => [row.gestureId, row.position, row.addedBy])
    ).toEqual([
      // Position 0: a guest's item on a real user's shared list, kept.
      [await legacyUuid("gesture", ges("pap1")), 0, null],
      // Position 1 twice: the older item first.
      [await legacyUuid("gesture", ges("ete1")), 1, ref("ada1")],
      [await legacyUuid("gesture", ges("mam1")), 2, ref("ada1")],
    ]);
    const counts = result.sections[0]?.counts ?? {};
    expect(counts.lists).toBe(5);
    expect(counts.listsDroppedGuest).toBe(1);
    expect(counts.listItemsDroppedOwner).toBe(1);
    expect(counts.listItemsDroppedDuplicate).toBe(1);
    expect(counts.listItemsDroppedMissingGesture).toBe(1);
    expect(counts.listItemAddedByCleared).toBe(1);
  });

  test("shares only shared lists, edit only with shared editing, tokens kept", async () => {
    const result = await learningTransform(await fixtureContext());
    const shares = result.rows.listShare.map((row) => [
      row.listId,
      row.role,
      row.token,
      row.createdBy,
    ]);
    expect(shares).toEqual([
      [
        await legacyUuid("list", lst("lst1")),
        "view",
        "fixture-view-token-0001",
        ref("ada1"),
      ],
      [
        await legacyUuid("list", lst("lst2")),
        "view",
        "fixture-view-token-0002",
        ref("ada1"),
      ],
      [
        await legacyUuid("list", lst("lst2")),
        "edit",
        "fixture-edit-token-0002",
        ref("ada1"),
      ],
      [
        await legacyUuid("list", lst("lst3")),
        "view",
        "fixture-view-token-0003",
        ref("dif1"),
      ],
    ]);
    expect(result.rows.listShare[2]?.id).toBe(
      await legacyUuid("list_share", legacyKey(lst("lst2"), "edit"))
    );
    const counts = result.sections[0]?.counts ?? {};
    expect(counts.listShareEditTokensDropped).toBe(1);
    expect(counts.listSharePrivateTokensDropped).toBe(1);
    // The shared default favorites list (I-1): its links stop working.
    expect(counts.defaultListShareTokensDropped).toBe(2);
    const issues = result.sections[0]?.issues ?? [];
    expect(
      issues.find((issue) => issue.code === "defaultListSharesDropped")
    ).toMatchObject({ count: 2, ids: [lst("def1")], severity: "warning" });
    expect(
      issues.find((issue) => issue.code === "editTokenDropped")
    ).toMatchObject({ count: 1, ids: [lst("lst3")], severity: "warning" });
    const bookmarks = issues.find((issue) => issue.code === "listBookmarks");
    expect(bookmarks?.message).not.toContain("keep working.");
    expect(bookmarks?.message).toContain("answer not found");
  });

  test("splits a list of 501 items with an 80-character name, after an existing Name (2)", async () => {
    const context = await fixtureContext();
    const many = gestures(501);
    const name = "L".repeat(80);
    const existing = suffixedListName(name, 2);
    expect(existing).toHaveLength(80);
    const lists = [
      listRow("kl7long", user("ada1"), name, {
        viewShareToken: "fixture-view-token-long",
        visibility: "shared",
      }),
      listRow("kl7two", user("ada1"), existing),
    ];
    const result = await learningTransform({
      ...context,
      data: {
        ...context.data,
        gesture_list_items: items("kl7long", many),
        gesture_lists: lists,
        gestures: many,
      },
    });
    const part1 = await legacyUuid("list", "kl7long");
    const part2 = await legacyUuid("list", legacyKey("kl7long", "2"));
    expect(result.rows.list.map((row) => [row.id, row.name])).toEqual([
      [part1, name],
      [part2, `${"L".repeat(76)} (3)`],
      [await legacyUuid("list", "kl7two"), existing],
    ]);
    const first = result.rows.listItem.filter((row) => row.listId === part1);
    const second = result.rows.listItem.filter((row) => row.listId === part2);
    expect(first).toHaveLength(500);
    expect(second.map((row) => row.position)).toEqual([0]);
    expect(first.map((row) => row.position)).toEqual(
      Array.from({ length: 500 }, (_, index) => index)
    );
    expect(second[0]?.gestureId).toBe(
      await legacyUuid("gesture", "kg7gen00500")
    );
    expect(result.rows.listShare.map((row) => row.listId)).toEqual([part1]);
    expect(result.sections[0]?.counts.listsSplit).toBe(1);
    expect(result.sections[0]?.issues.map((issue) => issue.code)).not.toContain(
      "tooManyLists"
    );
  });

  test("allows 100 lists and blocks 101 after a split", async () => {
    const context = await fixtureContext();
    const many = gestures(501);
    const hundred = Array.from({ length: 100 }, (_, index) =>
      listRow(
        `kl7many${String(index).padStart(3, "0")}`,
        user("adm2"),
        `Lijst ${index}`
      )
    );
    const fine = await learningTransform({
      ...context,
      data: {
        ...context.data,
        gesture_list_items: items("kl7many000", many.slice(0, 500)),
        gesture_lists: hundred,
        gestures: many,
      },
    });
    expect(fine.rows.list).toHaveLength(100);
    expect(
      fine.sections[0]?.issues.some((issue) => issue.severity === "blocker")
    ).toBe(false);
    const split = await learningTransform({
      ...context,
      data: {
        ...context.data,
        gesture_list_items: items("kl7many000", many),
        gesture_lists: hundred,
        gestures: many,
      },
    });
    expect(split.rows.list).toHaveLength(101);
    expect(split.sections[0]?.issues[0]).toMatchObject({
      code: "tooManyLists",
      details: [{ lists: 101, user: user("adm2") }],
      ids: [user("adm2")],
      severity: "blocker",
    });
  });

  test("warns about an account over 5000 favorites", async () => {
    const context = await fixtureContext();
    const many = gestures(5001);
    const favorites = many.map(
      (row, index): UserFavoriteRow => ({
        _creationTime: 1_740_000_000_000 + index,
        _id: `kf7gen${index}`,
        createdAt: 1_740_000_000_000 + index,
        gestureId: row._id,
        userId: user("adm2"),
      })
    );
    const result = await learningTransform({
      ...context,
      data: {
        ...context.data,
        gesture_list_items: [],
        gesture_lists: [],
        gestures: many,
        user_favorites: favorites,
      },
    });
    expect(result.rows.favorite).toHaveLength(5001);
    expect(result.sections[0]?.issues[0]).toMatchObject({
      code: "tooManyFavorites",
      ids: [user("adm2")],
      severity: "warning",
    });
  });

  test("trims names and descriptions to 80 and 280, and names an empty list", async () => {
    const context = await fixtureContext();
    const result = await learningTransform({
      ...context,
      data: {
        ...context.data,
        gesture_list_items: [],
        gesture_lists: [
          listRow("kl7trim", user("ada1"), `  ${"N".repeat(90)}  `, {
            description: ` ${"D".repeat(300)} `,
          }),
          listRow("kl7empty", user("ada1"), "   ", { description: "  " }),
        ],
      },
    });
    expect(result.rows.list.map((row) => [row.name, row.description])).toEqual([
      ["N".repeat(80), "D".repeat(280)],
      ["Lijst", null],
    ]);
  });

  test("names every conflict target and returns its reset keys", async () => {
    const result = await learningTransform(await fixtureContext());
    expect(result.group).toBe("30-learning");
    expect(conflictProblems(result.statements)).toEqual([]);
    expect(result.resetKeys.rows?.favorite).toEqual([
      [
        await legacyUuid("user", user("ada1")),
        await legacyUuid("gesture", ges("mam1")),
      ],
      [
        await legacyUuid("user", user("dup1")),
        await legacyUuid("gesture", ges("pap1")),
      ],
      [
        await legacyUuid("user", user("noe1")),
        await legacyUuid("gesture", ges("mam1")),
      ],
      [
        await legacyUuid("user", user("pre1")),
        await legacyUuid("gesture", ges("ete1")),
      ],
      [
        await legacyUuid("user", user("upg1")),
        await legacyUuid("gesture", ges("pap1")),
      ],
      [
        await legacyUuid("user", user("ada1")),
        await legacyUuid("gesture", ges("pap1")),
      ],
    ]);
    expect(result.resetKeys.rows?.list).toEqual(
      result.rows.list.map((row) => row.id)
    );
    expect(result.resetKeys.rows?.list_item).toEqual(
      result.rows.listItem.map((row) => [row.listId, row.gestureId])
    );
    expect(result.resetKeys.rows?.list_share).toEqual(
      result.rows.listShare.map((row) => row.id)
    );
  });

  test("pseudonymises list names, descriptions and share tokens on staging, keeping every row", async () => {
    const staging = await learningTransform(
      await fixtureContext({ target: "staging" })
    );
    const production = await learningTransform(await fixtureContext());
    expect(staging.rows.list.map((row) => [row.name, row.description])).toEqual(
      [
        ["Lijst 1", null],
        ["Lijst 2", null],
        ["Lijst 3", null],
        ["Lijst 4", null],
        ["Lijst 5", null],
      ]
    );
    expect(staging.rows.listShare).toHaveLength(
      production.rows.listShare.length
    );
    for (const row of staging.rows.listShare) {
      expect(row.token).toMatch(SHARE_TOKEN);
    }
    expect(staging.statements).toHaveLength(production.statements.length);
    expect(staging.sections[0]?.counts).toEqual(
      production.sections[0]?.counts ?? {}
    );
  });
});
