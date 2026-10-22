/**
 * Class fragments for controls on the green header surface (`bg-sidebar`,
 * white text): the registry's ghost button and the kit's icon button paint
 * for the warm page, so on green they take the sidebar roles for text, hover
 * wash and focus ring (the white ring, contrast-checked in `contrast.ts`).
 */

/** A text button (`Button variant="ghost"`). */
export const GREEN_BUTTON =
  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent dark:hover:bg-sidebar-accent focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar";

/** An icon button (`IconButton variant="ghost"`): its wash is a pseudo-element. */
export const GREEN_ICON_BUTTON =
  "text-sidebar-foreground before:bg-sidebar-foreground focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar";
