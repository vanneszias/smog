import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { sponsorshipsCsvFile } from "../src/client/use-admin-export";
import {
  SPONSORSHIP_ACTIONS,
  sponsorshipRefusalOf,
} from "../src/client/use-admin-sponsorships";

/* The pure parts of the sponsorship hooks (task 7 builds on them). */

describe("sponsorshipRefusalOf", () => {
  it("reads the reason of an INVALID_STATE refusal", () => {
    expect(
      sponsorshipRefusalOf(
        new ORPCError("INVALID_STATE", { data: { reason: "stale" } })
      )
    ).toBe("stale");
    expect(
      sponsorshipRefusalOf(
        new ORPCError("INVALID_STATE", { data: { reason: "tooMany" } })
      )
    ).toBe("tooMany");
  });

  it("is null for unknown reasons, other codes and non-errors", () => {
    expect(
      sponsorshipRefusalOf(
        new ORPCError("INVALID_STATE", { data: { reason: "nope" } })
      )
    ).toBeNull();
    expect(sponsorshipRefusalOf(new ORPCError("NOT_FOUND"))).toBeNull();
    expect(sponsorshipRefusalOf(new Error("network"))).toBeNull();
    expect(sponsorshipRefusalOf(null)).toBeNull();
  });
});

describe("SPONSORSHIP_ACTIONS", () => {
  it("lists every action mutation the hook returns", () => {
    expect([...SPONSORSHIP_ACTIONS].sort()).toEqual([
      "approve",
      "cancel",
      "forceExpire",
      "markPaid",
      "recordRefund",
      "regenerateToken",
      "reject",
      "requestChanges",
      "retryRender",
    ]);
  });
});

describe("sponsorshipsCsvFile", () => {
  it("is a UTF-8 CSV file with the server's name, byte for byte", async () => {
    const csv = '﻿"ID","Status"\r\n"s-1","live"\r\n';
    const file = sponsorshipsCsvFile({
      csv,
      filename: "sponsorships-2026-10-03.csv",
      rows: 1,
    });
    expect(file.name).toBe("sponsorships-2026-10-03.csv");
    expect(file.type).toBe("text/csv;charset=utf-8");
    const bytes = new Uint8Array(await file.arrayBuffer());
    // The BOM is kept: EF BB BF.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes).toEqual(new TextEncoder().encode(csv));
  });
});
