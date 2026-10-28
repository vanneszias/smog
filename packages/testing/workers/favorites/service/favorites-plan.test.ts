import { env } from "cloudflare:workers";
import { createDb } from "@smog/db/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addFavorite,
  listFavoriteIds,
  listFavorites,
  removeFavorite,
  toggleFavorite,
} from "../../../../features/favorites/src/server/index";
import {
  makeGesture,
  makeUser,
  recordingD1,
  scanReport,
} from "../../../support/db/index";
import { findSummaries, resetTables } from "./helpers";

/*
 * Phase 9 task 6 (P-17): the favorites list, `favoriteIds`, the toggle and
 * both writes seek an index (the real service against a recording D1).
 */

beforeEach(resetTables);

describe("the favorites' query plans (no full table scan)", () => {
  it("lists, pages, lists ids, adds, toggles and removes through indexes", async () => {
    const setup = createDb(env.DB);
    const user = await makeUser(setup);
    const gestures = await Promise.all(
      [0, 1, 2].map(() => makeGesture(setup, { publishedAt: new Date() }))
    );
    const { d1, statements } = recordingD1(env.DB);
    const db = createDb(d1);
    for (const [index, row] of gestures.entries()) {
      // biome-ignore lint/performance/noAwaitInLoops: distinct, ordered dates.
      await addFavorite(db, user.id, row.id, new Date(1000 + index));
    }
    const first = await listFavorites({ db, findSummaries }, user.id, {
      limit: 2,
    });
    expect(first.nextCursor).not.toBeNull();
    await listFavorites({ db, findSummaries }, user.id, {
      cursor: first.nextCursor ?? undefined,
      limit: 2,
    });
    expect(await listFavoriteIds(db, user.id)).toHaveLength(3);
    await toggleFavorite(db, user.id, gestures[0]?.id ?? "");
    await toggleFavorite(db, user.id, gestures[0]?.id ?? "");
    await removeFavorite(db, user.id, gestures[1]?.id ?? "");
    expect(statements.length).toBeGreaterThan(8);

    const report = await scanReport(env.DB, statements);
    expect(report.scans, report.plans.join("\n")).toEqual([]);
  });
});
