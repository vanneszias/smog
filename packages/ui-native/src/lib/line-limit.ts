import { useWindowDimensions } from "react-native";

/** From this text scale on (iOS Larger Text, Android font size) a line wraps. */
const LARGE_TEXT_SCALE = 1.3;

/**
 * The `numberOfLines` of text that is cut off with an ellipsis at normal
 * sizes, so a name or an address stays on one line in a row. Large text must
 * not lose information to that ellipsis (WCAG 1.4.4): from a font scale of
 * 1.3 the limit is dropped and the text wraps. Use it instead of a literal
 * `numberOfLines` (`a11y-source.test.ts` holds the kit to that).
 */
export function useLineLimit(lines: number): number | undefined {
  const { fontScale } = useWindowDimensions();
  return fontScale >= LARGE_TEXT_SCALE ? undefined : lines;
}
