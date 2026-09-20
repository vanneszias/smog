import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and resolves Tailwind conflicts, last one winning.
 *
 * Every component in this package ends its class list with `cn(variants,
 * className)`, which is what makes a consumer's `className` authoritative.
 * `clsx` alone would emit both `bg-primary` and the caller's `bg-red-500` and
 * leave the winner to CSS source order — an override that works or does not
 * depending on how the stylesheet happens to be ordered. `twMerge` drops the
 * loser outright, so the result is decided here rather than in the cascade.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
