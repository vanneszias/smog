/**
 * The strings catalogue as the translation screens see it (phase 10b
 * task 4): every key there is, and for each language what it shows, and
 * whether that text is missing, stale (the source changed since it was
 * translated) or invalid (placeholders). Pure: the `ui_string` rows come in
 * as arguments, so the model is testable without D1.
 *
 * A key's text in a language is the override (`ui_string`), else the
 * shipped text, else nothing (a language added as data starts empty and
 * shows the default language's text until translated). Plural forms are
 * per language (`requiredPluralForms`): `x_many` exists for French and is
 * `not applicable` for Dutch.
 */
import {
  flattenMessages,
  isShippedLocale,
  type PluralForm,
  requiredPluralForms,
  shippedMessages,
  splitPluralKey,
  validateTranslation,
} from "@smog/i18n";
import type {
  LanguageCoverage,
  StringCell,
  StringIssue,
  StringRow,
} from "../schema";

/** One `ui_string` row as the model needs it. */
export interface OverrideRow {
  sourceHash: string | null;
  /** Epoch ms. */
  updatedAt: number;
  value: string;
}

/** `locale` to `key` to row. */
export type Overrides = ReadonlyMap<string, ReadonlyMap<string, OverrideRow>>;

/** A language of the table (`LanguageInfo`'s subset plus the default flag). */
export interface ModelLanguage {
  code: string;
  isDefault: boolean;
  name: string;
}

export interface KeyInfo {
  /** Without the plural suffix. */
  base: string;
  form: PluralForm | null;
  key: string;
  namespace: string;
}

/** The first dotted segment of a key. */
function namespaceOf(key: string): string {
  const dot = key.indexOf(".");
  return dot === -1 ? key : key.slice(0, dot);
}

const shippedCache = new Map<string, Readonly<Record<string, string>>>();

/** The flat shipped catalogue of a language (cached: the bundle never changes at runtime). */
function shippedFlat(locale: string): Readonly<Record<string, string>> {
  const hit = shippedCache.get(locale);
  if (hit) {
    return hit;
  }
  const flat = isShippedLocale(locale)
    ? flattenMessages(shippedMessages(locale))
    : {};
  shippedCache.set(locale, flat);
  return flat;
}

/** Two prime moduli below 2^31: the products below stay under 2^53, so the arithmetic is exact. */
const HASH_MODULI = [2_147_483_647, 2_147_483_629] as const;
const HASH_MULTIPLIERS = [31, 131] as const;

/**
 * Two polynomial hashes of the text as 16 hex digits: the stored
 * `source_hash`. Only change detection (a changed source gives another
 * hash), not a security measure.
 */
export function sourceHash(source: string): string {
  const lanes = [7, 11];
  for (let index = 0; index < source.length; index += 1) {
    const unit = source.charCodeAt(index);
    for (const [lane, modulus] of HASH_MODULI.entries()) {
      lanes[lane] =
        ((lanes[lane] ?? 0) * (HASH_MULTIPLIERS[lane] ?? 31) + unit) % modulus;
    }
  }
  return lanes.map((lane) => lane.toString(16).padStart(8, "0")).join("");
}

const universeCache = new Map<string, readonly KeyInfo[]>();

/**
 * Every key of the catalogue, sorted: each shipped key, and for every plural
 * group each form any of `languages` needs (`x_many` for French, `x_zero`
 * for a language added later).
 */
export function catalogueKeys(
  languages: readonly string[]
): readonly KeyInfo[] {
  const cacheKey = [...languages].sort().join(",");
  const hit = universeCache.get(cacheKey);
  if (hit) {
    return hit;
  }
  const keys = new Set<string>();
  const pluralBases = new Set<string>();
  for (const locale of ["nl", "en", "fr", ...languages]) {
    for (const key of Object.keys(shippedFlat(locale))) {
      const { base, form } = splitPluralKey(key);
      if (form) {
        pluralBases.add(base);
      } else {
        keys.add(key);
      }
    }
  }
  for (const base of pluralBases) {
    const forms = new Set<PluralForm>(["one", "other"]);
    for (const locale of languages) {
      for (const form of requiredPluralForms(locale)) {
        forms.add(form);
      }
    }
    for (const form of forms) {
      keys.add(`${base}_${form}`);
    }
  }
  const out = [...keys].sort().map((key): KeyInfo => {
    const { base, form } = splitPluralKey(key);
    return { base, form, key, namespace: namespaceOf(key) };
  });
  universeCache.set(cacheKey, out);
  return out;
}

/** Whether `locale` shows this key (a plural form it does not use is not applicable). */
export function isApplicable(info: KeyInfo, locale: string): boolean {
  return info.form === null || requiredPluralForms(locale).includes(info.form);
}

/** What `locale` shows for `key` and where it comes from; `null` when nothing. */
function effectiveText(
  overrides: Overrides,
  locale: string,
  key: string
): { override: OverrideRow | null; value: string | null } {
  const row = overrides.get(locale)?.get(key) ?? null;
  if (row && row.value.trim() !== "") {
    return { override: row, value: row.value };
  }
  const shipped = shippedFlat(locale)[key];
  return {
    override: row,
    value: shipped && shipped.trim() !== "" ? shipped : null,
  };
}

/**
 * The default language's text of a key (the source). A plural form the
 * default language does not use shows its `_other` text.
 */
export function sourceOf(
  overrides: Overrides,
  defaultCode: string,
  info: KeyInfo
): string {
  const own = effectiveText(overrides, defaultCode, info.key).value;
  if (own !== null) {
    return own;
  }
  if (info.form !== null) {
    return (
      effectiveText(overrides, defaultCode, `${info.base}_other`).value ?? ""
    );
  }
  return "";
}

function issuesOf(source: string, value: string): StringIssue[] {
  return validateTranslation(source, value).issues;
}

/** One language's cell for a key. */
export function cellOf(
  overrides: Overrides,
  language: ModelLanguage,
  info: KeyInfo,
  source: string
): StringCell {
  if (!isApplicable(info, language.code)) {
    return {
      applicable: false,
      issues: [],
      missing: false,
      overridden: false,
      stale: false,
      updatedAt: null,
      value: null,
    };
  }
  const { override, value } = effectiveText(overrides, language.code, info.key);
  const overridden = override !== null;
  const updatedAt = override?.updatedAt ?? null;
  if (value === null) {
    return {
      applicable: true,
      issues: [],
      missing: true,
      overridden,
      stale: false,
      updatedAt,
      value: null,
    };
  }
  const stale =
    !language.isDefault &&
    override !== null &&
    override.sourceHash !== null &&
    override.sourceHash !== sourceHash(source);
  return {
    applicable: true,
    issues: language.isDefault ? [] : issuesOf(source, value),
    missing: false,
    overridden,
    stale,
    updatedAt,
    value,
  };
}

/** The table row of a key: its source and a cell per language. */
export function rowOf(
  overrides: Overrides,
  languages: readonly ModelLanguage[],
  defaultCode: string,
  info: KeyInfo
): StringRow {
  const source = sourceOf(overrides, defaultCode, info);
  return {
    cells: Object.fromEntries(
      languages.map((language) => [
        language.code,
        cellOf(overrides, language, info, source),
      ])
    ),
    key: info.key,
    namespace: info.namespace,
    source,
  };
}

/** Lower case without accents, for the search. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Whether a row has `status` in `locale` (or in any language when `locale` is unset). */
export function hasStatus(
  row: StringRow,
  status: "invalid" | "missing" | "stale",
  locale: string | undefined
): boolean {
  const cells = locale ? [row.cells[locale]] : Object.values(row.cells);
  return cells.some((cell) => {
    if (!cell?.applicable) {
      return false;
    }
    if (status === "missing") {
      return cell.missing;
    }
    if (status === "stale") {
      return cell.stale;
    }
    return cell.issues.length > 0;
  });
}

/** Whether `needle` (already folded) is in the row's key, source or any text. */
export function rowMatches(row: StringRow, needle: string): boolean {
  if (fold(row.key).includes(needle) || fold(row.source).includes(needle)) {
    return true;
  }
  return Object.values(row.cells).some(
    (cell) => cell.value !== null && fold(cell.value).includes(needle)
  );
}

/** The coverage of every language over the whole catalogue. */
export function coverageOf(
  overrides: Overrides,
  languages: readonly ModelLanguage[],
  defaultCode: string
): LanguageCoverage[] {
  const keys = catalogueKeys(languages.map((language) => language.code));
  const counts = new Map(
    languages.map((language) => [
      language.code,
      { invalid: 0, missing: 0, stale: 0, total: 0, translated: 0 },
    ])
  );
  for (const info of keys) {
    const source = sourceOf(overrides, defaultCode, info);
    for (const language of languages) {
      const count = counts.get(language.code);
      if (!(count && isApplicable(info, language.code))) {
        continue;
      }
      const cell = cellOf(overrides, language, info, source);
      count.total += 1;
      if (cell.missing) {
        count.missing += 1;
        continue;
      }
      count.translated += 1;
      if (cell.stale) {
        count.stale += 1;
      }
      if (cell.issues.length > 0) {
        count.invalid += 1;
      }
    }
  }
  return languages.map((language) => ({
    code: language.code,
    isDefault: language.isDefault,
    name: language.name,
    ...(counts.get(language.code) ?? {
      invalid: 0,
      missing: 0,
      stale: 0,
      total: 0,
      translated: 0,
    }),
  }));
}
