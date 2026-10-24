import { describe, expect, test } from "bun:test";
import {
  isAdminHome,
  lessonsMayOpen,
  TEACHER_HOME,
  TRANSLATION_HOME,
  teacherInfoMayOpen,
  translatorMayOpen,
} from "./admin-access";

describe("what a translator may open", () => {
  test("only the strings and legal text screens (and the translation index that leads to them)", () => {
    expect(translatorMayOpen(TRANSLATION_HOME)).toBe(true);
    expect(translatorMayOpen("/admin/translation/legal")).toBe(true);
    expect(translatorMayOpen("/admin/translation/legal/")).toBe(true);
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
      "/admin/translation/legal/extra",
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

describe("what a teacher or a translator may open besides", () => {
  test("one gesture's teacher information", () => {
    expect(teacherInfoMayOpen("/admin/teacher-info/abc")).toBe(true);
    expect(teacherInfoMayOpen("/admin/teacher-info/abc/")).toBe(true);
  });

  test("not the index, a deeper path, a look-alike or the gesture editor", () => {
    for (const path of [
      "/admin/teacher-info",
      "/admin/teacher-info/",
      "/admin/teacher-info/abc/extra",
      "/admin/teacher-infox/abc",
      "/admin/gestures/abc",
      "/admin",
    ]) {
      expect(teacherInfoMayOpen(path), path).toBe(false);
    }
  });
});

describe("what a teacher may open besides", () => {
  test("the lesson list and one lesson", () => {
    expect(TEACHER_HOME).toBe("/admin/lessons");
    expect(lessonsMayOpen("/admin/lessons")).toBe(true);
    expect(lessonsMayOpen("/admin/lessons/")).toBe(true);
    expect(lessonsMayOpen("/admin/lessons/abc")).toBe(true);
    expect(lessonsMayOpen("/admin/lessons/abc/")).toBe(true);
  });

  test("not a deeper path, a look-alike or any other admin screen", () => {
    for (const path of [
      "/admin",
      "/admin/lessons/abc/extra",
      "/admin/lessonsx",
      "/admin/lessonsx/abc",
      "/admin/gestures/abc",
      "/admin/users",
      "/admin/translation/strings",
    ]) {
      expect(lessonsMayOpen(path), path).toBe(false);
    }
  });
});
