import { describe, expect, it } from "bun:test";
import { activeHref, RAIL_GROUPS, railFor } from "./admin-rail";
import { crumbsFor } from "./admin-toolbar";

describe("the admin rail", () => {
  it("groups the sections as Content, Translation, Community and Operations", () => {
    expect(
      RAIL_GROUPS.map((group) => [
        group.id,
        group.items.map((item) => item.href),
      ])
    ).toEqual([
      ["content", ["/admin/gestures", "/admin/categories"]],
      [
        "translation",
        [
          "/admin/translation/strings",
          "/admin/translation/legal",
          "/admin/translation/languages",
        ],
      ],
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

  it("shows a translator the translation group only (strings, legal texts), without the language list", () => {
    expect(
      railFor(false).map((group) => [
        group.id,
        group.items.map((item) => item.href),
      ])
    ).toEqual([
      [
        "translation",
        ["/admin/translation/strings", "/admin/translation/legal"],
      ],
    ]);
    expect(railFor(true)).toBe(RAIL_GROUPS);
  });

  it("marks the translation screens", () => {
    expect(activeHref("/admin/translation/strings")).toBe(
      "/admin/translation/strings"
    );
    expect(activeHref("/admin/translation/languages/")).toBe(
      "/admin/translation/languages"
    );
    expect(activeHref("/admin/translation/legal")).toBe(
      "/admin/translation/legal"
    );
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

  it("trails the translation screens as Admin and the screen", () => {
    expect(crumbsFor("/admin/translation/strings")).toEqual([
      { href: "/admin", label: "admin.rail.label" },
      { label: "admin.rail.strings" },
    ]);
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
