import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { CONSENT_POLICY_VERSION } from "@smog/config/constants";
import { LIST_ITEMS_MAX, LISTS_MAX } from "@smog/lists/schema";
import { describe, expect, it, vi } from "vitest";
import {
  type ImportGuestDataInput,
  importGuestDataInputSchema,
} from "../src/schema";
import { createAccountRouter, importGuestData } from "../src/server";
import { importDeps } from "./deps";
import {
  addGestures,
  addList,
  addUser,
  contextFor,
  storedConsent,
  storedFavorites,
  storedLists,
  testDb,
} from "./helpers";

const NOW = new Date("2026-09-29T12:00:00Z");
const accountRouter = createAccountRouter(importDeps);

function input(partial: Partial<ImportGuestDataInput>): ImportGuestDataInput {
  return { favorites: [], lists: [], ...partial };
}

async function run(userId: string, data: ImportGuestDataInput, now = NOW) {
  return await importGuestData(
    { ...importDeps, db: testDb() },
    userId,
    // The router parses with the contract; the service takes parsed input.
    importGuestDataInputSchema.parse(data),
    now
  );
}

describe("importGuestData: favorites", () => {
  it("unions with the account's favorites, skipping unknown and unpublished ids", async () => {
    const owner = await addUser();
    const [aap, beer, hond] = await addGestures(["Aap", "Beer", "Hond"]);
    const [hidden] = await addGestures(["Verborgen"], { published: false });
    await run(
      owner.id,
      input({ favorites: [aap as string] }),
      new Date(NOW.getTime() - 60_000)
    );

    const result = await run(
      owner.id,
      input({
        favorites: [
          aap as string,
          beer as string,
          beer as string,
          "nope",
          hidden as string,
          hond as string,
        ],
      })
    );

    expect(result).toMatchObject({
      favoritesAdded: 2,
      skippedUnknownGestures: 2,
    });
    // The device order is oldest first; the newest guest favorite is newest.
    expect(await storedFavorites(owner.id)).toEqual([hond, beer, aap]);
  });
});

describe("importGuestData: lists", () => {
  it("creates lists in order with their published items at dense positions", async () => {
    const owner = await addUser();
    const [aap, beer] = await addGestures(["Aap", "Beer"]);
    const [hidden] = await addGestures(["Verborgen"], { published: false });

    const result = await run(
      owner.id,
      input({
        lists: [
          {
            description: "  Op de boerderij ",
            gestureIds: [
              beer as string,
              "nope",
              hidden as string,
              aap as string,
            ],
            name: " Dieren ",
          },
          { description: "   ", gestureIds: [], name: "Leeg" },
        ],
      })
    );

    expect(result).toEqual({
      favoritesAdded: 0,
      itemsAdded: 2,
      itemsOverLimit: 0,
      lists: [
        { status: "created", unplaced: [] },
        { status: "created", unplaced: [] },
      ],
      listsCreated: 2,
      listsMerged: 0,
      listsOverLimit: 0,
      skippedUnknownGestures: 2,
    });
    const lists = await storedLists(owner.id);
    expect(
      lists.map(({ description, items, name, positions }) => ({
        description,
        items,
        name,
        positions,
      }))
    ).toEqual([
      {
        description: "Op de boerderij",
        items: [beer, aap],
        name: "Dieren",
        positions: [0, 1],
      },
      { description: null, items: [], name: "Leeg", positions: [] },
    ]);
  });

  it("merges into a same-name list (case-insensitive, trimmed) by appending the missing items", async () => {
    const owner = await addUser();
    const [aap, beer, kat] = await addGestures(["Aap", "Beer", "Kat"]);
    const existing = await addList(owner.id, " dieren", [beer as string]);

    const result = await run(
      owner.id,
      input({
        lists: [
          {
            description: "ignored on a merge",
            gestureIds: [aap as string, beer as string, kat as string],
            name: "DIEREN ",
          },
        ],
      })
    );

    expect(result).toMatchObject({
      itemsAdded: 2,
      listsCreated: 0,
      listsMerged: 1,
    });
    const [list] = await storedLists(owner.id);
    expect(list).toMatchObject({
      description: null,
      id: existing,
      items: [beer, aap, kat],
      name: " dieren",
      positions: [0, 1, 2],
      updatedAt: NOW.getTime(),
    });
  });

  it("merges guest lists with the same name into one list", async () => {
    const owner = await addUser();
    const [aap, beer] = await addGestures(["Aap", "Beer"]);

    const result = await run(
      owner.id,
      input({
        lists: [
          { gestureIds: [aap as string], name: "Dieren" },
          { gestureIds: [beer as string, aap as string], name: "dieren" },
        ],
      })
    );

    expect(result).toMatchObject({
      itemsAdded: 2,
      listsCreated: 1,
      listsMerged: 1,
    });
    const lists = await storedLists(owner.id);
    expect(lists.map((list) => [list.name, list.items])).toEqual([
      ["Dieren", [aap, beer]],
    ]);
  });

  it("leaves a merged list's updated_at alone when nothing was added", async () => {
    const owner = await addUser();
    const [aap] = await addGestures(["Aap"]);
    await addList(owner.id, "Dieren", [aap as string], 1000);

    await run(
      owner.id,
      input({ lists: [{ gestureIds: [aap as string], name: "Dieren" }] })
    );

    const [list] = await storedLists(owner.id);
    expect(list?.updatedAt).toBe(1000);
  });
});

describe("importGuestData: consent", () => {
  it("appends the choice to the consent log with source import", async () => {
    const owner = await addUser();
    const decidedAt = NOW.getTime() - 60_000;

    await run(owner.id, input({ consent: { analytics: true, decidedAt } }));

    expect(await storedConsent(owner.id)).toEqual([
      {
        createdAt: decidedAt,
        granted: 1,
        policyVersion: CONSENT_POLICY_VERSION,
        purpose: "analytics",
        source: "import",
      },
    ]);
  });

  it("never dates a decision in the future", async () => {
    const owner = await addUser();

    await run(
      owner.id,
      input({
        consent: { analytics: false, decidedAt: NOW.getTime() + 86_400_000 },
      })
    );

    const [row] = await storedConsent(owner.id);
    expect(row).toMatchObject({ createdAt: NOW.getTime(), granted: 0 });

    // A retry later (the same skewed choice) does not append it again.
    await run(
      owner.id,
      input({
        consent: { analytics: false, decidedAt: NOW.getTime() + 86_400_000 },
      }),
      new Date(NOW.getTime() + 60_000)
    );
    expect(await storedConsent(owner.id)).toHaveLength(1);
  });

  it("keeps a newer decision of the account", async () => {
    const owner = await addUser();
    await env.DB.prepare(
      "INSERT INTO consent_event (id, user_id, purpose, granted, policy_version, source, created_at) VALUES (?, ?, 'analytics', 0, ?, 'web', ?)"
    )
      .bind(crypto.randomUUID(), owner.id, CONSENT_POLICY_VERSION, 5000)
      .run();

    await run(
      owner.id,
      input({ consent: { analytics: true, decidedAt: 4000 } })
    );

    expect(await storedConsent(owner.id)).toMatchObject([
      { granted: 0, source: "web" },
    ]);
  });
});

describe("importGuestData: idempotency", () => {
  it("adds nothing the second time", async () => {
    const owner = await addUser();
    const [aap, beer] = await addGestures(["Aap", "Beer"]);
    const data = input({
      consent: { analytics: true, decidedAt: NOW.getTime() - 1000 },
      favorites: [aap as string, "nope"],
      lists: [{ gestureIds: [beer as string, aap as string], name: "Dieren" }],
    });

    const first = await run(owner.id, data);
    const second = await run(owner.id, data, new Date(NOW.getTime() + 5000));

    expect(first).toEqual({
      favoritesAdded: 1,
      itemsAdded: 2,
      itemsOverLimit: 0,
      lists: [{ status: "created", unplaced: [] }],
      listsCreated: 1,
      listsMerged: 0,
      listsOverLimit: 0,
      skippedUnknownGestures: 1,
    });
    expect(second).toEqual({
      favoritesAdded: 0,
      itemsAdded: 0,
      itemsOverLimit: 0,
      lists: [{ status: "merged", unplaced: [] }],
      listsCreated: 0,
      listsMerged: 1,
      listsOverLimit: 0,
      skippedUnknownGestures: 1,
    });
    expect(await storedFavorites(owner.id)).toEqual([aap]);
    const lists = await storedLists(owner.id);
    expect(lists.map((list) => [list.items, list.updatedAt])).toEqual([
      [[beer, aap], NOW.getTime()],
    ]);
    expect(await storedConsent(owner.id)).toHaveLength(1);
  });
});

describe("importGuestData: limits", () => {
  it(`creates lists only up to LISTS_MAX (${LISTS_MAX})`, async () => {
    const owner = await addUser();
    const [aap] = await addGestures(["Aap"]);
    await env.DB.batch(
      Array.from({ length: LISTS_MAX - 1 }, (_, index) =>
        env.DB.prepare(
          "INSERT INTO list (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), owner.id, `Lijst ${index}`, 1, 1)
      )
    );

    const result = await run(
      owner.id,
      input({
        lists: ["A", "B", "C", "b"].map((name) => ({
          gestureIds: [aap as string],
          name,
        })),
      })
    );

    expect(result).toMatchObject({
      itemsAdded: 1,
      lists: [
        { status: "created", unplaced: [] },
        { status: "notCreated", unplaced: [] },
        { status: "notCreated", unplaced: [] },
        // Same name as "B", which was not created: not stored either.
        { status: "notCreated", unplaced: [] },
      ],
      listsCreated: 1,
      listsMerged: 0,
      listsOverLimit: 3,
    });
    const lists = await storedLists(owner.id);
    expect(lists).toHaveLength(LISTS_MAX);
    expect(lists.filter((list) => list.items.length > 0)).toMatchObject([
      { name: "A" },
    ]);
    const { results } = await env.DB.prepare(
      "SELECT count(*) AS n FROM list_item li LEFT JOIN list l ON l.id = li.list_id WHERE l.id IS NULL"
    ).all<{ n: number }>();
    expect(results[0]?.n).toBe(0);
  });

  it(`appends items to a merged list only up to LIST_ITEMS_MAX (${LIST_ITEMS_MAX})`, async () => {
    const owner = await addUser();
    const full = await addGestures(
      Array.from({ length: LIST_ITEMS_MAX - 1 }, (_, index) => `G${index}`)
    );
    const [aap, beer, kat] = await addGestures(["Aap", "Beer", "Kat"]);
    await addList(owner.id, "Dieren", full);

    const result = await run(
      owner.id,
      input({
        lists: [
          {
            gestureIds: [
              full[0] as string,
              aap as string,
              beer as string,
              kat as string,
            ],
            name: "Dieren",
          },
        ],
      })
    );

    expect(result).toMatchObject({
      itemsAdded: 1,
      itemsOverLimit: 2,
      lists: [{ status: "merged", unplaced: [beer, kat] }],
    });
    const [list] = await storedLists(owner.id);
    expect(list?.items).toHaveLength(LIST_ITEMS_MAX);
    expect(list?.items.at(-1)).toBe(aap);
    expect(list?.positions.at(-1)).toBe(LIST_ITEMS_MAX - 1);
  });
});

describe("importGuestData: all or nothing", () => {
  it("rolls back every write when the last statement fails", async () => {
    const owner = await addUser();
    const [aap] = await addGestures(["Aap"]);
    // The consent insert is the batch's last statement: make it fail.
    await env.DB.prepare(
      "CREATE TRIGGER consent_import_fails BEFORE INSERT ON consent_event BEGIN SELECT RAISE(ABORT, 'boom'); END"
    ).run();
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await expect(
        run(
          owner.id,
          input({
            consent: { analytics: true, decidedAt: 1 },
            favorites: [aap as string],
            lists: [{ gestureIds: [aap as string], name: "Dieren" }],
          })
        )
      ).rejects.toThrow();
      expect(error).toHaveBeenCalledWith(
        "[account] Failed to import guest data:",
        expect.anything()
      );
    } finally {
      await env.DB.prepare("DROP TRIGGER consent_import_fails").run();
      error.mockRestore();
    }

    expect(await storedFavorites(owner.id)).toEqual([]);
    expect(await storedLists(owner.id)).toEqual([]);
    expect(await storedConsent(owner.id)).toEqual([]);
  });
});

describe("account router", () => {
  it("needs a session", async () => {
    await expect(
      call(
        accountRouter.importGuestData,
        input({ favorites: ["g"] }),
        contextFor(null)
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("imports for the signed-in user", async () => {
    const owner = await addUser();
    const [aap] = await addGestures(["Aap"]);

    const result = await call(
      accountRouter.importGuestData,
      input({ favorites: [aap as string] }),
      contextFor(owner)
    );

    expect(result.favoritesAdded).toBe(1);
    expect(await storedFavorites(owner.id)).toEqual([aap]);
  });

  it(`rejects more than LISTS_MAX (${LISTS_MAX}) lists`, async () => {
    const owner = await addUser();
    await expect(
      call(
        accountRouter.importGuestData,
        input({
          lists: Array.from({ length: LISTS_MAX + 1 }, (_, index) => ({
            gestureIds: [],
            name: `L${index}`,
          })),
        }),
        contextFor(owner)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
