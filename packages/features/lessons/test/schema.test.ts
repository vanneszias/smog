import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  DRAWING_CREDIT_MAX,
  DRAWING_STEPS,
  LESSON_NOTES_MAX,
  TEACHER_FIELD_MAX,
} from "@smog/db/enums";
import { describe, expect, test } from "vitest";
import {
  DRAWING_KEY_PATTERN,
  drawingCreditSchema,
  drawingStepSchema,
  EMPTY_TEACHER_INFO,
  LESSON_PDF_LIMITS,
  LESSON_TEMPLATES,
  lessonNotesSchema,
  lessonNumberSchema,
  lessonTemplateSchema,
  lessonTitleSchema,
  parseDrawingKey,
  TEACHER_FIELD_COLUMNS,
  TEACHER_INFO_FIELDS,
  teacherInfoFieldsSchema,
} from "../src/schema";

const GESTURE = "5eed0002-0000-4000-8000-000000000001";
const UUID = "0b7e4f0e-6c1a-4c9e-8a53-2f4f1d9a7b11";

describe("teacher information", () => {
  test("every field is capped at 2,000 characters, like the CHECKs", () => {
    expect(TEACHER_FIELD_MAX).toBe(2000);
    const ok = Object.fromEntries(
      TEACHER_INFO_FIELDS.map((field) => [field, "x".repeat(2000)])
    );
    expect(teacherInfoFieldsSchema.safeParse(ok).success).toBe(true);
    for (const field of TEACHER_INFO_FIELDS) {
      const bad = { ...ok, [field]: "x".repeat(2001) };
      expect(teacherInfoFieldsSchema.safeParse(bad).success, field).toBe(false);
    }
  });

  test("the empty value and the column map cover the same seven fields", () => {
    expect(Object.keys(EMPTY_TEACHER_INFO).sort()).toEqual(
      [...TEACHER_INFO_FIELDS].sort()
    );
    expect(Object.keys(TEACHER_FIELD_COLUMNS).sort()).toEqual(
      [...TEACHER_INFO_FIELDS].sort()
    );
    // `OR` is an SQL keyword.
    expect(TEACHER_FIELD_COLUMNS.or).toBe("or_");
    expect(teacherInfoFieldsSchema.safeParse(EMPTY_TEACHER_INFO).success).toBe(
      true
    );
  });
});

describe("drawings", () => {
  test("steps are 1 and 2; the credit is trimmed and capped at 120", () => {
    expect([...DRAWING_STEPS]).toEqual([1, 2]);
    expect(drawingStepSchema.safeParse(1).success).toBe(true);
    expect(drawingStepSchema.safeParse(2).success).toBe(true);
    expect(drawingStepSchema.safeParse(3).success).toBe(false);
    expect(drawingStepSchema.safeParse("1").success).toBe(false);
    expect(DRAWING_CREDIT_MAX).toBe(120);
    expect(drawingCreditSchema.parse(`  ${"x".repeat(120)}  `)).toBe(
      "x".repeat(120)
    );
    expect(drawingCreditSchema.safeParse("x".repeat(121)).success).toBe(false);
  });

  test("a drawing key has exactly one shape", () => {
    expect(parseDrawingKey(`teacher/drawings/${GESTURE}/2/${UUID}`)).toEqual({
      gestureId: GESTURE,
      step: 2,
      uuid: UUID,
    });
    for (const key of [
      `teacher/drawings/${GESTURE}/3/${UUID}`,
      `teacher/drawings/${GESTURE}/1/${UUID}.png`,
      `teacher/drawings/../${GESTURE}/1/${UUID}`,
      `audio/${GESTURE}/nl/${UUID}`,
      `teacher/pdf/${GESTURE}/${UUID}`,
      `/teacher/drawings/${GESTURE}/1/${UUID}`,
      "",
    ]) {
      expect(parseDrawingKey(key), key).toBeNull();
      expect(DRAWING_KEY_PATTERN.test(key), key).toBe(false);
    }
  });
});

describe("lessons", () => {
  test("templates and the PDF limits are the spec's", () => {
    expect([...LESSON_TEMPLATES]).toEqual(["teachers", "participants"]);
    expect(LESSON_PDF_LIMITS).toEqual({ participants: 80, teachers: 150 });
    expect(lessonTemplateSchema.safeParse("participants").success).toBe(true);
    expect(lessonTemplateSchema.safeParse("students").success).toBe(false);
  });

  test("title, notes and number follow the column caps", () => {
    expect(lessonTitleSchema.parse("  Les 1  ")).toBe("Les 1");
    expect(lessonTitleSchema.safeParse("   ").success).toBe(false);
    expect(lessonTitleSchema.safeParse("x".repeat(201)).success).toBe(false);
    expect(
      lessonNotesSchema.safeParse("x".repeat(LESSON_NOTES_MAX)).success
    ).toBe(true);
    expect(
      lessonNotesSchema.safeParse("x".repeat(LESSON_NOTES_MAX + 1)).success
    ).toBe(false);
    for (const [value, ok] of [
      [0, true],
      [9999, true],
      [null, true],
      [-1, false],
      [10_000, false],
      [1.5, false],
    ] as const) {
      expect(lessonNumberSchema.safeParse(value).success, String(value)).toBe(
        ok
      );
    }
  });
});

describe("audit kinds", () => {
  test("the phase 10c actions and target types are in the closed lists", () => {
    for (const action of [
      "teacher.info_save",
      "teacher.drawing_upload",
      "teacher.drawing_delete",
      "lesson.create",
      "lesson.update",
      "lesson.delete",
      "lesson.duplicate",
      "lesson.export",
    ]) {
      expect(AUDIT_ACTIONS as readonly string[]).toContain(action);
    }
    expect(AUDIT_TARGET_TYPES as readonly string[]).toContain("lesson");
    expect(AUDIT_TARGET_TYPES as readonly string[]).toContain(
      "gesture_teacher_info"
    );
  });
});
