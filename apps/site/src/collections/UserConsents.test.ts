import { describe, expect, it } from "vitest";
import { denyAll, isAdmin } from "@/access";
import { UserConsents } from "./UserConsents";

const field = (name: string) =>
  UserConsents.fields.find((f) => "name" in f && f.name === name);

describe("UserConsents collection", () => {
  it("uses the kebab-case plural user-consents slug", () => {
    expect(UserConsents.slug).toBe("user-consents");
  });

  it("lets admins read recorded consents", () => {
    expect(UserConsents.access?.read).toBe(isAdmin);
  });

  it("denies every write through the API, admins included", () => {
    // A consent record is evidence of what a specific person agreed to at a
    // specific moment. It is only trustworthy if nothing reachable over the
    // API can create, amend or erase one; the server-side hook that writes
    // it goes through the local API, where `overrideAccess` defaults to
    // true. `AdminLogs.int.test.ts` proves both halves against a real
    // database.
    expect(UserConsents.access?.create).toBe(denyAll);
    expect(UserConsents.access?.update).toBe(denyAll);
    expect(UserConsents.access?.delete).toBe(denyAll);
  });

  it("requires the decision and the version it was given against", () => {
    const required = UserConsents.fields
      .filter((f) => (f as { required?: boolean }).required === true)
      .map((f) => ("name" in f ? f.name : undefined));

    // `user` is deliberately absent — see the next test.
    expect(required).toEqual(["analyticsConsent", "consentVersion"]);
  });

  it("indexes the user, because consents are looked up per person", () => {
    expect(field("user")).toMatchObject({
      type: "relationship",
      relationTo: "users",
      index: true,
    });
  });

  it("leaves the user optional, so the record outlives the account", () => {
    // `required` would emit `user_id integer NOT NULL` alongside the
    // `ON DELETE set null` Payload always writes for a relationship — a pair
    // SQLite cannot satisfy, so deleting a user who ever consented would die
    // with a raw `Failed query: delete from "users" ...`. Nullable is also
    // what the retention rule wants: the consent is evidence that must
    // survive the account it describes, anonymised rather than destroyed.
    // `UserConsents.int.test.ts` proves the delete actually succeeds and
    // leaves the row behind; this pins the config that makes it possible.
    expect(field("user")).not.toHaveProperty("required", true);
  });

  it("keeps analyticsConsent a checkbox, so a refusal is recordable", () => {
    // `required` on a Payload checkbox means "must be a boolean", not "must
    // be true" (`payload` 3.89.0, `fields/validations.js`'s `checkbox`), so
    // `false` — an explicit refusal, the legally interesting case — saves
    // fine. `UserConsents.int.test.ts` pins that behaviour against a real
    // database, because a stricter validator bolted on later would silently
    // make refusals unrecordable.
    expect(field("analyticsConsent")).toMatchObject({
      type: "checkbox",
      required: true,
    });
  });

  it("keeps marketingConsent optional, since it is a separate decision", () => {
    expect(field("marketingConsent")).toMatchObject({ type: "checkbox" });
    expect(field("marketingConsent")).not.toHaveProperty("required", true);
  });

  it("stores the request fingerprint that makes the record evidential", () => {
    expect(field("ipAddress")).toMatchObject({ type: "text" });
    expect(field("userAgent")).toMatchObject({ type: "text" });
  });

  it("declares no timestamp field of its own, since Payload maintains createdAt", () => {
    expect(field("timestamp")).toBeUndefined();
    expect(field("createdAt")).toBeUndefined();
  });
});
