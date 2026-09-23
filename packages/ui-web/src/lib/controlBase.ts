/**
 * The classes a typed text control shares, so `Input` and `Textarea` cannot
 * drift apart.
 *
 * Border role: a text control's edge is the only thing saying where the
 * control is, so it is the functional `border` (3:1 against both background
 * and surface, asserted in `@smog/styles`), never the decorative
 * `border-subtle`. See the three border roles in
 * `packages/styles/src/tokens.ts`.
 *
 * Not re-exported from the package entry — this is a shared implementation
 * detail of two components, not a public API.
 */
export const CONTROL_BASE =
  "w-full rounded-md border border-border bg-surface px-3 text-foreground transition-colors placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/** The `invalid` variant, identical on both controls. */
export const CONTROL_INVALID = {
  true: "border-danger focus-visible:ring-danger",
  false: "",
} as const;

/**
 * Whether an `aria-invalid` value means "invalid".
 *
 * `Field` wires `aria-invalid` onto whatever control it wraps and knows
 * nothing about the `invalid` variant, so the control derives its own styling
 * from the attribute. Without this an errored field is announced correctly and
 * looks perfectly fine.
 */
export function isAriaInvalid(
  value: boolean | "true" | "false" | "grammar" | "spelling" | undefined
): boolean {
  return value !== undefined && value !== false && value !== "false";
}
