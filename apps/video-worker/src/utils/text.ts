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
