/** The languages screen's shapes (phase 10b task 4), admin only to write. Client-safe. */
import { localeCodeSchema } from "@smog/config/locale";
import { z } from "zod";

export const LANGUAGE_NAME_MAX = 80;

export const languageRowSchema = z.object({
  code: z.string(),
  enabled: z.boolean(),
  /** What `Intl` formats with (`nl-BE`). */
  intlTag: z.string(),
  isDefault: z.boolean(),
  /** The language's own name. */
  name: z.string(),
  sortOrder: z.number().int(),
});
export type LanguageRow = z.infer<typeof languageRowSchema>;

export const languagesListSchema = z.object({
  items: z.array(languageRowSchema),
});
export type LanguagesList = z.infer<typeof languagesListSchema>;

const nameSchema = z.string().trim().min(1).max(LANGUAGE_NAME_MAX);
const intlTagSchema = z.string().trim().min(2).max(35);
const sortOrderSchema = z.number().int().min(0).max(10_000);

export const languageCreateInputSchema = z.object({
  code: localeCodeSchema,
  enabled: z.boolean().default(true),
  intlTag: intlTagSchema,
  name: nameSchema,
  /** Omitted: after the last language. */
  sortOrder: sortOrderSchema.optional(),
});
export type LanguageCreateInput = z.input<typeof languageCreateInputSchema>;

export const LANGUAGE_PATCH_FIELDS = [
  "enabled",
  "intlTag",
  "name",
  "sortOrder",
] as const;

export const languageUpdateInputSchema = z.object({
  code: localeCodeSchema,
  enabled: z.boolean().optional(),
  intlTag: intlTagSchema.optional(),
  name: nameSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});
export type LanguageUpdateInput = z.input<typeof languageUpdateInputSchema>;

/** `CONFLICT` of a create: the code is taken. */
export const languageConflictDataSchema = z.object({
  reason: z.literal("exists"),
});

/** `INVALID_STATE` of an update: the default language cannot be disabled. */
export const languageInvalidStateDataSchema = z.object({
  reason: z.literal("defaultLanguage"),
});
export type LanguageRefusal = z.infer<
  typeof languageInvalidStateDataSchema
>["reason"];
