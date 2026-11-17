/**
 * Class fragments for controls on the deep green header (`bg-sidebar`,
 * white text): the registry's ghost button and the kit's icon button paint
 * for the page, so on green they take the sidebar roles for text, hover wash
 * and focus ring (the white ring, contrast-checked in `contrast.ts`).
 *
 * Green says where you are, orange says do it: the current section carries
 * the orange `sidebar-primary` mark under its label on the plain green (no
 * wash: the orange reaches 3:1 only on `sidebar`, the wash is hover's), and
 * the header's one filled action is orange.
 */

/** A text button (`Button variant="ghost"`); `aria-current="page"` draws the orange mark. */
export const GREEN_BUTTON =
  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent dark:hover:bg-sidebar-accent aria-[current=page]:font-semibold aria-[current=page]:hover:bg-transparent aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-5 aria-[current=page]:after:bottom-1 aria-[current=page]:after:h-1 aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-sidebar-primary focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar";

/** An icon button (`IconButton variant="ghost"`): its wash is a pseudo-element. */
export const GREEN_ICON_BUTTON =
  "text-sidebar-foreground before:bg-sidebar-foreground focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar";

/**
 * The header's one filled action (`Button variant="action"`, the guest's
 * "Sign in"): the orange fill under dark ink, with the white ring on green.
 */
export const GREEN_PRIMARY_BUTTON =
  "border-transparent bg-highlight text-highlight-foreground hover:bg-highlight/85 focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar";
