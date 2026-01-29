/**
 * Text wrapping utilities for overlay text
 */

/**
 * Wrap text to fit within a maximum character width
 * Inserts \n at word boundaries to create multi-line text
 *
 * @param text - The text to wrap
 * @param maxCharsPerLine - Maximum characters per line (default: 30)
 * @returns Wrapped text with newlines
 */
export const wrapText = (text: string, maxCharsPerLine = 30): string => {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join("\n");
};

/**
 * Calculate line height based on font size
 *
 * @param fontSize - Font size in pixels
 * @param multiplier - Line height multiplier (default: 1.2 for 120%)
 * @returns Line height in pixels
 */
export const calculateLineHeight = (
  fontSize: number,
  multiplier = 1.2
): number => fontSize * multiplier;

/**
 * Split text into lines, preserving existing newlines
 */
export const splitTextIntoLines = (text: string): string[] => text.split("\n");

/**
 * Escape text for safe use in FFmpeg drawtext filter
 *
 * FFmpeg requires multiple levels of escaping as documented at:
 * https://ffmpeg.org/ffmpeg-filters.html#drawtext-1
 *
 * Level 1: Filter option value escaping (for text parameter)
 * - Escape ' and : with backslash
 *
 * Level 2: Filtergraph description escaping
 * - Double the backslashes from level 1
 * - Also escape , (comma) which is a filter separator
 *
 * This function applies both levels since fluent-ffmpeg passes
 * the filter complex string as a command-line argument.
 *
 * Security considerations:
 * - Sanitizes control characters
 * - Prevents filter injection through proper escaping
 * - Handles Unicode characters safely
 *
 * Example from FFmpeg docs:
 * - Input: "this is a 'string': may contain"
 * - Output: "this is a \\\'string\\\'\\: may contain"
 *
 * @param text - The text to escape
 * @returns Safely escaped text for FFmpeg drawtext filter in filtergraph
 */
export const escapeFFmpegText = (text: string): string => {
  // Validate input - only allow printable characters and newlines
  // Remove control characters except newline
  const sanitized = text.replace(/[^\x20-\x7E\u00A0-\uFFFF\n]/g, "");

  // Apply both level 1 and level 2 escaping as per FFmpeg documentation
  // Order is critical: backslash first, then other special characters
  return sanitized
    .replace(/\\/g, "\\\\\\\\") // Backslash: \\ (level 1) -> \\\\ (level 2)
    .replace(/'/g, "\\\\\\'") // Single quote: \' (level 1) -> \\\' (level 2)
    .replace(/:/g, "\\\\:") // Colon: \: (level 1) -> \\: (level 2)
    .replace(/,/g, "\\\\,") // Comma: needs escaping at filtergraph level
    .replace(/%/g, "\\\\%") // Percent: format specifier
    .replace(/\[/g, "\\\\[") // Square bracket: filtergraph syntax
    .replace(/\]/g, "\\\\]"); // Square bracket: filtergraph syntax
};
