import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { createDb } from "@smog/db/client";
import { describe, expect, it } from "vitest";
import { makeUser, recordingD1, scanReport } from "../../../support/db/index";
import { type Authed, contextAs, procedureAt, signedUp } from "./helpers";

/*
 * Phase 9 task 6 (P-17): the admin lists seek an index. The real procedures
 * run, as an admin, against a recording D1; each statement is explained with
 * its own values. The users search (`instr`) walks the `(created_at, id)`
 * index in order and stops at the page size: the accepted bounded scan.
 */

async function recorded(admin: Authed) {
  const { d1, statements } = recordingD1(env.DB);
  const context = { ...(await contextAs(admin)), db: createDb(d1) };
  const run = async (path: string, input?: unknown): Promise<unknown> =>
    await call(procedureAt(path), input, {
      context,
      path: ["admin", ...path.split(".")],
    });
  return { run, statements };
}

describe("the admin lists' query plans", () => {
  it("users: the list with each filter, the search and a cursor", async () => {
    const admin = await signedUp("admin");
    const db = createDb(env.DB);
    await Promise.all(
      ["Plan A", "Plan B", "Plan C"].map((name) => makeUser(db, { name }))
    );
    const { run, statements } = await recorded(admin);
    const page = (await run("users.list", { limit: 1 })) as {
      nextCursor: string | null;
    };
    expect(page.nextCursor).not.toBeNull();
    await run("users.list", { cursor: page.nextCursor, limit: 1 });
    await run("users.list", { role: "admin" });
    await run("users.list", { banned: true });
    await run("users.list", { banned: false, role: "user" });
    await run("users.list", { q: "plan" });
    expect(statements.length).toBeGreaterThanOrEqual(6);

    // `q` is a literal `instr` over email and name: no index can serve it,
    // so the plan walks the `(created_at, id)` index in order and stops at
    // the page size (a bounded scan, the brief's accepted exception).
    const report = await scanReport(env.DB, statements);
    expect(report.scans, report.plans.join("\n")).toEqual([]);
  });

  it("dead letters: each status and queue, and the cursor", async () => {
    const admin = await signedUp("admin");
    const { run, statements } = await recorded(admin);
    for (const status of ["open", "replayed", "discarded"]) {
      // biome-ignore lint/performance/noAwaitInLoops: a few reads, in order for a readable failure.
      await run("deadLetters.list", { status });
      await run("deadLetters.list", { queue: "email", status });
    }
    await run("deadLetters.list", {
      cursor: "x",
      status: "open",
    }).catch(() => undefined);
    expect(statements.length).toBeGreaterThan(5);
    const report = await scanReport(env.DB, statements);
    expect(report.scans, report.plans.join("\n")).toEqual([]);
  });

  it("sponsorships: each filter and the counts", async () => {
    const admin = await signedUp("admin");
    const { run, statements } = await recorded(admin);
    const filters: Record<string, unknown>[] = [
      {},
      { status: ["in_review"] },
      { status: ["live", "expiring"] },
      { q: "acme" },
      { paymentId: "payment" },
      { refundNeeded: true },
      { from: 1000, to: 9000 },
      { q: "acme", refundNeeded: true, status: ["in_review"] },
    ];
    for (const filter of filters) {
      // biome-ignore lint/performance/noAwaitInLoops: a few reads, in order for a readable failure.
      await run("sponsorships.list", filter);
    }
    expect(statements.length).toBeGreaterThan(filters.length);
    // The status tab counts group the whole table by status, by design (admin
    // only; the status index walks it without a sort).
    const report = await scanReport(
      env.DB,
      statements,
      (detail, sql) =>
        detail.startsWith(
          "SCAN sponsorship USING INDEX sponsorship_status_ends_at_idx"
        ) && sql.startsWith('select count(*), "sponsorship"."status"')
    );
    expect(report.scans, report.plans.join("\n")).toEqual([]);
  });
});
