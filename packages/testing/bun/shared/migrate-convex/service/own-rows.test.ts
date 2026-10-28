import { describe, expect, test } from "bun:test";
import { resetStatements } from "../../../../../migrate-convex/src/core/emit";
import { ownRowsOf } from "../../../../../migrate-convex/src/core/preflight";

/*
 * `ownRowsOf` reads back what `resetStatements` wrote (phase 9 ruling 10):
 * the ids of the tables the foreign-row checks read, and the legacy ids
 * the reset sets free.
 */

describe("ownRowsOf", () => {
  test("reads the ids and legacy ids back from the reset statements", () => {
    const sql = resetStatements({
      rows: {
        category: ["cat-1"],
        gesture: ["g-1", "g-2"],
        gesture_category: [["g-1", "cat-1"]],
        gesture_keyword: [["g-1", "ka ts"]],
        list_share: ["s-1"],
        payment: ["p-1", "p'2"],
        payment_item: [["p-1", "sp-1"]],
      },
      users: [
        { id: "u-1", legacyId: "jd7usr1" },
        { id: "u-2", legacyId: "jd7usr2" },
      ],
    });
    const own = ownRowsOf([`${sql.join("\n")}\n`]);
    expect([...own.ids.gesture].sort()).toEqual(["g-1", "g-2"]);
    expect([...own.ids.category]).toEqual(["cat-1"]);
    expect([...own.ids.list_share]).toEqual(["s-1"]);
    expect([...own.ids.payment].sort()).toEqual(["p'2", "p-1"]);
    expect([...own.legacyIds].sort()).toEqual(["jd7usr1", "jd7usr2"]);
  });

  test("reads across several files, and an empty reset holds nothing", () => {
    const first = resetStatements({ rows: { gesture: ["g-1"] } });
    const second = resetStatements({ rows: { gesture: ["g-2"] } });
    const own = ownRowsOf([`${first.join("\n")}\n`, `${second.join("\n")}\n`]);
    expect([...own.ids.gesture].sort()).toEqual(["g-1", "g-2"]);
    const none = ownRowsOf([""]);
    expect(none.ids.gesture.size + none.legacyIds.size).toBe(0);
  });

  test("a list of a parsed table that is not plain is an error, not a silent gap", () => {
    expect(() =>
      ownRowsOf([
        `DELETE FROM "gesture" WHERE "id" IN (SELECT value FROM json_each((char(10))));`,
      ])
    ).toThrow("no plain json_each list");
  });
});
