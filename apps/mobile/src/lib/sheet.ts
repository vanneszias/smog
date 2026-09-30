import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

/** Share of the window a sheet's scrolling part may take. */
const SHEET_SCROLL_SHARE = 0.5;

/**
 * The style of a scrolling list inside a Sheet (categories, share links):
 * at most half the window, so the sheet's title and actions stay on screen.
 */
export function useSheetScrollStyle(): { maxHeight: number } {
  const { height } = useWindowDimensions();
  return useMemo(() => ({ maxHeight: height * SHEET_SCROLL_SHARE }), [height]);
}
