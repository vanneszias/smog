import { DEFAULT_LOCALE, type Locale } from "@smog/config/constants";
import { type Messages, resources } from "./keys";

/**
 * The editable layer over the shipped catalogues (phase 10b ruling 1): the
 * `ui_string` rows, per language, as flat dotted keys (`auth.errors.generic`,
 * plural forms `auth.import.favorites_one`). Plain data, safe to send to the
 * browser and to cache on the device; it never contains the shipped base.
 */
export type CatalogueOverlay = Readonly<
  Record<Locale, Readonly<Record<string, string>>>
>;

export interface MessageTree {
  [key: string]: string | MessageTree;
}

/** The nested messages of the shipped catalogue of `locale`; `{}` for a language that ships none. */
export function shippedMessages(locale: Locale): MessageTree {
  const shipped = (resources as Record<string, { translation: Messages }>)[
    locale
  ];
  return (shipped?.translation ?? {}) as unknown as MessageTree;
}

/** Whether `locale` ships a catalogue in the bundle. */
export function isShippedLocale(locale: Locale): boolean {
  return Object.hasOwn(resources, locale);
}

/** `{ a: { b: "x" } }` to `{ "a.b": "x" }`. */
export function flattenMessages(
  tree: MessageTree,
  prefix = "",
  out: Record<string, string> = {}
): Record<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out[path] = value;
    } else {
      flattenMessages(value, path, out);
    }
  }
  return out;
}

/** The object at `part` under `node`, created or copied (once) so it is safe to write; `null` where a string is in the way. */
function writableChild(
  node: MessageTree,
  part: string,
  copied: Set<MessageTree>
): MessageTree | null {
  const next = node[part];
  if (typeof next === "string") {
    return null;
  }
  if (next !== undefined && copied.has(next)) {
    return next;
  }
  const own: MessageTree = next === undefined ? {} : { ...next };
  copied.add(own);
  node[part] = own;
  return own;
}

/**
 * `base` with the flat `values` written over it, copying only the objects
 * along each written path (the shipped catalogue is shared and never
 * mutated). A blank value is ignored (an empty translation is "missing", it
 * never renders empty), and so is a key that would replace a branch with a
 * string or a string with a branch.
 */
export function applyValues(
  base: MessageTree,
  values: Readonly<Record<string, string>>
): MessageTree {
  const root: MessageTree = { ...base };
  const copied = new Set<MessageTree>([root]);
  for (const [key, value] of Object.entries(values)) {
    const path = key.split(".");
    const leaf = path.pop();
    if (value.trim() === "" || !leaf || path.includes("")) {
      continue;
    }
    let node: MessageTree | null = root;
    for (const part of path) {
      node = node && writableChild(node, part, copied);
    }
    if (node && typeof node[leaf] !== "object") {
      node[leaf] = value;
    }
  }
  return root;
}

/**
 * The i18next resources of one request: the active language and the default
 * one (the fallback), each the shipped catalogue with the overlay on top.
 * Resolution is then: overlay of the language, shipped value of the
 * language, overlay of the default language, shipped default value.
 */
export function buildResources(
  locale: Locale,
  overlay: CatalogueOverlay = {}
): Record<string, { translation: MessageTree }> {
  const out: Record<string, { translation: MessageTree }> = {};
  for (const language of new Set([locale, DEFAULT_LOCALE])) {
    const rows = overlay[language];
    const base = shippedMessages(language);
    out[language] = { translation: rows ? applyValues(base, rows) : base };
  }
  return out;
}

/** Only the languages in `locales` (the root loader hands over the active and the default one). */
export function pickOverlay(
  overlay: CatalogueOverlay,
  locales: readonly Locale[]
): CatalogueOverlay {
  const out: Record<Locale, Readonly<Record<string, string>>> = {};
  for (const locale of locales) {
    const rows = overlay[locale];
    if (rows && Object.keys(rows).length > 0) {
      out[locale] = rows;
    }
  }
  return out;
}
