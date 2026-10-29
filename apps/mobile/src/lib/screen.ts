/** Native headers/tabs own system insets; content adds only breathing room. */
export const SCREEN_CONTENT_CLASS_NAME = "pt-2 pb-6";

export const SCREEN_SCROLL_OPTIONS = {
  contentInsetAdjustmentBehavior: "automatic",
  keyboardShouldPersistTaps: "handled",
} as const;
