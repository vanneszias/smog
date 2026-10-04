import { describe, expect, test } from "bun:test";
import { legacyIdRef } from "../src/core/emit";
import { legacyKey, legacyUuid } from "../src/core/ids";
import { accountTransform, auditCutoff } from "../src/core/transform/account";
import {
  cat,
  conflictProblems,
  fixtureContext,
  ges,
  lst,
  user,
} from "./transform-helpers";

const ref = (suffix: string) => legacyIdRef("user", user(suffix));
const con = (suffix: string) => `kn7con000000000000000000000${suffix}`;
const log = (suffix: string) => `ka7log000000000000000000000${suffix}`;
const SPONSORSHIP = "ks7spn000000000000000000000spn1";

describe("the account transform", () => {
  test("turns each consent row into an analytics event and, when set, a marketing event", async () => {
    const result = await accountTransform(await fixtureContext());
    const id = (suffix: string, purpose: string) =>
      legacyUuid("consent_event", legacyKey(con(suffix), purpose));
    expect(result.rows.consentEvent).toEqual([
      {
        createdAt: new Date(1_735_690_300_000),
        granted: true,
        id: await id("con1", "analytics"),
        policyVersion: "1.0",
        purpose: "analytics",
        source: "import",
        userId: ref("ada1"),
      },
      {
        createdAt: new Date(1_735_690_300_000),
        granted: false,
        id: await id("con1", "marketing"),
        policyVersion: "1.0",
        purpose: "marketing",
        source: "import",
        userId: ref("ada1"),
      },
      // No marketingConsent: one event; a refusal stays a refusal.
      {
        createdAt: new Date(1_735_690_310_000),
        granted: false,
        id: await id("con2", "analytics"),
        policyVersion: "1.1",
        purpose: "analytics",
        source: "import",
        userId: ref("dif1"),
      },
      // The merged duplicate's consent goes to the oldest account.
      {
        createdAt: new Date(1_735_690_330_000),
        granted: true,
        id: await id("con4", "analytics"),
        policyVersion: "1.1",
        purpose: "analytics",
        source: "import",
        userId: ref("dup1"),
      },
      {
        createdAt: new Date(1_735_690_330_000),
        granted: true,
        id: await id("con4", "marketing"),
        policyVersion: "1.1",
        purpose: "marketing",
        source: "import",
        userId: ref("dup1"),
      },
    ]);
    expect(result.sections[0]?.counts.consentRowsDroppedGuest).toBe(1);
    // The IP address and the user agent are never written.
    expect(result.statements.join("\n")).not.toContain("192.0.2.10");
    expect(result.statements.join("\n")).not.toContain("FixtureAgent");
  });

  test("turns admin logs into legacy audit rows with mapped targets and actors", async () => {
    const result = await accountTransform(await fixtureContext());
    const rows = new Map(
      await Promise.all(
        result.rows.auditLog.map(async (row) => [row.id, row] as const)
      )
    );
    const entry = async (suffix: string) =>
      rows.get(await legacyUuid("audit_log", log(suffix)));
    expect(await entry("log1")).toEqual({
      action: "legacy",
      actorId: ref("ada1"),
      createdAt: new Date(1_735_690_400_000),
      data: {
        legacy: {
          action: "gesture.update",
          metadata: { field: "info" },
          targetId: ges("mam1"),
          targetType: "gesture",
        },
      },
      id: await legacyUuid("audit_log", log("log1")),
      targetId: await legacyUuid("gesture", ges("mam1")),
      targetType: "gesture",
    });
    expect(await entry("log2")).toMatchObject({
      actorId: ref("adm2"),
      targetId: await legacyUuid("category", cat("fam1")),
      targetType: "category",
    });
    expect(await entry("log3")).toMatchObject({
      targetId: await legacyUuid("sponsorship", SPONSORSHIP),
      targetType: "sponsorship",
    });
    expect(await entry("log4")).toMatchObject({
      // The merged duplicate acted: the oldest account.
      actorId: ref("dup1"),
      data: {
        legacy: {
          action: "reject_sponsorship",
          metadata: { reason: "Fixture reden: logo onleesbaar" },
          targetId: SPONSORSHIP,
          targetType: "sponsorship",
        },
      },
    });
    expect(await entry("log5")).toMatchObject({
      targetId: ref("dup1"),
      targetType: "user",
    });
    // Another type: system, no target.
    expect(await entry("log6")).toMatchObject({
      data: { legacy: { targetId: lst("lst1"), targetType: "list" } },
      targetId: null,
      targetType: "system",
    });
    // Several ids in one target: no single target.
    expect(await entry("log7")).toMatchObject({
      targetId: null,
      targetType: "gesture",
    });
    // An actor the export does not know.
    expect(await entry("log8")).toMatchObject({ actorId: null });
    expect(await entry("old1")).toBeUndefined();
    const counts = result.sections[0]?.counts ?? {};
    expect(counts.auditLogs).toBe(8);
    expect(counts.auditLogsDroppedTooOld).toBe(1);
    expect(counts.auditLogsSystemTarget).toBe(1);
    expect(counts.auditLogsUnmappedTarget).toBe(1);
    expect(counts.auditLogsUnmappedActor).toBe(1);
  });

  test("drops admin logs older than 3 years before --now", () => {
    expect(
      auditCutoff(new Date("2026-10-04T12:00:00.000Z")).toISOString()
    ).toBe("2023-10-04T12:00:00.000Z");
  });

  test("scrubs the free text in admin log metadata on staging", async () => {
    const result = await accountTransform(
      await fixtureContext({ target: "staging" })
    );
    const text = result.statements.join("\n");
    expect(text).not.toContain("Fixture reden");
    expect(text).toContain('"reason":"[staging]"');
    const production = await accountTransform(await fixtureContext());
    expect(result.statements).toHaveLength(production.statements.length);
  });

  test("names every conflict target and returns its reset keys", async () => {
    const result = await accountTransform(await fixtureContext());
    expect(result.group).toBe("40-account");
    expect(conflictProblems(result.statements)).toEqual([]);
    expect(result.resetKeys.rows?.consent_event).toEqual(
      result.rows.consentEvent.map((row) => row.id)
    );
    expect(result.resetKeys.rows?.audit_log).toEqual(
      result.rows.auditLog.map((row) => row.id)
    );
  });
});
