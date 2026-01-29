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
 * FFmpeg's drawtext filter requires specific character escaping to prevent:
 * 1. Filter parsing errors (single quotes, colons, backslashes)
 * 2. Format string injection (percent signs)
 * 3. Command injection attacks
 *
 * Security considerations:
 * - Escapes all special characters that have meaning in FFmpeg filters
 * - Prevents command injection by proper escaping
 * - Handles Unicode characters safely
 *
 * @param text - The text to escape
 * @returns Safely escaped text for FFmpeg drawtext filter
 *
 * @see https://ffmpeg.org/ffmpeg-filters.html#drawtext-1
 */
export const escapeFFmpegText = (text: string): string => {
  // Validate input - only allow printable characters and newlines
  const sanitized = text.replace(/[^\x20-\x7E\u00A0-\uFFFF\n]/g, "");

  // Escape special characters for FFmpeg drawtext filter
  // Order is important: escape backslash first, then other characters
  return sanitized
    .replace(/\\/g, "\\\\\\\\") // Backslash needs double escaping for both shell and FFmpeg
    .replace(/'/g, "'\\\\\\''") // Single quote: close quote, escape, reopen
    .replace(/:/g, "\\\\:") // Colon is a parameter separator in FFmpeg
    .replace(/%/g, "\\\\%") // Percent signs are format specifiers
    .replace(/\[/g, "\\\\[") // Square brackets have special meaning
    .replace(/\]/g, "\\\\]"); // Square brackets have special meaning
};
