import { env } from "cloudflare:workers";
import { gesture, user } from "@smog/db";
import { hashSponsorshipToken } from "@smog/sponsorships/schema";
import { beforeEach, describe, expect, it } from "vitest";
import { insertRow, resetStatements } from "../../src/core/emit";
import { validateExport } from "../../src/core/export-schema";
import { legacyUuid } from "../../src/core/ids";
import { parseMuxMap, parseOverlayOverrides } from "../../src/core/inputs";
import type { Target } from "../../src/core/target";
import { transformSponsorships } from "../../src/core/transform/sponsorships";
import gesturesText from "../fixtures/export/gestures/documents.jsonl?raw";
import sponsorshipsText from "../fixtures/export/sponsorships/documents.jsonl?raw";
import usersText from "../fixtures/export/users/documents.jsonl?raw";
import muxMapText from "../fixtures/mux-map.json?raw";
import overridesText from "../fixtures/overlay-overrides.json?raw";
import sponsorshipGesturesText from "../fixtures/sponsorship-gestures.jsonl?raw";

/*
 * Task 8's smoke on a D1 with every migration: the sponsorship transform's
 * statements for the fixture (with its overrides and Mux map) all apply —
 * every CHECK, NOT NULL, foreign key and the one-blocking-sponsorship
 * index hold — applying them twice changes no count, and the reset
 * deletes every row in RESTRICT order. The parents (the admin and the
 * gestures) are seeded here with their legacy ids; task 10 runs the whole
 * plan.
 */

const UNIQUE_FAILED = /UNIQUE constraint failed/;
const NOW = new Date("2026-10-04T12:00:00.000Z");
const T0 = new Date("2025-01-01T00:00:00.000Z");
const TABLES = [
  "sponsor",
  "invoice_request",
  "payment",
  "payment_item",
  "sponsorship",
  "sponsorship_event",
  "sponsorship_token",
] as const;

async function run(statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    // biome-ignore lint/performance/noAwaitInLoops: in order, as `--file` runs them.
    await env.DB.prepare(statement).run();
  }
}

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of TABLES) {
    // biome-ignore lint/performance/noAwaitInLoops: a handful of counts.
    const row = await env.DB.prepare(
      `SELECT count(*) AS n FROM "${table}"`
    ).first<{ n: number }>();
    out[table] = row?.n ?? -1;
  }
  return out;
}

async function transform(target: Target) {
  const validated = validateExport({
    gestures: `${gesturesText}${sponsorshipGesturesText}`,
    sponsorships: sponsorshipsText,
    users: usersText,
  });
  const result = await transformSponsorships({
    data: validated.data,
    inputs: {
      muxMap: parseMuxMap(muxMapText),
      overrides: parseOverlayOverrides(overridesText),
      workosUsers: null,
    },
    now: NOW,
    target,
  });
  return { result, validated };
}

async function seedParents(): Promise<void> {
  const { validated } = await transform("production");
  const statements = [
    ...(await Promise.all(
      validated.data.users.map(async (row) =>
        insertRow(
          user,
          {
            createdAt: T0,
            email: `${row._id}@example.test`,
            emailVerified: true,
            id: await legacyUuid("user", row._id),
            legacyId: row._id,
            name: "",
            role: row.role ?? "user",
            updatedAt: T0,
            welcomedAt: T0,
          },
          [[user.legacyId], [user.email]]
        )
      )
    )),
    ...(await Promise.all(
      validated.data.gestures.map(async (row) =>
        insertRow(
          gesture,
          {
            createdAt: T0,
            id: await legacyUuid("gesture", row._id),
            legacyId: row._id,
            name: row.name,
            playbackId: row.playbackId,
            slug: row._id,
            sortName: row.name.toLowerCase(),
            updatedAt: T0,
          },
          [[gesture.legacyId]]
        )
      )
    )),
  ];
  await run(statements);
}

describe("the sponsorship transform's SQL on D1", () => {
  beforeEach(async () => {
    await run(
      [
        "payment_item",
        "sponsorship_token",
        "sponsorship_event",
        "payment",
        "sponsorship",
        "invoice_request",
        "sponsor",
        "gesture",
        "user",
      ].map((table) => `DELETE FROM "${table}";`)
    );
    await seedParents();
  });

  it("applies, re-applies with no change, and resets", async () => {
    const { result } = await transform("production");
    expect(
      result.sections.flatMap((part) =>
        part.issues.filter((issue) => issue.severity === "blocker")
      )
    ).toEqual([]);
    await run(result.statements);
    const first = await counts();
    expect(first).toEqual({
      invoice_request: 3,
      payment: 10,
      payment_item: 11,
      sponsor: 11,
      sponsorship: 12,
      sponsorship_event: 12,
      sponsorship_token: 1,
    });
    await run(result.statements);
    expect(await counts()).toEqual(first);

    // Children found their parents by legacy id.
    const live = await env.DB.prepare(
      `SELECT s.status, s.display_name, s.video_asset_id, g.legacy_id AS gesture
         FROM sponsorship s JOIN gesture g ON g.id = s.gesture_id
        WHERE s.legacy_id = 'ks7spn000000000000000000000spn1'`
    ).first();
    expect(live).toEqual({
      display_name: "Bakkerij Overschreven",
      gesture: "kg7ges000000000000000000000mam1",
      status: "live",
      video_asset_id: "asset-fixture-sponsored-0001",
    });
    const actor = await env.DB.prepare(
      `SELECT u.legacy_id FROM sponsorship_event e JOIN "user" u ON u.id = e.actor_id
        WHERE e.sponsorship_id = (SELECT id FROM sponsorship WHERE legacy_id = 'ks7spn000000000000000000000sp10')`
    ).first();
    expect(actor).toEqual({ legacy_id: "jd7usr000000000000000000000ada1" });
    // The old raw re-edit token finds its row by hash.
    const token = await env.DB.prepare(
      `SELECT s.legacy_id, s.status FROM sponsorship_token t JOIN sponsorship s ON s.id = t.sponsorship_id
        WHERE t.token_hash = ?`
    )
      .bind(await hashSponsorshipToken("5b0e7c1a-3f2d-4c8e-9a6b-1d2e3f4a5b6c"))
      .first();
    expect(token).toEqual({
      legacy_id: "ks7spn000000000000000000000sp07",
      status: "changes_requested",
    });
    // An invoice request without a VAT number is stored as "".
    const vat = await env.DB.prepare(
      "SELECT count(*) AS n FROM invoice_request WHERE vat_number = ''"
    ).first<{ n: number }>();
    expect(vat?.n).toBe(1);

    await run(resetStatements(result.resetKeys));
    expect(Object.values(await counts())).toEqual(TABLES.map(() => 0));
  });

  it("applies the staging plan with the same counts and no tokens", async () => {
    const { result } = await transform("staging");
    await run(result.statements);
    expect(await counts()).toEqual({
      invoice_request: 3,
      payment: 10,
      payment_item: 11,
      sponsor: 11,
      sponsorship: 12,
      sponsorship_event: 12,
      sponsorship_token: 0,
    });
    const emails = await env.DB.prepare(
      "SELECT count(*) AS n FROM sponsor WHERE email NOT LIKE '%@staging.invalid'"
    ).first<{ n: number }>();
    expect(emails?.n).toBe(0);
  });

  it("a second blocking sponsorship on a gesture fails on the index", async () => {
    const { result } = await transform("production");
    await run(result.statements);
    await expect(
      env.DB.prepare(
        `INSERT INTO sponsorship (id, sponsor_id, gesture_id, display_name, status, created_at, updated_at)
         SELECT 'x', sponsor_id, gesture_id, 'X', 'in_review', 0, 0 FROM sponsorship
          WHERE legacy_id = 'ks7spn000000000000000000000sp04'`
      ).run()
    ).rejects.toThrow(UNIQUE_FAILED);
  });
});
