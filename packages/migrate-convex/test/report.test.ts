import { describe, expect, test } from "bun:test";
import {
  buildReport,
  mergeSections,
  REPORT_DOMAINS,
  renderReportJson,
  renderReportMarkdown,
  section,
} from "../src/core/report";
import {
  isTarget,
  pseudoEmail,
  pseudoName,
  pseudonymiser,
  STAGING_EMAIL_DOMAIN,
} from "../src/core/target";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const EXPORT = {
  sha256: "f".repeat(64),
  tables: { categories: 1, users: 2 },
  unknownTables: [],
};

describe("the report", () => {
  test("has one section per domain, in order, blockers first and counts summed", () => {
    const sections = mergeSections([
      section("users", { skippedGuests: 1 }, [
        { code: "noEmail", message: "w", severity: "warning" },
      ]),
      section("catalog", { gestures: 2 }),
      section("users", { created: 1, skippedGuests: 2 }, [
        { code: "info", message: "i", severity: "info" },
        { code: "noAdmin", message: "b", severity: "blocker" },
      ]),
    ]);
    expect(sections.map((part) => part.domain)).toEqual([...REPORT_DOMAINS]);
    expect(REPORT_DOMAINS).toEqual([
      "export",
      "users",
      "catalog",
      "learning",
      "account",
      "sponsorships",
      "mux",
    ]);
    const [, users] = sections;
    expect(users?.counts).toEqual({ created: 1, skippedGuests: 3 });
    expect(Object.keys(users?.counts ?? {})).toEqual([
      "created",
      "skippedGuests",
    ]);
    expect(users?.issues.map((issue) => issue.code)).toEqual([
      "noAdmin",
      "noEmail",
      "info",
    ]);
  });

  test("counts blockers and warnings, and renders the markdown from the JSON", () => {
    const report = buildReport({
      export: EXPORT,
      now: NOW,
      sections: [
        section("sponsorships", { sponsorships: 3 }, [
          {
            code: "overlayTooLong",
            details: [{ length: 36, overlayText: "A | B", status: "active" }],
            ids: ["ks7a"],
            message: "1 overlay is over 35 characters.",
            personal: true,
            severity: "blocker",
          },
          {
            code: "vatMissing",
            ids: ["ks7b"],
            message: "w",
            severity: "warning",
          },
        ]),
      ],
      target: "production",
    });
    expect(report.blockers).toBe(1);
    expect(report.warnings).toBe(1);
    expect(report.now).toBe("2026-10-04T12:00:00.000Z");
    expect(Object.keys(report.export.tables)).toEqual(["categories", "users"]);
    expect(JSON.parse(renderReportJson(report))).toEqual(
      JSON.parse(JSON.stringify(report))
    );
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("**blocked**: 1 blocker(s)");
    const blockers = markdown.indexOf("## Blockers");
    const firstSection = markdown.indexOf("## export");
    expect(blockers).toBeGreaterThan(-1);
    expect(markdown.indexOf("[sponsorships] `overlayTooLong`")).toBeGreaterThan(
      blockers
    );
    expect(markdown.indexOf("[sponsorships] `overlayTooLong`")).toBeLessThan(
      firstSection
    );
    expect(markdown).toContain("| 36 | A \\| B | active |");
    expect(markdown).toContain("personal data");
    expect(markdown).toEndWith("\n");
    expect(markdown).not.toEndWith("\n\n");
  });

  test("caps the ids in the markdown, not in the JSON", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `id${i}`);
    const report = buildReport({
      export: EXPORT,
      now: NOW,
      sections: [
        section("learning", {}, [
          { code: "x", ids, message: "m", severity: "warning" },
        ]),
      ],
      target: "staging",
    });
    expect(report.sections[3]?.issues[0]?.ids).toHaveLength(25);
    expect(renderReportMarkdown(report)).toContain(
      "and 5 more (report.json lists them all)"
    );
    expect(renderReportMarkdown(report)).toContain("no blockers");
  });
});

describe("the target and the pseudonymiser (B2)", () => {
  test("knows the two targets", () => {
    expect(isTarget("staging")).toBe(true);
    expect(isTarget("production")).toBe(true);
    expect(isTarget("dev")).toBe(false);
  });

  test("staging replaces addresses, names, VAT, companies, asset ids and tokens", () => {
    const pseudo = pseudonymiser("staging");
    const id = "0b5e8c5e-1d2a-8f00-9a00-000000000001";
    expect(pseudo.pseudonymised).toBe(true);
    expect(pseudo.email(id, "ada@example.test")).toBe(
      `${id}@${STAGING_EMAIL_DOMAIN}`
    );
    expect(pseudoEmail(id)).toBe(`${id}@staging.invalid`);
    expect(pseudo.name("user", 3, "Ada")).toBe("Gebruiker 3");
    expect(pseudo.name("sponsor", 1, "Bea")).toBe("Sponsor 1");
    expect(pseudo.vat("BE0403170701")).toBe("");
    expect(pseudo.company("Bakkerij")).toBeNull();
    expect(pseudo.assetId("asset-1")).toBeNull();
    expect(pseudo.tokens([{ token: "t" }])).toEqual([]);
  });

  test("production keeps every value", () => {
    const pseudo = pseudonymiser("production");
    expect(pseudo.pseudonymised).toBe(false);
    expect(pseudo.email("id", "ada@example.test")).toBe("ada@example.test");
    expect(pseudo.name("user", 3, "Ada")).toBe("Ada");
    expect(pseudo.vat("BE0403170701")).toBe("BE0403170701");
    expect(pseudo.company(undefined)).toBeNull();
    expect(pseudo.assetId("asset-1")).toBe("asset-1");
    expect(pseudo.tokens([1, 2])).toEqual([1, 2]);
  });

  test("pseudoName and pseudoEmail refuse bad input", () => {
    expect(() => pseudoName("user", 0)).toThrow("n >= 1");
    expect(() => pseudoName("user", 1.5)).toThrow("n >= 1");
    expect(() => pseudoEmail("")).toThrow("needs the row's id");
  });
});
