/**
 * What each role may open under `/admin` (phase 10b task 4). An admin opens
 * everything; a translator only the translation screens they can use (the
 * strings and the legal texts; the language list is the admin's), and `/admin` itself sends them to the
 * strings. The procedures check the role again on every call: this only
 * decides what the page shows.
 */

/** Where a translator lands. */
export const TRANSLATION_HOME = "/admin/translation/strings";

/** The legal texts: a translator drafts and publishes them (phase 10b task 7, risk R1). */
const LEGAL_HOME = "/admin/translation/legal";

/** A path without its trailing slash (the root stays `/`). */
function trimmed(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/** Whether `pathname` is the admin dashboard. */
export function isAdminHome(pathname: string): boolean {
  return trimmed(pathname) === "/admin";
}

/**
 * One gesture's teacher information (phase 10c task 2): a teacher and a
 * translator (neither of them an admin) may open it. A teacher's other
 * screens (the lessons) join in task 4.
 */
const TEACHER_INFO_PATH = /^\/admin\/teacher-info\/[^/]+$/;

/** Whether a teacher or a translator (who is not an admin) may open `pathname`. */
export function teacherInfoMayOpen(pathname: string): boolean {
  return TEACHER_INFO_PATH.test(trimmed(pathname));
}

/** Whether a translator (who is not an admin) may open `pathname`. */
export function translatorMayOpen(pathname: string): boolean {
  const path = trimmed(pathname);
  return (
    path === "/admin/translation" ||
    path === TRANSLATION_HOME ||
    path === LEGAL_HOME
  );
}
