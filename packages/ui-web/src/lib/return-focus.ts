import { useCallback, useRef } from "react";

interface AutoFocusHandlers {
  onCloseAutoFocus?: (event: Event) => void;
  onOpenAutoFocus?: (event: Event) => void;
}

/**
 * What to return to: the focused element, or, when it is an item of a menu
 * (a dialog opened by a menu item: the item is gone once the menu closes),
 * the button that opened the menu (Radix labels the menu by its trigger).
 */
function openerOf(active: HTMLElement): HTMLElement {
  const labelledBy = active
    .closest('[role="menu"]')
    ?.getAttribute("aria-labelledby");
  return (labelledBy ? document.getElementById(labelledBy) : null) ?? active;
}

/**
 * Returns the focus to the element that had it when a dialog opened.
 *
 * Radix Dialog and AlertDialog focus their `Trigger` on close and prevent
 * FocusScope's own return. A controlled dialog opened from a button, a
 * table row or a menu has no `Trigger`, so the focus fell to `<body>` and a
 * keyboard user lost their place. The opener is remembered when the
 * content mounts (before Radix moves the focus in) and refocused on close
 * while it is still in the document; otherwise Radix's behaviour stands.
 * The caller's own handlers run first and may `preventDefault()`.
 */
export function useReturnFocus({
  onCloseAutoFocus,
  onOpenAutoFocus,
}: AutoFocusHandlers): Required<AutoFocusHandlers> {
  const opener = useRef<HTMLElement | null>(null);
  const handleOpen = useCallback(
    (event: Event): void => {
      const active = document.activeElement;
      opener.current =
        active instanceof HTMLElement && active !== document.body
          ? openerOf(active)
          : null;
      onOpenAutoFocus?.(event);
    },
    [onOpenAutoFocus]
  );
  const handleClose = useCallback(
    (event: Event): void => {
      onCloseAutoFocus?.(event);
      const target = opener.current;
      opener.current = null;
      if (event.defaultPrevented || !target?.isConnected) {
        return;
      }
      event.preventDefault();
      target.focus({ preventScroll: true });
    },
    [onCloseAutoFocus]
  );
  return { onCloseAutoFocus: handleClose, onOpenAutoFocus: handleOpen };
}
