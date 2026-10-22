import { LOCALE_CODE_PATTERN } from "@smog/config/constants";
import {
  STRING_STATUSES,
  type StringStatus,
  type StringsListInput,
} from "@smog/translation/schema";

/** Rows per page of the strings table. */
export const STRINGS_PAGE_SIZE = 100;

/** The strings table's filters as they live in the URL (`/admin/translation/strings?...`). */
export interface StringsSearch {
  /** The language the status filter applies to (any language when absent). */
  lang?: string | undefined;
  /** The key's first segment. */
  ns?: string | undefined;
  /** One-based. */
  page?: number | undefined;
  /** A substring of the key or of a text. */
  q?: string | undefined;
  status?: StringStatus | undefined;
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() !== "" && value.length <= max
    ? value
    : undefined;
}

/** Every key set (`undefined` when absent or invalid), as the other admin screens do. */
export function validateStringsSearch(
  search: Record<string, unknown>
): StringsSearch {
  const page = Number(search.page);
  const lang = text(search.lang, 35);
  const status = STRING_STATUSES.find((value) => value === search.status);
  return {
    lang: lang && LOCALE_CODE_PATTERN.test(lang) ? lang : undefined,
    ns: text(search.ns, 200),
    page:
      Number.isInteger(page) && page > 1 && page < 10_000 ? page : undefined,
    q: text(search.q, 100),
    status,
  };
}

/** The procedure input for a page of the table. */
export function stringsListInput(search: StringsSearch): StringsListInput {
  return {
    limit: STRINGS_PAGE_SIZE,
    locale: search.lang,
    namespace: search.ns,
    offset: ((search.page ?? 1) - 1) * STRINGS_PAGE_SIZE,
    search: search.q?.trim() || undefined,
    status: search.status,
  };
}
