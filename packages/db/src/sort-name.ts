import { normalizeText } from "@smog/utils";

/**
 * `gesture.sort_name`: the name as the catalogue sorts it (lowercase, no
 * accents), so `Één` sorts with the e's instead of after `Zus`. Every
 * writer of `gesture.name` sets it with this function.
 */
export function gestureSortName(name: string): string {
  return normalizeText(name);
}
