/**
 * How far a heading may grow with the system text size
 * (`maxFontSizeMultiplier`), per step. React Native multiplies every size by
 * the same font scale, up to about 3.1 at iOS's largest accessibility size,
 * so a 40 pt display title would reach 124 pt and break its words in the
 * middle while the body is at 50 pt. Both platforms scale large text less
 * than body text themselves: iOS's Large Title grows 1.8 times and Title 1
 * 2.1 times at that size, and Android 14 scales large sizes non-linearly up
 * to its 200 % maximum. These limits follow that curve and never go below 2
 * (WCAG 1.4.4, resize text to 200 %), so on Android, whose font scale stops
 * at 2, nothing changes; at iOS's accessibility sizes the headings stop
 * growing in the order of their size and stay above the body text. Body,
 * lead, small and caption text and `title-3` are never limited
 * (docs/DECISIONS.md, "Headings stop at twice their size").
 */
export const HEADING_MAX_FONT_SCALE = {
  display: 2,
  "title-1": 2.1,
  "title-2": 2.6,
} as const satisfies Record<string, number>;

/** The limit of one heading step, or none (it scales with the body). */
export function headingMaxFontScale(size: string): number | undefined {
  return (HEADING_MAX_FONT_SCALE as Record<string, number>)[size];
}
