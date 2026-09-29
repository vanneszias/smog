/**
 * A token hex as css-interop renders it (`rgba(r, g, b, 1)`), so tests
 * compare against `tokens` instead of writing colours out.
 */
export function rgba(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16)
  );
  return `rgba(${r}, ${g}, ${b}, 1)`;
}
