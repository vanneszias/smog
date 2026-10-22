import { describe, expect, it } from "bun:test";
import { activeHref, RAIL_GROUPS } from "./admin-rail";
import { crumbsFor } from "./admin-toolbar";

describe("the admin rail", () => {
  it("groups the sections as Content, Community and Operations", () => {
    expect(
      RAIL_GROUPS.map((group) => [
        group.id,
        group.items.map((item) => item.href),
      ])
    ).toEqual([
      ["content", ["/admin/gestures", "/admin/categories"]],
      ["community", ["/admin/users", "/admin/sponsorships"]],
      [
        "operations",
        [
          "/admin/dead-letters",
          "/admin/audit",
          "/admin/emails",
          "/admin/settings",
        ],
      ],
    ]);
  });

  it("marks the dashboard only on its own path", () => {
    expect(activeHref("/admin")).toBe("/admin");
    expect(activeHref("/admin/")).toBe("/admin");
    expect(activeHref("/admin/gestures/abc")).toBe("/admin/gestures");
    expect(activeHref("/admin/audit")).toBe("/admin/audit");
    expect(activeHref("/elsewhere")).toBeUndefined();
  });
});

describe("the admin breadcrumbs", () => {
  it("is just Admin on the dashboard", () => {
    expect(crumbsFor("/admin")).toEqual([{ label: "admin.rail.label" }]);
  });

  it("ends on the section for a list screen", () => {
    expect(crumbsFor("/admin/users")).toEqual([
      { href: "/admin", label: "admin.rail.label" },
      { label: "admin.rail.users" },
    ]);
  });

  it("adds the new gesture and detail pages below the section", () => {
    expect(crumbsFor("/admin/gestures/new").at(-1)).toEqual({
      label: "admin.gestures.new",
    });
    expect(crumbsFor("/admin/sponsorships/abc")).toEqual([
      { href: "/admin", label: "admin.rail.label" },
      { href: "/admin/sponsorships", label: "admin.rail.sponsorships" },
      { label: "admin.crumb.detail" },
    ]);
  });
});
