import { describe, expect, test } from "bun:test";
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type AuditEntry,
} from "@smog/admin/schema";
import { createI18n, LOCALES } from "@smog/i18n";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderSite } from "@/test/render";
import { actionLabel, auditTargetLink, targetTypeLabel } from "./audit-data";
import {
  AuditEntries,
  auditListInput,
  validateAuditSearch,
} from "./audit-table";

const ENTRY: AuditEntry = {
  action: "legacy",
  actor: null,
  createdAt: Date.UTC(2026, 8, 30, 10, 0),
  data: { legacy: { note: "migrated" } },
  id: "a-1",
  targetId: "g-1",
  targetType: "gesture",
};

describe("audit labels", () => {
  test("every action and target type has a label in every locale", () => {
    for (const locale of LOCALES) {
      const { t } = createI18n(locale);
      for (const action of AUDIT_ACTIONS) {
        const label = actionLabel(t, action);
        expect(label, `${locale} ${action}`).not.toContain("admin.audit");
        expect(label.length).toBeGreaterThan(0);
      }
      for (const type of AUDIT_TARGET_TYPES) {
        expect(targetTypeLabel(t, type)).not.toContain("admin.audit");
      }
    }
  });
});

describe("audit target links", () => {
  test("point at the target's admin page", () => {
    expect(auditTargetLink(ENTRY)).toEqual({ to: "/admin/gestures/g-1" });
    expect(
      auditTargetLink({ ...ENTRY, targetId: "u-1", targetType: "user" })
    ).toEqual({ search: { user: "u-1" }, to: "/admin/users" });
    expect(
      auditTargetLink({ ...ENTRY, targetId: null, targetType: "system" })
    ).toBeNull();
  });
});

describe("audit search", () => {
  test("keeps valid filters only, and sets every key", () => {
    expect(
      validateAuditSearch({
        action: "gesture.create",
        actor: "u-1",
        extra: "x",
        from: "2026-09-01",
        targetType: "nope",
        to: "30/09/2026",
      })
    ).toEqual({
      action: "gesture.create",
      actor: "u-1",
      cursor: undefined,
      from: "2026-09-01",
      targetType: undefined,
      to: undefined,
    });
  });

  test("turns the day range into an inclusive, ordered time range", () => {
    const input = auditListInput({ from: "2026-09-30", to: "2026-09-01" });
    expect(input.from).toBe(new Date("2026-09-01T00:00:00").getTime());
    expect(input.to).toBe(new Date("2026-09-30T23:59:59.999").getTime());
  });
});

describe("AuditEntries", () => {
  test("a row opens the entry, with a deleted actor and the data", async () => {
    function Page(): ReactNode {
      return (
        <div data-testid="page">
          <AuditEntries entries={[ENTRY]} label="Audit" />
        </div>
      );
    }
    await renderSite(Page);
    expect(screen.getByText("Deleted account")).toBeDefined();
    fireEvent.click(screen.getByText("Old log entry"));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(dialog.textContent).toContain('"note": "migrated"');
    });
    expect(dialog.textContent).toContain("Deleted account");
    expect(
      screen.getByRole("link", { name: "Open" }).getAttribute("href")
    ).toBe("/admin/gestures/g-1");
  });
});
