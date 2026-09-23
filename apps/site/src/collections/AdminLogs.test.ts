import { describe, expect, it } from "vitest";
import { denyAll, isAdmin } from "@/access";
import { AdminLogs } from "./AdminLogs";

const field = (name: string) =>
  AdminLogs.fields.find((f) => "name" in f && f.name === name);

describe("AdminLogs collection", () => {
  it("uses the kebab-case plural admin-logs slug", () => {
    expect(AdminLogs.slug).toBe("admin-logs");
  });

  it("lets admins read the log", () => {
    expect(AdminLogs.access?.read).toBe(isAdmin);
  });

  it("denies every write through the API, admins included", () => {
    // Reference equality against the named helper, not an inline
    // `() => false`: an audit trail any admin could POST to records
    // whatever that admin wants it to record. The only writer is a
    // server-side hook using the local API, where `overrideAccess`
    // defaults to true. `AdminLogs.int.test.ts` proves both halves against
    // a real database.
    expect(AdminLogs.access?.create).toBe(denyAll);
    expect(AdminLogs.access?.update).toBe(denyAll);
    expect(AdminLogs.access?.delete).toBe(denyAll);
  });

  it("records who acted, as an indexed users relationship", () => {
    // Deliberately not required: a log entry written by a cron job or a
    // webhook has no acting user, and losing the entry entirely would be
    // worse than losing the actor.
    expect(field("user")).toMatchObject({
      type: "relationship",
      relationTo: "users",
      index: true,
    });
    expect(field("user")).not.toHaveProperty("required", true);
  });

  it("requires what an entry is worthless without", () => {
    const required = AdminLogs.fields
      .filter((f) => (f as { required?: boolean }).required === true)
      .map((f) => ("name" in f ? f.name : undefined));

    expect(required).toEqual(["action", "targetType", "targetId"]);
  });

  it("indexes action, because the log is read filtered by it", () => {
    expect(field("action")).toHaveProperty("index", true);
  });

  it("keeps arbitrary per-action detail in a json field", () => {
    expect(field("metadata")).toMatchObject({ type: "json" });
  });

  it("declares no timestamp field of its own, since Payload maintains createdAt", () => {
    expect(field("timestamp")).toBeUndefined();
    expect(field("createdAt")).toBeUndefined();
  });
});
