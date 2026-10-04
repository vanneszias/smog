import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { hashSponsorshipToken } from "@smog/sponsorships/schema";
import { sha256Hex } from "@smog/utils";
import { legacyIdRef } from "../src/core/emit";
import { type ExportFiles, validateExport } from "../src/core/export-schema";
import { legacyKey, legacyUuid } from "../src/core/ids";
import {
  InputError,
  type MuxMap,
  type OverlayOverrides,
  parseMuxMap,
  parseOverlayOverrides,
} from "../src/core/inputs";
import { plan, type TransformContext } from "../src/core/plan";
import type { ReportIssue } from "../src/core/report";
import type { Target } from "../src/core/target";
import {
  checkoutPaymentStatus,
  mapSponsorshipStatus,
  transformSponsorships,
} from "../src/core/transform/sponsorships";
import { FIXTURE_INPUTS, FIXTURE_SECRETS, fixtureExport } from "./helpers";
import {
  FIXTURE_LOGO_DATA_URL,
  SPONSORSHIP_ADMIN_LOGS,
  SPONSORSHIP_BLOCKERS,
  SPONSORSHIP_GESTURES,
} from "./sponsorship-fixtures";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const HOUR = 3_600_000;
const INSERT_LINE =
  /^INSERT INTO "(\w+)" \(.+\) VALUES \(.+\) ON CONFLICT \("[\w", ]+"\) DO NOTHING;$/;
const SPONSOR_N = /^Sponsor \d+$/;
const UPDATE_WORD = /\bUPDATE\b/;
const ADA = "jd7usr000000000000000000000ada1";
const id = (n: string) =>
  n === "01"
    ? "ks7spn000000000000000000000spn1"
    : `ks7spn000000000000000000000sp${n}`;

const muxMap: MuxMap = parseMuxMap(readFileSync(FIXTURE_INPUTS.muxMap, "utf8"));
const overrides: OverlayOverrides = parseOverlayOverrides(
  readFileSync(FIXTURE_INPUTS.overrides, "utf8")
);

/** The fixture export, with the gestures and the admin log the sponsorships need (and the blocker rows when asked). */
async function files(withBlockers = false): Promise<ExportFiles> {
  const base = await fixtureExport();
  return {
    ...base,
    adminLogs: [
      base.adminLogs,
      readFileSync(SPONSORSHIP_ADMIN_LOGS, "utf8"),
    ].join(""),
    gestures: [base.gestures, readFileSync(SPONSORSHIP_GESTURES, "utf8")].join(
      ""
    ),
    sponsorships: [
      base.sponsorships,
      withBlockers ? readFileSync(SPONSORSHIP_BLOCKERS, "utf8") : "",
    ].join(""),
  };
}

async function context(
  options: {
    blockers?: boolean;
    mux?: MuxMap | null;
    overrides?: OverlayOverrides | null;
    target?: Target;
  } = {}
): Promise<TransformContext> {
  const validated = validateExport(await files(options.blockers));
  return {
    data: validated.data,
    inputs: {
      muxMap: options.mux === undefined ? muxMap : options.mux,
      overrides:
        options.overrides === undefined ? overrides : options.overrides,
      workosUsers: null,
    },
    now: NOW,
    target: options.target ?? "production",
  };
}

function issuesOf(result: Awaited<ReturnType<typeof transformSponsorships>>) {
  return result.sections.flatMap((part) => part.issues);
}

function issue(
  result: Awaited<ReturnType<typeof transformSponsorships>>,
  code: string
): ReportIssue | undefined {
  return issuesOf(result).find((entry) => entry.code === code);
}

function sponsorshipOf(
  result: Awaited<ReturnType<typeof transformSponsorships>>,
  n: string
) {
  const row = result.rows.sponsorships.find(
    (entry) => entry.legacyId === id(n)
  );
  if (!row) {
    throw new Error(`no sponsorship ${n}`);
  }
  return row;
}

describe("mapSponsorshipStatus (ruling 10's table)", () => {
  const row = {
    previewVideoPlaybackId: undefined,
    renewalReminderSentAt: undefined,
    sponsoredVideoPlaybackId: "sponsored",
    updatedAt: NOW.getTime(),
  };

  test.each([
    ["pending", "cancelled", null],
    ["pending_payment", "awaiting_payment", "open"],
    ["pending_approval", "in_review", "paid"],
    ["pending_resubmission", "changes_requested", "paid"],
    ["active", "live", "paid"],
    ["expired", "expired", "paid"],
    ["rejected", "rejected", "paid"],
    ["cancelled", "cancelled", "canceled"],
  ] as const)("%s → %s, payment %s", (old, status, paymentStatus) => {
    const mapped = mapSponsorshipStatus({ ...row, status: old }, NOW, true);
    expect(mapped.status).toBe(status);
    expect(mapped.payment).toBe(paymentStatus);
  });

  test("active with a reminder is expiring", () => {
    expect(
      mapSponsorshipStatus(
        { ...row, renewalReminderSentAt: NOW.getTime(), status: "active" },
        NOW,
        true
      ).status
    ).toBe("expiring");
  });

  test("pending_payment with a Mollie id stays awaiting_payment / open at any age (I4)", () => {
    const old = mapSponsorshipStatus(
      { ...row, status: "pending_payment", updatedAt: 0 },
      NOW,
      true
    );
    expect(old).toMatchObject({
      payment: "open",
      stale: false,
      status: "awaiting_payment",
    });
  });

  test("pending_payment without a Mollie id is cancelled only when updatedAt is more than 24 hours before --now (I1)", () => {
    const at = (offset: number) =>
      mapSponsorshipStatus(
        {
          ...row,
          status: "pending_payment",
          updatedAt: NOW.getTime() - offset,
        },
        NOW,
        false
      );
    expect(at(24 * HOUR)).toMatchObject({
      payment: "open",
      status: "awaiting_payment",
    });
    expect(at(24 * HOUR + 1)).toMatchObject({
      payment: null,
      stale: true,
      status: "cancelled",
    });
  });

  test("pending_approval takes the sponsored video, else the preview, else render_failed", () => {
    const approval = { ...row, status: "pending_approval" as const };
    expect(mapSponsorshipStatus(approval, NOW, true).videoPlaybackId).toBe(
      "sponsored"
    );
    expect(
      mapSponsorshipStatus(
        {
          ...approval,
          previewVideoPlaybackId: "preview",
          sponsoredVideoPlaybackId: undefined,
        },
        NOW,
        true
      )
    ).toMatchObject({ status: "in_review", videoPlaybackId: "preview" });
    expect(
      mapSponsorshipStatus(
        { ...approval, sponsoredVideoPlaybackId: undefined },
        NOW,
        true
      )
    ).toMatchObject({ status: "render_failed", videoPlaybackId: null });
  });

  test("a checkout's payment is paid if any row was, else open, else canceled", () => {
    expect(checkoutPaymentStatus(["canceled", "paid", "open"])).toBe("paid");
    expect(checkoutPaymentStatus(["canceled", "open"])).toBe("open");
    expect(checkoutPaymentStatus(["canceled"])).toBe("canceled");
    expect(checkoutPaymentStatus([])).toBeNull();
  });
});

describe("transformSponsorships on the fixture", () => {
  test("maps every old status row", async () => {
    const result = await transformSponsorships(await context());
    const statuses = Object.fromEntries(
      result.rows.sponsorships.map((row) => [row.legacyId, row.status])
    );
    expect(statuses).toEqual({
      [id("01")]: "live",
      [id("02")]: "awaiting_payment",
      [id("03")]: "awaiting_payment",
      [id("04")]: "in_review",
      [id("05")]: "in_review",
      [id("06")]: "render_failed",
      [id("07")]: "changes_requested",
      [id("08")]: "expiring",
      [id("09")]: "expired",
      [id("10")]: "rejected",
      [id("11")]: "cancelled",
      [id("12")]: "cancelled",
      [id("13")]: "awaiting_payment",
      [id("14")]: "cancelled",
      [id("15")]: "in_review",
    });
    expect(result.sections[0]?.counts).toMatchObject({
      sponsorships: 15,
      stalePendingPayments: 1,
      "status.awaiting_payment": 3,
      "status.cancelled": 3,
      "status.in_review": 3,
    });
    expect(
      issuesOf(result).filter((entry) => entry.severity === "blocker")
    ).toEqual([]);
  });

  test("groups rows into checkouts by Mollie id: one sponsor, one payment, an item per row", async () => {
    const result = await transformSponsorships(await context());
    // 15 rows, sp04 and sp05 share tr_fixture0004.
    expect(result.rows.sponsors).toHaveLength(14);
    const sponsor04 = sponsorshipOf(result, "04").sponsorId;
    expect(sponsorshipOf(result, "05").sponsorId).toBe(sponsor04);
    const paymentId = await legacyUuid(
      "payment",
      legacyKey("mollie", "tr_fixture0004")
    );
    const multi = result.rows.payments.find((row) => row.id === paymentId);
    expect(multi).toMatchObject({
      amountCents: 10_000,
      currency: "EUR",
      kind: "initial",
      mollieId: "tr_fixture0004",
      status: "paid",
    });
    expect(
      result.rows.paymentItems.filter((row) => row.paymentId === paymentId)
    ).toHaveLength(2);
    // sp12 (pending) and sp14 (stale, no Mollie id) get no payment; sp13
    // and sp15 get one without a Mollie id.
    expect(result.rows.payments).toHaveLength(12);
    expect(result.rows.paymentItems).toHaveLength(13);
    const sponsor12 = sponsorshipOf(result, "12").sponsorId;
    expect(sponsor12).toBe(await legacyUuid("sponsor", id("12")));
    expect(
      result.rows.sponsors.find((row) => row.id === sponsor12)
    ).toMatchObject({
      company: null,
      email: "lien.fixture@example.test",
      locale: "nl",
      name: "Lien Fixture",
    });
  });

  test("payment states, paid_at and the dates", async () => {
    const result = await transformSponsorships(await context());
    const paymentOf = async (mollie: string) => {
      const paymentId = await legacyUuid(
        "payment",
        legacyKey("mollie", mollie)
      );
      return result.rows.payments.find(
        (row) => row.id === paymentId && row.mollieId === mollie
      );
    };
    expect(await paymentOf("tr_fixture0002")).toMatchObject({
      paidAt: null,
      status: "open",
    });
    // I4: an old pending_payment with a Mollie id stays open, whatever its
    // age, for the first stale sweep to check with Mollie.
    expect(await paymentOf("tr_fixture0003")).toMatchObject({
      paidAt: null,
      status: "open",
    });
    expect(await paymentOf("tr_fixture0011")).toMatchObject({
      status: "canceled",
    });
    expect(await paymentOf("tr_fixture0001")).toMatchObject({
      paidAt: new Date(1_736_000_000_000),
      status: "paid",
    });
    const live = sponsorshipOf(result, "01");
    expect(live.startsAt).toEqual(new Date(1_736_100_000_000));
    expect(live.endsAt).toEqual(new Date(1_767_536_000_000));
    const expiring = sponsorshipOf(result, "08");
    expect(expiring.reminderSentAt).toEqual(new Date("2026-09-21T10:00:00Z"));
    for (const n of ["02", "03", "04", "06", "07", "10", "13", "15"]) {
      const row = sponsorshipOf(result, n);
      expect(row.startsAt).toBeNull();
      expect(row.endsAt).toBeNull();
    }
    expect(sponsorshipOf(result, "09").endsAt).toEqual(
      new Date("2025-06-01T10:00:00Z")
    );
  });

  test("videos, the Mux map and logos", async () => {
    const result = await transformSponsorships(await context());
    expect(sponsorshipOf(result, "01")).toMatchObject({
      logoKey: null,
      videoAssetId: "asset-fixture-sponsored-0001",
      videoPlaybackId: "fixtureSponsoredPlayback0001",
    });
    expect(sponsorshipOf(result, "04").videoPlaybackId).toBe(
      "fixtureSponsoredPlayback0004"
    );
    expect(sponsorshipOf(result, "05").videoPlaybackId).toBe(
      "fixturePreviewPlayback0005"
    );
    expect(sponsorshipOf(result, "06")).toMatchObject({
      videoAssetId: null,
      videoPlaybackId: null,
    });
    expect(issue(result, "missingMuxAsset")?.ids).toContain(id("04"));
    expect(issue(result, "missingMuxAsset")?.ids).not.toContain(id("01"));
    // hasLogo, else the 6000 amount.
    const items = new Map(
      result.rows.paymentItems.map((row) => [row.sponsorshipId, row])
    );
    const item = (n: string) => items.get(sponsorshipOf(result, n).id);
    expect(item("02")).toMatchObject({
      amountCents: 6000,
      includesLogo: true,
    });
    expect(item("09")).toMatchObject({
      amountCents: 7000,
      includesLogo: false,
    });
    expect(item("01")).toMatchObject({ includesLogo: false });
    expect(issue(result, "unexpectedAmount")?.ids).toEqual([id("09")]);
    expect(issue(result, "logoNotStored")?.ids).toEqual([id("06"), id("15")]);
    expect(issue(result, "reviewWithoutVideo")?.ids).toEqual([id("06")]);
    expect(result.sections[0]?.counts.overlayImagesDropped).toBe(2);
  });

  test("I1: a recent pending_payment without a Mollie id is awaiting an open payment with no Mollie id; an old one is cancelled", async () => {
    const result = await transformSponsorships(await context());
    const thirteen = sponsorshipOf(result, "13");
    const paymentId = await legacyUuid("payment", id("13"));
    expect(
      result.rows.payments.find((row) => row.id === paymentId)
    ).toMatchObject({
      amountCents: 5000,
      mollieId: null,
      paidAt: null,
      status: "open",
    });
    expect(
      result.rows.paymentItems.find((row) => row.sponsorshipId === thirteen.id)
    ).toMatchObject({ amountCents: 5000, paymentId });
    const fourteen = sponsorshipOf(result, "14");
    expect(fourteen.status).toBe("cancelled");
    expect(
      result.rows.paymentItems.some((row) => row.sponsorshipId === fourteen.id)
    ).toBe(false);
    expect(result.rows.payments.map((row) => row.id)).not.toContain(
      await legacyUuid("payment", id("14"))
    );
  });

  test("M1, M3: a row marked paid by hand keeps a paid payment, its logo item and a marked_paid_manually event", async () => {
    const result = await transformSponsorships(await context());
    const fifteen = sponsorshipOf(result, "15");
    const paymentId = await legacyUuid("payment", id("15"));
    expect(
      result.rows.payments.find((row) => row.id === paymentId)
    ).toMatchObject({
      amountCents: 6000,
      mollieId: null,
      paidAt: new Date("2026-09-25T10:00:00Z"),
      status: "paid",
    });
    expect(
      result.rows.paymentItems.find((row) => row.sponsorshipId === fifteen.id)
    ).toEqual({
      amountCents: 6000,
      includesLogo: true,
      paymentId,
      sponsorshipId: fifteen.id,
    });
    expect(
      result.rows.events.find((row) => row.type === "marked_paid_manually")
    ).toEqual({
      actorId: legacyIdRef("user", ADA),
      createdAt: new Date("2026-09-26T10:00:00Z"),
      data: { paymentId },
      id: await legacyUuid(
        "sponsorship_event",
        legacyKey(id("15"), "marked_paid_manually")
      ),
      sponsorshipId: fifteen.id,
      type: "marked_paid_manually",
    });
    expect(result.sections[0]?.counts.markedPaidManually).toBe(1);
    expect(issue(result, "paymentWithoutMollieId")?.ids).toEqual([
      id("15"),
      id("13"),
    ]);
  });

  test("I2: the logo data URL is never copied, only a marker", async () => {
    for (const target of ["production", "staging"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: two targets.
      const result = await transformSponsorships(await context({ target }));
      expect(result.statements.join("\n")).not.toContain("data:image");
      expect(JSON.stringify(result.rows)).not.toContain(FIXTURE_LOGO_DATA_URL);
      const six = sponsorshipOf(result, "06");
      const event = result.rows.events.find(
        (row) => row.sponsorshipId === six.id && row.type === "legacy"
      );
      expect(
        (event?.data as { legacy: { overlayImage: unknown } } | undefined)
          ?.legacy.overlayImage
      ).toEqual({
        bytes: 68,
        kind: "dataUrl",
        sha256: await sha256Hex(FIXTURE_LOGO_DATA_URL),
      });
    }
  });

  test("I2: a large logo does not grow the statement", async () => {
    const base = await context();
    const big = `data:image/png;base64,${"A".repeat(400_000)}`;
    const result = await transformSponsorships({
      ...base,
      data: {
        ...base.data,
        sponsorships: base.data.sponsorships.map((row) =>
          row._id === id("06") ? { ...row, overlayImageStorageId: big } : row
        ),
      },
    });
    const longest = Math.max(...result.statements.map((line) => line.length));
    expect(longest).toBeLessThan(4000);
  });

  test("without a Mux map every video warns and has no asset id", async () => {
    const result = await transformSponsorships(await context({ mux: null }));
    expect(sponsorshipOf(result, "01").videoAssetId).toBeNull();
    expect(issue(result, "missingMuxAsset")?.message).toContain("--mux-map");
  });

  test("invoice requests: all fields, the fallbacks, and the VAT warnings (B3)", async () => {
    const result = await transformSponsorships(await context());
    const bySponsor = new Map(
      result.rows.invoiceRequests.map((row) => [row.sponsorId, row])
    );
    const invoice = (n: string) =>
      bySponsor.get(sponsorshipOf(result, n).sponsorId);
    expect(result.rows.invoiceRequests).toHaveLength(3);
    expect(invoice("01")).toEqual({
      email: "factuur.fixture@example.test",
      name: "Fixture Bakkerij BV",
      sponsorId: sponsorshipOf(result, "01").sponsorId,
      vatNumber: "BE0403170701",
    });
    // No invoice name or email: the company and the sponsor's email; the
    // VAT trimmed and kept although it fails mod-97.
    expect(invoice("04")).toMatchObject({
      email: "eva.fixture@example.test",
      name: "Fixture Garage",
      vatNumber: "BE0123456789",
    });
    // No name, company or VAT: the contact name, and "".
    expect(invoice("09")).toMatchObject({
      email: "ilse.fixture@example.test",
      name: "Ilse Fixture",
      vatNumber: "",
    });
    expect(issue(result, "invoiceVatMissing")).toMatchObject({
      ids: [id("09")],
      severity: "warning",
    });
    expect(issue(result, "invoiceVatInvalid")).toMatchObject({
      ids: [id("04")],
      severity: "warning",
    });
    for (const row of result.rows.invoiceRequests) {
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.email.length).toBeGreaterThan(2);
      expect(typeof row.vatNumber).toBe("string");
    }
  });

  test("display_name: the trimmed overlay, the override, and the offender list", async () => {
    const result = await transformSponsorships(await context());
    expect(sponsorshipOf(result, "02").displayName).toBe("Cas Fixturebedrijf");
    expect(sponsorshipOf(result, "08").displayName).toBe(
      "Slagerij Fixturelaan"
    );
    expect(sponsorshipOf(result, "01").displayName).toBe(
      "Bakkerij Overschreven"
    );
    expect(result.sections[0]?.counts.overlayOverrides).toBe(2);
    expect(issue(result, "overlayOffender")).toBeUndefined();

    const without = await transformSponsorships(
      await context({ overrides: null })
    );
    expect(sponsorshipOf(without, "01").displayName).toBe("Bakkerij Fixture");
    expect(issue(without, "overlayOffender")).toEqual({
      code: "overlayOffender",
      count: 1,
      details: [
        {
          legacyId: id("08"),
          length: 36,
          overlayText: "Slagerij Fixturelaan & Kinderen BVBA",
          reason: "tooLong",
          sponsorName: "Hanne Fixture",
          status: "active",
        },
      ],
      ids: [id("08")],
      message: expect.stringContaining("overlay-overrides.json"),
      personal: true,
      severity: "blocker",
    });
  });

  test("an override for an unknown sponsorship warns; one over 35 characters is refused", async () => {
    const result = await transformSponsorships(
      await context({
        overrides: new Map([
          ...overrides,
          ["ks7spn0000000000000000000gone", "Weg"],
        ]),
      })
    );
    expect(issue(result, "unknownOverride")?.ids).toEqual([
      "ks7spn0000000000000000000gone",
    ]);
    expect(() =>
      parseOverlayOverrides(JSON.stringify({ [id("08")]: "x".repeat(36) }))
    ).toThrow(InputError);
    await expect(
      plan({
        export: await files(),
        now: NOW,
        overrides: JSON.stringify({ [id("08")]: "x".repeat(36) }),
        target: "production",
        transforms: [transformSponsorships],
      })
    ).rejects.toThrow(InputError);
  });

  test("the legacy event holds the old row's facts (M4), with reviewedAt as epoch ms", async () => {
    const result = await transformSponsorships(await context());
    const rejected = sponsorshipOf(result, "10");
    const event = result.rows.events.find(
      (row) => row.sponsorshipId === rejected.id
    );
    expect(event).toEqual({
      actorId: legacyIdRef("user", ADA),
      createdAt: new Date("2026-08-10T10:00:00Z"),
      data: {
        legacy: {
          durationYears: 1,
          hasLogo: null,
          originalVideoPlaybackId: "fixtureOriginalPlayback0001",
          overlayImage: null,
          overlayText: "Jef Fixturebureau",
          previewVideoPlaybackId: "fixturePreviewPlayback0010",
          rejectionReason: "Fixture reden: logo onleesbaar",
          reviewedAt: Date.parse("2026-08-10T10:00:00Z"),
          sponsorName: "Jef Fixture",
          status: "rejected",
        },
      },
      id: await legacyUuid("sponsorship_event", legacyKey(id("10"), "legacy")),
      sponsorshipId: rejected.id,
      type: "legacy",
    });
    // The untruncated overlay, and no actor without a reviewer.
    const eight = sponsorshipOf(result, "08");
    const eightEvent = result.rows.events.find(
      (row) => row.sponsorshipId === eight.id
    );
    expect(
      (eightEvent?.data as { legacy: { overlayText: string } } | undefined)
        ?.legacy.overlayText
    ).toBe("Slagerij Fixturelaan & Kinderen BVBA");
    const two = sponsorshipOf(result, "02");
    expect(
      result.rows.events.find((row) => row.sponsorshipId === two.id)?.actorId
    ).toBeNull();
    // 15 legacy events and sp15's marked_paid_manually.
    expect(result.rows.events).toHaveLength(16);
  });

  test("an unexpired re-edit token is hashed with its expiry; expired ones are counted", async () => {
    const result = await transformSponsorships(await context());
    const seven = sponsorshipOf(result, "07");
    expect(result.rows.tokens).toEqual([
      {
        createdAt: new Date("2026-10-01T10:00:00Z"),
        expiresAt: new Date("2026-10-08T10:00:00Z"),
        id: await legacyUuid(
          "sponsorship_token",
          legacyKey(id("07"), "reedit")
        ),
        purpose: "reedit",
        sponsorshipId: seven.id,
        tokenHash: await hashSponsorshipToken(
          "5b0e7c1a-3f2d-4c8e-9a6b-1d2e3f4a5b6c"
        ),
        usedAt: null,
      },
    ]);
    expect(result.sections[0]?.counts).toMatchObject({
      reeditTokens: 1,
      reeditTokensExpired: 2,
    });
    const sql = result.statements.join("\n");
    expect(sql).not.toContain("5b0e7c1a-3f2d-4c8e-9a6b-1d2e3f4a5b6c");
  });

  test("every insert names its conflict target, and the statements are in foreign-key order", async () => {
    const result = await transformSponsorships(await context());
    const tables = result.statements.map((statement) => {
      expect(statement).toMatch(INSERT_LINE);
      // `INSERT INTO "<table>" …`: the first quoted name.
      return statement.split('"')[1];
    });
    const order = [
      "sponsor",
      "invoice_request",
      "payment",
      "sponsorship",
      "payment_item",
      "sponsorship_event",
      "sponsorship_token",
    ];
    expect([...new Set(tables)]).toEqual(order);
    expect(
      result.statements
        .filter((s) => s.startsWith('INSERT INTO "sponsorship" '))
        .every((s) => s.endsWith('ON CONFLICT ("legacy_id") DO NOTHING;'))
    ).toBe(true);
    expect(result.statements.join("\n")).not.toMatch(UPDATE_WORD);
    expect(result.group).toBe("50-sponsorships");
  });

  test("the reset keys list every row it writes", async () => {
    const result = await transformSponsorships(await context());
    expect(result.resetKeys.rows?.sponsorship).toHaveLength(15);
    expect(result.resetKeys.rows?.sponsor).toHaveLength(14);
    expect(result.resetKeys.rows?.invoice_request).toHaveLength(3);
    expect(result.resetKeys.rows?.payment).toHaveLength(12);
    expect(result.resetKeys.rows?.payment_item).toHaveLength(13);
    expect(result.resetKeys.rows?.sponsorship_event).toHaveLength(16);
    expect(result.resetKeys.rows?.sponsorship_token).toEqual([
      await legacyUuid("sponsorship_token", legacyKey(id("07"), "reedit")),
    ]);
    expect(result.resetKeys.users).toBeUndefined();
  });

  test("is deterministic", async () => {
    const a = await transformSponsorships(await context());
    const b = await transformSponsorships(await context());
    expect(b.statements).toEqual(a.statements);
    expect(b.sections).toEqual(a.sections);
  });
});

describe("the blockers", () => {
  test("two blocking sponsorships on one gesture, and a missing gesture", async () => {
    const result = await transformSponsorships(
      await context({ blockers: true })
    );
    expect(issue(result, "blockingConflict")).toMatchObject({
      ids: [id("04"), "ks7spn000000000000000000000bk01"],
      severity: "blocker",
    });
    expect(issue(result, "missingGesture")).toMatchObject({
      ids: ["ks7spn000000000000000000000bk02"],
      severity: "blocker",
    });
    // The missing gesture's row is left out of the SQL.
    expect(
      result.rows.sponsorships.some(
        (row) => row.legacyId === "ks7spn000000000000000000000bk02"
      )
    ).toBe(false);
    expect(result.statements.join("\n")).not.toContain("tr_fixtureblock02");
  });

  test("I3: a Mollie payment whose rows are partly paid and partly open is a blocker naming the Mollie id and the rows", async () => {
    const result = await transformSponsorships(
      await context({ blockers: true })
    );
    expect(issue(result, "checkoutMixedPayment")).toMatchObject({
      details: [
        {
          legacyId: "ks7spn000000000000000000000bk03",
          mollieId: "tr_fixtureblock03",
          payment: "paid",
          status: "in_review",
        },
        {
          legacyId: "ks7spn000000000000000000000bk04",
          mollieId: "tr_fixtureblock03",
          payment: "open",
          status: "awaiting_payment",
        },
      ],
      ids: [
        "ks7spn000000000000000000000bk03",
        "ks7spn000000000000000000000bk04",
      ],
      severity: "blocker",
    });
  });

  test("a plan over the blockers reports them and counts them", async () => {
    const output = await plan({
      export: await files(true),
      now: NOW,
      overrides: readFileSync(FIXTURE_INPUTS.overrides, "utf8"),
      target: "production",
      transforms: [transformSponsorships],
    });
    expect(output.report.blockers).toBe(3);
    expect(output.manifest?.report.blockers).toBe(3);
  });

  test("an overlay offender blocks the plan without overrides", async () => {
    const output = await plan({
      export: await files(),
      now: NOW,
      target: "production",
      transforms: [transformSponsorships],
    });
    expect(output.report.blockers).toBe(1);
    expect(output.files.get("report.md")).toContain("overlayOffender");
  });
});

describe("the staging target", () => {
  test("holds no address, name, VAT, token or asset id, and keeps every count", async () => {
    const staging = await transformSponsorships(
      await context({ target: "staging" })
    );
    const production = await transformSponsorships(await context());
    const text = JSON.stringify({
      rows: staging.rows,
      sections: staging.sections,
      statements: staging.statements,
    });
    for (const secret of FIXTURE_SECRETS) {
      expect(text).not.toContain(secret);
    }
    expect(staging.rows.tokens).toEqual([]);
    expect(staging.resetKeys.rows?.sponsorship_token).toEqual([]);
    expect(staging.sections[0]?.counts).toEqual(production.sections[0]?.counts);
    for (const row of staging.rows.sponsors) {
      expect(row.email).toBe(`${row.id}@staging.invalid`);
      expect(row.company).toBeNull();
    }
    for (const row of staging.rows.invoiceRequests) {
      expect(row.vatNumber).toBe("");
      expect(row.name).toMatch(SPONSOR_N);
    }
    for (const row of staging.rows.sponsorships) {
      expect(row.displayName).toMatch(SPONSOR_N);
      expect(row.videoAssetId).toBeNull();
    }
  });

  test("the overlay offender list holds the pseudonymised name, not the text", async () => {
    const staging = await transformSponsorships(
      await context({ overrides: null, target: "staging" })
    );
    const offender = issue(staging, "overlayOffender");
    expect(offender?.severity).toBe("blocker");
    expect(offender?.personal).toBeUndefined();
    expect(offender?.details?.[0]).toMatchObject({
      length: 36,
      overlayText: expect.stringMatching(SPONSOR_N),
      sponsorName: "[staging]",
    });
  });

  test("a staging plan with every input holds no fixture secret in any file", async () => {
    const output = await plan({
      export: await files(),
      muxMap: readFileSync(FIXTURE_INPUTS.muxMap, "utf8"),
      now: NOW,
      overrides: readFileSync(FIXTURE_INPUTS.overrides, "utf8"),
      target: "staging",
      transforms: [transformSponsorships],
      workosUsers: readFileSync(FIXTURE_INPUTS.workosUsers, "utf8"),
    });
    const text = [...output.files.values()].join("\n");
    expect(text).toContain('INSERT INTO "sponsorship"');
    for (const secret of FIXTURE_SECRETS) {
      expect(text).not.toContain(secret);
    }
  });
});
