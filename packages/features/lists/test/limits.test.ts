import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { newId } from "@smog/utils";
import { describe, expect, it } from "vitest";
import { LIST_ITEMS_MAX, LISTS_MAX } from "../src/schema";
import {
  addGestures,
  addUser,
  contextFor,
  router,
  storedItems,
} from "./helpers";

type Settled = PromiseSettledResult<unknown>;

function codes(results: Settled[]): string[] {
  return results
    .map((result) =>
      result.status === "fulfilled"
        ? "ok"
        : String((result.reason as { code?: string }).code)
    )
    .sort();
}

describe("limits are enforced by the write, not only a pre-check", () => {
  it(`concurrent creates at ${LISTS_MAX - 1} lists make exactly one more`, async () => {
    const owner = await addUser();
    const now = Date.now();
    await env.DB.batch(
      Array.from({ length: LISTS_MAX - 1 }, (_, index) =>
        env.DB.prepare(
          "INSERT INTO list (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(newId(), owner.id, `Lijst ${index}`, now, now)
      )
    );

    const results = await Promise.allSettled(
      ["A", "B", "C", "D"].map((name) =>
        call(router.create, { name }, contextFor(owner))
      )
    );

    expect(codes(results)).toEqual([
      "INVALID_STATE",
      "INVALID_STATE",
      "INVALID_STATE",
      "ok",
    ]);
    const count = await env.DB.prepare(
      "SELECT count(*) AS n FROM list WHERE owner_id = ?"
    )
      .bind(owner.id)
      .first<{ n: number }>();
    expect(count?.n).toBe(LISTS_MAX);
  });

  it(`concurrent adds at ${LIST_ITEMS_MAX - 1} items make exactly one more`, async () => {
    const owner = await addUser();
    const created = await call(
      router.create,
      { name: "Vol" },
      contextFor(owner)
    );
    const extra = await addGestures(["A", "B", "C", "D"]);
    // 499 published gestures, then their list rows: one batch each.
    const now = Date.now();
    const fillerIds = await addGestures(
      Array.from({ length: LIST_ITEMS_MAX - 1 }, () => "Filler")
    );
    await env.DB.batch(
      fillerIds.map((id, position) =>
        env.DB.prepare(
          "INSERT INTO list_item (list_id, gesture_id, position, created_at) VALUES (?, ?, ?, ?)"
        ).bind(created.id, id, position, now)
      )
    );

    const results = await Promise.allSettled(
      extra.map((gestureId) =>
        call(router.addItem, { gestureId, id: created.id }, contextFor(owner))
      )
    );

    expect(codes(results)).toEqual([
      "INVALID_STATE",
      "INVALID_STATE",
      "INVALID_STATE",
      "ok",
    ]);
    const rows = await storedItems(created.id);
    expect(rows).toHaveLength(LIST_ITEMS_MAX);
    expect(rows.at(-1)?.position).toBe(LIST_ITEMS_MAX - 1);
    // A full list still answers a repeated add as a no-op, not an error.
    expect(
      await call(
        router.addItem,
        { gestureId: fillerIds[0] as string, id: created.id },
        contextFor(owner)
      )
    ).toEqual({ added: false });
  });
});
