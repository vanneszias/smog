const EDITING_SELECTOR =
  "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox'], [role='searchbox'], [role='combobox']";

/**
 * Whether a keystroke is for a text field (or another editor), not for a
 * page shortcut: the target is, or sits inside, an input, textarea, select,
 * contenteditable or ARIA textbox widget.
 */
export function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || target.closest(EDITING_SELECTOR) !== null;
}
