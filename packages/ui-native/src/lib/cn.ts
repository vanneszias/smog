import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The native twin of `packages/ui-web/src/lib/cn.ts`, and deliberately the
 * same two libraries rather than a hand-rolled join.
 *
 * `tailwind-merge` is what makes `className` behave the way a web consumer
 * expects: without it, two conflicting utilities both reach NativeWind and
 * the winner is whichever the compiler emitted last — an ordering nobody at
 * the call site can see.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
