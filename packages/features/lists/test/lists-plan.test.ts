import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { createDb } from "@smog/db/client";
import { recordingD1, scanReport } from "@smog/db/testing";
import { makeRpcContext } from "@smog/rpc/testing";
import { describe, expect, it } from "vitest";
import { addGestures, addUser, router } from "./helpers";

/*
 * Phase 9 task 6 (P-17): the lists' hot reads and writes seek an index.
 * The real router runs against a recording D1; each statement it prepared
 * is explained with its own values.
 */

describe("the lists' query plans (no full table scan)", () => {
  it("overview, detail, containing, the writes, the share token and the shared view", async () => {
    const owner = await addUser("Plan Owner");
    const [hond, kat] = await addGestures(["Plan Hond", "Plan Kat"]);
    expect(hond).toBeDefined();
    const { d1, statements } = recordingD1(env.DB);
    const session = {
      session: { id: `session-${owner.id}`, userId: owner.id },
      user: {
        email: owner.email,
        id: owner.id,
        image: null,
        name: owner.name,
        role: "user",
      },
    };
    const context = {
      context: makeRpcContext({
        db: createDb(d1),
        locale: "nl",
        // The middleware reads only these fields of the session.
        session: session as never,
      }),
    };
    const created = await call(router.create, { name: "Plan" }, context);
    await call(
      router.addItem,
      { gestureId: hond as string, id: created.id },
      context
    );
    await call(
      router.addItem,
      { gestureId: kat as string, id: created.id },
      context
    );
    await call(router.mine, undefined, context);
    await call(router.get, { id: created.id }, context);
    await call(router.containing, { gestureId: hond as string }, context);
    await call(
      router.reorder,
      { gestureIds: [kat as string, hond as string], id: created.id },
      context
    );
    await call(router.update, { id: created.id, name: "Plan 2" }, context);
    const share = await call(
      router.share.create,
      { id: created.id, role: "view" },
      context
    );
    await call(router.share.get, { id: created.id }, context);
    await call(router.shared.get, { token: share.token }, context);
    await call(
      router.removeItem,
      { gestureId: hond as string, id: created.id },
      context
    );
    await call(router.share.revoke, { id: created.id, role: "view" }, context);
    await call(router.delete, { id: created.id }, context);
    expect(statements.length).toBeGreaterThan(10);

    const report = await scanReport(env.DB, statements);
    expect(report.scans, report.plans.join("\n")).toEqual([]);
    // The share-token lookup seeks its unique index.
    expect(report.plans.join("\n")).toContain("list_share");
  });
});
