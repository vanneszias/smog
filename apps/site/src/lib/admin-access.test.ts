import { describe, expect, test } from "bun:test";
import {
  isAdminHome,
  TRANSLATION_HOME,
  translatorMayOpen,
} from "./admin-access";

describe("what a translator may open", () => {
  test("only the strings screen (and the translation index that leads to it)", () => {
    expect(translatorMayOpen(TRANSLATION_HOME)).toBe(true);
    expect(translatorMayOpen("/admin/translation/strings/")).toBe(true);
    expect(translatorMayOpen("/admin/translation")).toBe(true);
  });

  test("not the dashboard, the languages, nor any other admin screen", () => {
    for (const path of [
      "/admin",
      "/admin/translation/languages",
      "/admin/users",
      "/admin/audit",
      "/admin/gestures/abc",
      "/admin/translationx",
      "/admin/translation/strings/extra",
    ]) {
      expect(translatorMayOpen(path), path).toBe(false);
    }
  });

  test("the dashboard is /admin only", () => {
    expect(isAdminHome("/admin")).toBe(true);
    expect(isAdminHome("/admin/")).toBe(true);
    expect(isAdminHome("/admin/users")).toBe(false);
  });
});
