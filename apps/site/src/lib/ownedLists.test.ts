import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";
import type { User } from "@/payload-types";
import { fetchOwnedList, fetchOwnedLists } from "./ownedLists";

/**
 * The half of `lib/ownedLists.ts` that is observable without a database: the
 * shape of the query it builds, and the case where it builds none.
 *
 * `ownedLists.int.test.ts` covers what the query answers. What it cannot see
 * is that the owner clause and `overrideAccess: false` are *both* there. For
 * an ordinary member they are the same filter twice, so dropping either one
 * alone changes no answer any integration test can reach — only a structural
 * assertion can. They are asserted in separate tests, deliberately, so a
 * mutation sweep can tell which brace it broke: one test that checked both at
 * once would let a removed guard be waved through as "the other assertion
 * caught it".
 *
 * The other thing only this layer sees is a query that was never issued. A
 * denied read and a screened-out id both produce zero rows, so "asked and got
 * nothing" and "never asked" are indistinguishable from the result.
 */

const OWNER = { email: "owner@example.test", id: 7 } as User;

/** A Payload stand-in whose `find` records how it was called. */
function fakePayload(docs: unknown[] = []) {
  const find = vi.fn((_options: Record<string, unknown>) =>
    Promise.resolve({ docs })
  );

  return { find, payload: { find } as unknown as Payload };
}

describe("fetchOwnedList", () => {
  const args = { depth: 0, locale: "nl", user: OWNER } as const;

  it("does not open the database for an id that is not a row id", async () => {
    // `/nl/account/lists/abc` routes. Without the screen,
    // `{ id: { equals: "abc" } }` reaches the adapter as `NaN` rather than
    // being refused — see the comment on `isListId`.
    const { find, payload } = fakePayload();

    expect(await fetchOwnedList({ ...args, id: "abc", payload })).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it("does not open the database for a blank id", async () => {
    const { find, payload } = fakePayload();

    expect(await fetchOwnedList({ ...args, id: "", payload })).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it("does not open the database for an id with a leading zero", async () => {
    // `007` and `7` would otherwise both resolve to row 7, and the answer
    // could not be matched back to the id that was asked for.
    const { find, payload } = fakePayload();

    expect(await fetchOwnedList({ ...args, id: "007", payload })).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it("reads through the access layer rather than around it", async () => {
    const { find, payload } = fakePayload();

    await fetchOwnedList({ ...args, id: "12", payload });

    expect(find.mock.calls[0]?.[0]).toMatchObject({
      collection: "lists",
      overrideAccess: false,
    });
  });

  it("pins the query to the owner rather than relying on the access filter alone", async () => {
    const { find, payload } = fakePayload();

    await fetchOwnedList({ ...args, id: "12", payload });

    expect(find.mock.calls[0]?.[0]).toMatchObject({
      where: { and: [{ id: { equals: "12" } }, { owner: { equals: 7 } }] },
    });
  });

  it("passes the caller's depth, because a page and an endpoint want different documents", async () => {
    const { find, payload } = fakePayload();

    await fetchOwnedList({ ...args, depth: 1, id: "12", payload });

    expect(find.mock.calls[0]?.[0]).toMatchObject({ depth: 1 });
  });

  it("asks in the reader's own locale", async () => {
    const { find, payload } = fakePayload();

    await fetchOwnedList({ ...args, id: "12", locale: "fr", payload });

    expect(find.mock.calls[0]?.[0]).toMatchObject({ locale: "fr" });
  });

  it("answers null rather than throwing when the id names nothing of yours", async () => {
    const { payload } = fakePayload([]);

    expect(await fetchOwnedList({ ...args, id: "12", payload })).toBeNull();
  });

  it("answers the one row it found", async () => {
    const { payload } = fakePayload([{ id: 12, name: "Mijn lijst" }]);

    expect(await fetchOwnedList({ ...args, id: "12", payload })).toMatchObject({
      id: 12,
    });
  });
});

describe("fetchOwnedLists", () => {
  it("reads through the access layer rather than around it", async () => {
    const { find, payload } = fakePayload();

    await fetchOwnedLists({ locale: "nl", payload, user: OWNER });

    expect(find.mock.calls[0]?.[0]).toMatchObject({
      collection: "lists",
      overrideAccess: false,
    });
  });

  it("pins the index to the owner rather than relying on the access filter alone", async () => {
    // The clause an administrator needs: `listReadAccess` answers `true` for
    // them, so without it this page would list every list in the database.
    const { find, payload } = fakePayload();

    await fetchOwnedLists({ locale: "nl", payload, user: OWNER });

    expect(find.mock.calls[0]?.[0]).toMatchObject({
      where: { owner: { equals: 7 } },
    });
  });

  it("bounds the read rather than taking Payload's default of ten", async () => {
    const { find, payload } = fakePayload();

    await fetchOwnedLists({ locale: "nl", payload, user: OWNER });

    expect(find.mock.calls[0]?.[0]).toMatchObject({ limit: 100 });
  });

  it("sorts with a tie-breaker, so two lists saved in the same second hold their order", async () => {
    const { find, payload } = fakePayload();

    await fetchOwnedLists({ locale: "nl", payload, user: OWNER });

    expect(find.mock.calls[0]?.[0]).toMatchObject({
      sort: ["-updatedAt", "id"],
    });
  });
});
