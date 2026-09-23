/**
 * The artwork in one fixed colour: every `currentColor` paint replaced.
 *
 * Its own module so the tests can compare a committed output against what the
 * generator would write now, without importing the generator (which runs on
 * import and needs sharp).
 */
export function recolour(svg: string, colour: string): string {
  return svg.replaceAll("currentColor", colour);
}
