/**
 * @fileoverview Pure helper utilities for sponsorship calculations and formatting.
 *
 * All functions are side-effect-free and fully unit-testable.
 *
 * @example
 * import { readFileAsBase64 } from "@/routes/sponsors/utils/sponsorshipHelpers";
 * const base64 = await readFileAsBase64(logoFile);
 */

/**
 * Read a `File` as a base-64 encoded data URL.
 *
 * @param file - The file to read.
 * @returns A promise that resolves to the data URL string.
 *
 * @example
 * const base64 = await readFileAsBase64(logoFile);
 * // "data:image/png;base64,iVBOR..."
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Create a simulated decelerating progress ticker.
 *
 * The tick function advances progress toward `maxProgress` by a decreasing
 * amount each call, giving a "slowing down" effect as real work completes.
 *
 * @param maxProgress - Maximum simulated progress (e.g. 0.9).
 * @param dampening - Controls deceleration speed (default: 0.08).
 * @returns A tick function that accepts the current progress and returns the next value.
 *
 * @example
 * const tick = createProgressTicker(0.9);
 * const next = tick(current); // each call moves closer to 0.9
 */
export function createProgressTicker(
  maxProgress: number,
  dampening = 0.08
): (current: number) => number {
  return (current: number) => {
    if (current >= maxProgress) {
      return current;
    }
    const remaining = maxProgress - current;
    const increment = remaining * dampening * (0.3 + Math.random() * 0.7);
    return Math.min(current + increment, maxProgress);
  };
}
