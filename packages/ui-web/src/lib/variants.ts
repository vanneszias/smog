import { cva, type VariantProps } from "class-variance-authority";

/**
 * Class fragments every interactive component shares. They are strings, so
 * `cva` bases and `cn()` calls compose them.
 */

/** The 2 px `focus-ring` ring with a 2 px offset (spec §16). */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * The focus ring on a deep green surface (`bg-sidebar`: the header, the hero,
 * the auth panel, banners): white with a green offset. Put it after
 * `focusRing`; any control on green takes it, never the orange `ring`.
 */
export const focusRingOnGreen =
  "focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar";

/** Colour and shadow changes on hover/press; none under reduced motion. */
export const transition =
  "transition duration-fast ease-standard motion-reduce:transition-none";

/**
 * Press feedback, a kit contract like `focusRing`: a pressed compact control
 * (button, icon button, chip, toggle, the heart) shrinks to
 * `--motion-press-scale` (0.97) over the `transition` fragment's 120 ms and
 * springs back on release, so a tap on a phone (where `hover:` never fires)
 * is felt at once. Only with motion allowed; never on cards, rows or links in
 * text (large surfaces look like they jump).
 */
export const press = "motion-safe:active:scale-(--motion-press-scale)";

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

/**
 * Border and fill of text inputs, selects and textareas: the registry's
 * pill field (`rounded-pill`, a `bg-input/30` wash) with the kit's contracts on
 * top (44 px, the 2 px `focus-ring`, a 3:1 `border-input`).
 */
export const fieldVariants = cva(
  [
    "w-full min-w-0 rounded-pill border border-input bg-card text-body text-foreground placeholder:text-muted-foreground",
    "hover:border-foreground aria-invalid:border-destructive",
    focusRing,
    transition,
    disabled,
    "disabled:cursor-not-allowed",
  ],
  {
    defaultVariants: { size: "md" },
    variants: {
      size: {
        lg: "min-h-12 px-5",
        md: "min-h-touch px-4",
      },
    },
  }
);

export type FieldVariantProps = VariantProps<typeof fieldVariants>;

/** Text tones shared by Text, Badge, ListItem and the states. */
export const toneText = {
  danger: "text-danger-strong",
  default: "text-foreground",
  muted: "text-muted-foreground",
  primary: "text-primary-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
} as const;
