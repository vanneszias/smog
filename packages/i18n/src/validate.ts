import type { Locale } from "@smog/config/constants";

/** The longest interface string a translation may be (the `ui_string.value` CHECK). */
export const UI_STRING_MAX_LENGTH = 4000;

const PLURAL_FORMS = ["zero", "one", "two", "few", "many", "other"] as const;
export type PluralForm = (typeof PLURAL_FORMS)[number];
const PLURAL_FORM_SET: ReadonlySet<string> = new Set(PLURAL_FORMS);

const PLACEHOLDER = /\{\{\s*([\w.]+)/g;

/**
 * The `{{names}}` a string interpolates, sorted. `count` is left out: a
 * plural form may say "one" instead of "{{count}}" (`un`, `een`).
 */
export function placeholdersOf(...values: readonly string[]): string[] {
  const names = new Set<string>();
  for (const value of values) {
    let closing = -1;
    let consumed = 0;
    for (const match of value.matchAll(PLACEHOLDER)) {
      if (match.index < consumed) {
        continue;
      }
      const from = match.index + match[0].length;
      if (closing < from) {
        const found = value.indexOf("}", from);
        closing = found === -1 ? value.length : found;
      }
      if (value.slice(closing, closing + 2) !== "}}") {
        continue;
      }
      consumed = closing + 2;
      const [, name] = match;
      if (name && name !== "count") {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

/** `x_one` to `{ base: "x", form: "one" }`; a plain key has no form. */
export function splitPluralKey(key: string): {
  base: string;
  form: PluralForm | null;
} {
  const cut = key.lastIndexOf("_");
  const form = cut > 0 ? key.slice(cut + 1) : "";
  return PLURAL_FORM_SET.has(form)
    ? { base: key.slice(0, cut), form: form as PluralForm }
    : { base: key, form: null };
}

/** The CLDR plural categories of a language (`nl`: one, other; `fr`: one, many, other), sorted. */
export function requiredPluralForms(locale: Locale): PluralForm[] {
  try {
    return new Intl.PluralRules(locale)
      .resolvedOptions()
      .pluralCategories.slice()
      .sort() as PluralForm[];
  } catch {
    // An unknown tag: the two forms every language can use.
    return ["one", "other"];
  }
}

export type TranslationIssue =
  | { code: "empty" }
  | { code: "tooLong"; max: number }
  | { code: "placeholders"; extra: string[]; missing: string[] };

export interface TranslationCheck {
  issues: TranslationIssue[];
  ok: boolean;
}

export interface ValidateOptions {
  /** Defaults to `UI_STRING_MAX_LENGTH`. */
  maxLength?: number;
}

/**
 * Whether `value` is a usable translation of `base` (the default-language
 * text): not blank, not over the length cap, and using exactly the same
 * `{{placeholders}}` (a missing one drops data, an extra one prints a raw
 * `{{name}}`). Pure; the strings screen, the import and the tests share it
 * (the parity rules of `catalog.test.ts`).
 */
export function validateTranslation(
  base: string,
  value: string,
  { maxLength = UI_STRING_MAX_LENGTH }: ValidateOptions = {}
): TranslationCheck {
  const issues: TranslationIssue[] = [];
  if (value.trim() === "") {
    issues.push({ code: "empty" });
  } else {
    if (value.length > maxLength) {
      issues.push({ code: "tooLong", max: maxLength });
    }
    const want = placeholdersOf(base);
    const have = placeholdersOf(value);
    const missing = want.filter((name) => !have.includes(name));
    const extra = have.filter((name) => !want.includes(name));
    if (missing.length > 0 || extra.length > 0) {
      issues.push({ code: "placeholders", extra, missing });
    }
  }
  return { issues, ok: issues.length === 0 };
}

export interface PluralProblem {
  base: string;
  /** The forms the language needs and the key lacks. */
  missing: PluralForm[];
  /** The forms the key has but the language does not use, or plural forms next to a plain key. */
  unexpected: string[];
}

/**
 * Checks the plural forms of a set of keys of one language: every plural
 * key has each CLDR category of `locale` (`x_one`, `x_other`, `x_many` for
 * French), none other, and no plain key shares its name with plural forms.
 */
export function pluralProblems(
  locale: Locale,
  keys: Iterable<string>
): PluralProblem[] {
  const needed = requiredPluralForms(locale);
  const groups = new Map<string, Set<string>>();
  for (const key of keys) {
    const { base, form } = splitPluralKey(key);
    const forms = groups.get(base) ?? new Set<string>();
    forms.add(form ?? "");
    groups.set(base, forms);
  }
  const problems: PluralProblem[] = [];
  for (const [base, forms] of groups) {
    if (forms.has("")) {
      if (forms.size > 1) {
        problems.push({
          base,
          missing: [],
          unexpected: [...forms].filter((form) => form !== ""),
        });
      }
      continue;
    }
    const missing = needed.filter((form) => !forms.has(form));
    const unexpected = [...forms].filter(
      (form) => !needed.includes(form as PluralForm)
    );
    if (missing.length > 0 || unexpected.length > 0) {
      problems.push({ base, missing, unexpected });
    }
  }
  return problems;
}
