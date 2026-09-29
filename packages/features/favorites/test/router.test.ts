import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { createDb, type Db } from "@smog/db/client";
import { makeGesture, makeUser } from "@smog/db/testing";
import { makeRpcContext, makeSession } from "@smog/rpc/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { favoritesContract } from "../src/contract";
import { createFavoritesRouter } from "../src/server";
import { findSummaries, resetTables } from "./helpers";

const router = createFavoritesRouter({ findSummaries });
let db: Db;

/** `makeSession` is `user-1`; the row must exist for the foreign key. */
function signedIn() {
  return makeRpcContext({ db, session: makeSession("user") });
}

function guest() {
  return makeRpcContext({ db });
}

beforeEach(async () => {
  db = createDb(env.DB);
  await resetTables();
  await makeUser(db, { id: "user-1" });
});

describe("favoritesRouter", () => {
  it("implements every procedure of the contract", () => {
    expect(Object.keys(router).sort()).toEqual(
      Object.keys(favoritesContract).sort()
    );
  });

  it("answers UNAUTHORIZED without a session", async () => {
    const input = { gestureId: "g" };
    const calls = [
      call(router.ids, undefined, { context: guest() }),
      call(router.list, {}, { context: guest() }),
      call(router.add, input, { context: guest() }),
      call(router.remove, input, { context: guest() }),
      call(router.toggle, input, { context: guest() }),
    ];
    for (const pending of calls) {
      // biome-ignore lint/performance/noAwaitInLoops: one assertion per procedure.
      await expect(pending).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        defined: true,
      });
    }
  });

  it("adds, lists and removes for the session user", async () => {
    const hond = await makeGesture(db, { name: "Hond" });
    const context = signedIn();

    expect(await call(router.add, { gestureId: hond.id }, { context })).toEqual(
      { favorite: true }
    );
    expect(await call(router.ids, undefined, { context })).toEqual([hond.id]);
    expect(await call(router.list, {}, { context })).toEqual({
      items: [
        {
          categories: [],
          id: hond.id,
          name: "Hond",
          playbackId: hond.playbackId,
          slug: hond.slug,
        },
      ],
      nextCursor: null,
    });
    expect(
      await call(router.toggle, { gestureId: hond.id }, { context })
    ).toEqual({ favorite: false });
    expect(
      await call(router.remove, { gestureId: hond.id }, { context })
    ).toEqual({ favorite: false });
    expect(await call(router.ids, undefined, { context })).toEqual([]);
  });

  it("remove always succeeds, even for an unknown gesture", async () => {
    expect(
      await call(router.remove, { gestureId: "nope" }, { context: signedIn() })
    ).toEqual({ favorite: false });
  });

  it("answers NOT_FOUND to adding an unknown or unpublished gesture", async () => {
    const hidden = await makeGesture(db, { publishedAt: null });
    for (const gestureId of ["nope", hidden.id]) {
      for (const procedure of [router.add, router.toggle]) {
        // biome-ignore lint/performance/noAwaitInLoops: one assertion per case.
        await expect(
          call(procedure, { gestureId }, { context: signedIn() })
        ).rejects.toMatchObject({ code: "NOT_FOUND", defined: true });
      }
    }
  });

  it("answers VALIDATION for a cursor it did not issue", async () => {
    await expect(
      call(router.list, { cursor: "nope" }, { context: signedIn() })
    ).rejects.toMatchObject({
      code: "VALIDATION",
      data: { fieldErrors: { cursor: ["invalid"] } },
    });
  });
});
