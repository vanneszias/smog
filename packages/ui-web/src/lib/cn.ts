import { tokens } from "@smog/styles/tokens";
import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's default scales. The SMOG theme
 * replaces them (`text-body` is a font size, `shadow-1` an elevation), so
 * without this `cn("text-body", "text-primary")` would drop the size as a
 * colour conflict.
 */
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      duration: [{ duration: Object.keys(tokens.motion.duration) }],
      ease: [{ ease: Object.keys(tokens.motion.easing) }],
    },
    theme: {
      "font-weight": Object.keys(tokens.fontWeight),
      radius: Object.keys(tokens.radius),
      shadow: Object.keys(tokens.elevation),
      spacing: Object.keys(tokens.spacing),
      text: Object.keys(tokens.fontSize),
    },
  },
});

/** Joins class names and resolves Tailwind conflicts; the last class wins. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
