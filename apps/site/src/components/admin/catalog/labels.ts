import {
  DEFAULT_LOCALE,
  formatList,
  isLocale,
  type TranslationKey,
} from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { useCallback } from "react";
import type { DraftField } from "./gesture-draft";

/** A list in the page language ("a, b en c"), `Intl.ListFormat`. */
export function useListFormat(): (items: readonly string[]) => string {
  const { i18n } = useTranslation();
  const locale = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
  return useCallback(
    (items: readonly string[]) => formatList(items, locale),
    [locale]
  );
}

/** A form field's label (a table header, the conflict diff's caption). */
export const DRAFT_FIELD_KEYS = {
  categoryIds: "admin.gestures.fields.categoryIds",
  description: "admin.gestures.fields.description",
  keywords: "admin.gestures.fields.keywords",
  name: "admin.gestures.fields.name",
  published: "admin.gestures.editor.published",
  video: "admin.mux.label",
} as const satisfies Record<DraftField, TranslationKey>;

/** A form field inside a sentence ("… replaces the other admin's name"). */
export const DRAFT_FIELD_NAME_KEYS = {
  categoryIds: "admin.gestures.conflict.fieldNames.categoryIds",
  description: "admin.gestures.conflict.fieldNames.description",
  keywords: "admin.gestures.conflict.fieldNames.keywords",
  name: "admin.gestures.conflict.fieldNames.name",
  published: "admin.gestures.conflict.fieldNames.published",
  video: "admin.gestures.conflict.fieldNames.video",
} as const satisfies Record<DraftField, TranslationKey>;
