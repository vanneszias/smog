import { cva, type VariantProps } from "class-variance-authority";

/**
 * Class fragments every interactive component shares. They are strings, so
 * `cva` bases and `cn()` calls compose them.
 */

/** The 2 px `focus-ring` ring with a 2 px offset (spec §16). */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Colour and shadow changes on hover/press; none under reduced motion. */
export const transition =
  "transition duration-fast ease-standard motion-reduce:transition-none";

/**
 * Grows the hit area of a small control to 44 × 44 px without changing its
 * box: an invisible, centred pseudo-element takes the pointer. The element
 * needs `relative`; Tailwind v4 sets `content` for `after:` itself.
 */
export const hitArea =
  "relative after:absolute after:top-1/2 after:left-1/2 after:size-touch after:-translate-x-1/2 after:-translate-y-1/2";

/**
 * A hover/press state layer: a `foreground` wash over the control, so hover
 * darkens in light mode and lightens in dark mode (the `*-strong` shades
 * equal the base hue in dark, so they cannot carry hover there). Keyed by the
 * control's radius because the layer is a pseudo-element; the element needs
 * `relative`.
 */
const STATE_LAYER =
  "before:pointer-events-none before:absolute before:inset-0 before:bg-foreground before:opacity-0 before:transition-opacity before:duration-fast motion-reduce:before:transition-none hover:before:opacity-8 active:before:opacity-12";

// The radius classes are written out in full so Tailwind's scanner sees them.
export const stateLayer = {
  full: `${STATE_LAYER} before:rounded-full`,
  lg: `${STATE_LAYER} before:rounded-lg`,
  md: `${STATE_LAYER} before:rounded-md`,
  none: STATE_LAYER,
} as const;

/**
 * The vertical-only version of `hitArea`, for small controls packed side by
 * side (SegmentedControl `sm`): 44 px tall, exactly as wide as the control,
 * so neighbours' hit areas never overlap. Only for controls ≥ 44 px wide.
 */
export const hitAreaY =
  "relative after:absolute after:inset-x-0 after:top-1/2 after:h-touch after:-translate-y-1/2";

/** Disabled look for every control. */
export const disabled =
  "disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50";

/** Border and fill of text inputs, selects and textareas. */
export const fieldVariants = cva(
  [
    "w-full rounded-md border bg-surface text-body text-foreground placeholder:text-foreground-muted",
    "border-foreground-muted hover:border-foreground",
    "aria-invalid:border-danger",
    focusRing,
    transition,
    disabled,
  ],
  {
    defaultVariants: { size: "md" },
    variants: {
      size: {
        lg: "min-h-12 px-4",
        md: "min-h-touch px-3",
      },
    },
  }
);

export type FieldVariantProps = VariantProps<typeof fieldVariants>;

/** Text tones shared by Text, Badge, ListItem and the states. */
export const toneText = {
  danger: "text-danger-strong",
  default: "text-foreground",
  muted: "text-foreground-muted",
  primary: "text-primary-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
} as const;
