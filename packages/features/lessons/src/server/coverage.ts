/**
 * `teacherInfoCoverage` (phase 10c task 2): how much teaching text a set of
 * gestures has in one language, for the readiness bar of a lesson (task 4)
 * and the export dialog's list of gestures that will fall back (task 5).
 * Not a procedure: the lesson procedures call it under their own role guard.
 */
import { defaultLanguageCode, gestureTeacherInfo, inList } from "@smog/db";
import type { Db } from "@smog/db/client";
import { and } from "drizzle-orm";
import {
  TEACHER_INFO_FIELDS,
  type TeacherCoverageState,
  type TeacherInfoFields,
} from "../schema";

export interface TeacherInfoCoverage {
  /** How many have none of their own but have text in the default language (the PDF prints that, marked). */
  fallback: number;
  /** One entry per requested gesture, in the order asked, once each. */
  items: { gestureId: string; state: TeacherCoverageState }[];
  /** How many have none in either. */
  none: number;
  /** How many gestures have text of their own in the language. */
  own: number;
}

/** Whether a row holds any text at all (an all-empty row is a saved clearing, not information). */
export function hasTeacherText(fields: TeacherInfoFields): boolean {
  return TEACHER_INFO_FIELDS.some((field) => fields[field].trim() !== "");
}

/**
 * For each gesture: `own` when the language has a row with some text,
 * `fallback` when only the default language does, else `none`. For the
 * default language itself it is `own` or `none`. A gesture asked twice
 * counts once.
 */
export async function teacherInfoCoverage(
  db: Db,
  gestureIds: readonly string[],
  locale: string
): Promise<TeacherInfoCoverage> {
  const ids = [...new Set(gestureIds)];
  const defaultLocale = (await defaultLanguageCode(db)) ?? locale;
  const locales = [...new Set([locale, defaultLocale])];
  const withText = new Map<string, Set<string>>();
  const rows =
    ids.length === 0
      ? []
      : await db
          .select({
            bw: gestureTeacherInfo.bw,
            cNote: gestureTeacherInfo.cNote,
            gestureId: gestureTeacherInfo.gestureId,
            hc: gestureTeacherInfo.hc,
            locale: gestureTeacherInfo.locale,
            note: gestureTeacherInfo.note,
            or_: gestureTeacherInfo.or_,
            pl: gestureTeacherInfo.pl,
            summary: gestureTeacherInfo.summary,
          })
          .from(gestureTeacherInfo)
          .where(
            and(
              // One bound list each: D1 binds at most 100 values per statement.
              inList(gestureTeacherInfo.gestureId, ids),
              inList(gestureTeacherInfo.locale, locales)
            )
          );
  for (const { gestureId, locale: rowLocale, or_, ...rest } of rows) {
    if (hasTeacherText({ ...rest, or: or_ })) {
      const held = withText.get(gestureId) ?? new Set<string>();
      held.add(rowLocale);
      withText.set(gestureId, held);
    }
  }
  const items = ids.map((gestureId) => {
    const held = withText.get(gestureId);
    let state: TeacherCoverageState = "none";
    if (held?.has(locale)) {
      state = "own";
    } else if (held?.has(defaultLocale)) {
      state = "fallback";
    }
    return { gestureId, state };
  });
  const count = (state: TeacherCoverageState) =>
    items.filter((item) => item.state === state).length;
  return {
    fallback: count("fallback"),
    items,
    none: count("none"),
    own: count("own"),
  };
}
