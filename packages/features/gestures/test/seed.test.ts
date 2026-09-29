import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { createDb } from "@smog/db/client";
import { makeRpcContext } from "@smog/rpc/testing";
import { describe, expect, it } from "vitest";
import { gesturesRouter } from "../src/server";
import { applyDevSeed } from "./helpers";

async function searchNames(q: string): Promise<string[]> {
  const { items } = await call(
    gesturesRouter.search,
    { q },
    { context: makeRpcContext({ db: createDb(env.DB), kv: env.KV }) }
  );
  return items.map((item) => item.name);
}

describe("the dev seed (packages/db/seed/dev.sql)", () => {
  it("is searchable: FTS rows, accents and the typo tier", async () => {
    await applyDevSeed();

    expect((await searchNames("hond"))[0]).toBe("Hond");
    expect(await searchNames("cafe")).toEqual(["Koffie"]);
    expect(await searchNames("tot zie")).toEqual(["Dag"]);
    expect(await searchNames("hnd")).toContain("Hond");
  });
});
