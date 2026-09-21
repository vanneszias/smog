import { SPONSORSHIP_STATUSES } from "@smog/config";
import { SPONSORSHIP_STATUSES as SPONSORSHIP_STATUSES_SUBPATH } from "@smog/config/sponsorships";
import { describe, expect, it } from "vitest";
import { isAdmin } from "@/access";
import { sponsorshipReEditAccess } from "@/access/sponsorships";
import { Sponsorships } from "./Sponsorships";

const field = (name: string) =>
  Sponsorships.fields.find((f) => "name" in f && f.name === name);

describe("Sponsorships collection", () => {
  it("keeps the exact seven statuses the payment flow depends on", () => {
    expect(SPONSORSHIP_STATUSES).toEqual([
      "pending_payment",
      "pending_approval",
      "pending_resubmission",
      "active",
      "expired",
      "rejected",
      "cancelled",
    ]);
  });

  it("publishes the same tuple from the package root and the subpath", () => {
    // The collection imports the subpath, because the Payload CLI's loader
    // cannot follow the barrel's relative re-exports (see Sponsorships.ts).
    // Stage 2's `@smog/ui-web` will import the root. This asserts the two
    // entry points are the same array, so `export * from "./sponsorships"`
    // in the barrel cannot quietly go missing.
    expect(SPONSORSHIP_STATUSES).toBe(SPONSORSHIP_STATUSES_SUBPATH);
  });

  it("exposes every status as a select option", () => {
    const status = field("status") as { options: { value: string }[] };

    expect(status.options.map((o) => o.value)).toEqual([
      ...SPONSORSHIP_STATUSES,
    ]);
  });

  it("indexes the Mollie payment id, because the webhook looks up by it", () => {
    expect(field("molliePaymentId")).toHaveProperty("index", true);
  });

  it("indexes endDate, because the expiry job scans by it", () => {
    expect(field("endDate")).toHaveProperty("index", true);
  });

  it("uses the sponsorships slug", () => {
    expect(Sponsorships.slug).toBe("sponsorships");
  });

  it("wires every write through isAdmin, not a raw boolean", () => {
    // Reference equality: a sponsorship row carries a sponsor's contact
    // details, invoice name and VAT number, so a stray `() => true` here is
    // a personal-data leak, not just an over-permissive read.
    expect(Sponsorships.access?.create).toBe(isAdmin);
    expect(Sponsorships.access?.update).toBe(isAdmin);
    expect(Sponsorships.access?.delete).toBe(isAdmin);
  });

  it("opens read to the re-edit token, and to nothing else", () => {
    // The one operation Stage 5 widened, and the assertion is still
    // reference equality rather than a shape: `sponsorshipReEditAccess`
    // denies a request that presents no token, and an inline rule written to
    // look like it would be one `!` away from handing over every row whose
    // token is NULL. `access/sponsorships.int.test.ts` proves the behaviour;
    // this proves the wiring, which a mutation to either alone would
    // otherwise slip past.
    expect(Sponsorships.access?.read).toBe(sponsorshipReEditAccess);
  });

  it("localizes nothing, so no required field becomes unsaveable in en or fr", () => {
    // Stage 1's hardest-won constraint: `required: true` plus
    // `localized: true` makes a document unsaveable in any locale that has
    // no translation yet. Nothing on a sponsorship is editorial content, so
    // the rule here is the stronger one — no localized fields at all.
    const localized = Sponsorships.fields.filter(
      (f) => (f as { localized?: boolean }).localized === true
    );
    expect(localized).toEqual([]);
  });

  it("requires exactly the fields the sponsor flow cannot function without", () => {
    const required = Sponsorships.fields
      .filter((f) => (f as { required?: boolean }).required === true)
      .map((f) => ("name" in f ? f.name : undefined));

    expect(required).toEqual([
      "gesture",
      "sponsorName",
      "sponsorEmail",
      "contactFullName",
      "overlayText",
      "originalVideoPlaybackId",
      "status",
      "startDate",
      "endDate",
      "durationYears",
      "paymentAmount",
    ]);
  });

  it("indexes the columns every lookup path filters on", () => {
    for (const name of [
      "gesture",
      "status",
      "endDate",
      "molliePaymentId",
      "reEditToken",
    ]) {
      expect(field(name)).toHaveProperty("index", true);
    }
  });

  it("makes the re-edit token unique, and the payment id only indexed", () => {
    // An index makes a duplicate fast to find; only `unique` makes it
    // impossible. `reEditToken` is a bearer credential, so a collision hands
    // one sponsor's token holder another sponsor's record — that one is a
    // correctness bug and stays unique.
    expect(field("reEditToken")).toHaveProperty("unique", true);

    /*
     * `molliePaymentId` is the opposite, and Stage 1 had it backwards. The
     * webhook resolves a payment through `metadata.sponsorshipIds`, not
     * through this column; one checkout covering three gestures writes three
     * rows carrying one payment id, which a unique index refuses — so the
     * constraint made the shipped bulk purchase impossible rather than safer.
     * `Sponsorships.int.test.ts` proves two rows may now share one id, and
     * `migrations/migrations.test.ts` proves a *deployed* database gets an
     * ordinary index.
     */
    expect(field("molliePaymentId")).not.toHaveProperty("unique", true);
  });

  it("leaves the remaining text columns non-unique", () => {
    // Guards the opposite mistake: `unique` on a field sponsors genuinely
    // share — two campaigns from one sponsor, or the same overlay text —
    // would reject legitimate rows.
    for (const name of [
      "sponsorName",
      "sponsorEmail",
      "overlayText",
      "originalVideoPlaybackId",
    ]) {
      expect(field(name)).not.toHaveProperty("unique", true);
    }
  });

  it("relates a sponsorship to one gesture", () => {
    expect(field("gesture")).toMatchObject({
      type: "relationship",
      relationTo: "gestures",
      required: true,
    });
  });

  it("stores the sponsor logo as a media upload, not a loose URL", () => {
    expect(field("overlayImage")).toMatchObject({
      type: "upload",
      relationTo: "media",
    });
  });

  it("records the reviewing admin as a users relationship", () => {
    expect(field("reviewedBy")).toMatchObject({
      type: "relationship",
      relationTo: "users",
    });
  });

  it("starts a new sponsorship at pending_payment, before any money has moved", () => {
    expect(field("status")).toHaveProperty("defaultValue", "pending_payment");
  });

  it("defaults the boolean flags to false and the term to one year", () => {
    expect(field("hasLogo")).toHaveProperty("defaultValue", false);
    expect(field("invoiceRequested")).toHaveProperty("defaultValue", false);
    expect(field("durationYears")).toHaveProperty("defaultValue", 1);
  });
});
