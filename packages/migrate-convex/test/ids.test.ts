import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { z } from "zod";
import { legacyUuid, legacyUuids } from "../src/core/ids";

const V8 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The same id computed independently with node:crypto. */
function expected(table: string, key: string): string {
  const bytes = createHash("sha256")
    .update(`smog-convex:${table}:${key}`)
    .digest()
    .subarray(0, 16);
  // biome-ignore lint/suspicious/noBitwiseOperators: RFC 9562's own form, to check the core's arithmetic.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  // biome-ignore lint/suspicious/noBitwiseOperators: as above.
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe("legacyUuid", () => {
  test("is a valid UUID v8 that zod accepts", async () => {
    const id = await legacyUuid("user", "jd7usr000000000000000000000ada1");
    expect(id).toMatch(V8);
    expect(z.uuid().safeParse(id).success).toBe(true);
  });

  test("is the SHA-256 of smog-convex:<table>:<key> with the version and variant set", async () => {
    for (const [table, key] of [
      ["user", "jd7usr000000000000000000000ada1"],
      ["gesture", "kg7ges000000000000000000000mam1"],
      ["list_share", "kl7lst000000000000000000000lst1:view"],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: three cases, in order.
      expect(await legacyUuid(table, key)).toBe(expected(table, key));
    }
  });

  test("is stable, and differs by table and by key", async () => {
    const a = await legacyUuid("gesture", "k1");
    expect(await legacyUuid("gesture", "k1")).toBe(a);
    expect(await legacyUuid("category", "k1")).not.toBe(a);
    expect(await legacyUuid("gesture", "k2")).not.toBe(a);
    // A pinned value: changing the derivation would change every migrated id.
    expect(a).toBe(expected("gesture", "k1"));
  });

  test("refuses an empty key and a table with a colon", async () => {
    await expect(legacyUuid("user", "")).rejects.toThrow(
      "Empty legacyUuid key"
    );
    await expect(legacyUuid("a:b", "k")).rejects.toThrow(
      "Invalid legacyUuid table"
    );
  });

  test("legacyUuids maps each distinct key", async () => {
    const ids = await legacyUuids("user", ["a", "b", "a"]);
    expect([...ids.keys()]).toEqual(["a", "b"]);
    expect(ids.get("b")).toBe(await legacyUuid("user", "b"));
  });
});
