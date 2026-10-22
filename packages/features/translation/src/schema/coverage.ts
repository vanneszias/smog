/** Translation coverage per language (phase 10b task 4): the dashboard card and the screens' header. Client-safe. */
import { z } from "zod";

export const languageCoverageSchema = z.object({
  code: z.string(),
  invalid: z.number().int(),
  isDefault: z.boolean(),
  missing: z.number().int(),
  name: z.string(),
  stale: z.number().int(),
  /** Texts the language could show. */
  total: z.number().int(),
  /** Texts it shows (an override or the shipped text). */
  translated: z.number().int(),
});
export type LanguageCoverage = z.infer<typeof languageCoverageSchema>;

export const coverageSchema = z.object({
  languages: z.array(languageCoverageSchema),
});
export type Coverage = z.infer<typeof coverageSchema>;

/** Whole percent of `translated` in `total`, 100 for an empty catalogue. */
export function coveragePercent(
  row: Pick<LanguageCoverage, "total" | "translated">
): number {
  return row.total === 0 ? 100 : Math.floor((row.translated / row.total) * 100);
}
