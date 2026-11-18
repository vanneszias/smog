import { useEffect, useState, useSyncExternalStore } from "react";

/** The CSS variable on `<html>` with the height of the fixed bars. */
const OVERLAY_BOTTOM_VAR = "--overlay-bottom";

/** The heights reserved by every mounted bar (the consent banner, …). */
const reserved = new Map<symbol, { height: number; overlay: boolean }>();

/** Whether a fixed overlay bar (the consent banner) is on screen now. */
let overlayOpen = false;
const overlayListeners = new Set<() => void>();

function subscribeOverlay(onChange: () => void): () => void {
  overlayListeners.add(onChange);
  return () => overlayListeners.delete(onChange);
}

/**
 * Whether a fixed bar sits at the bottom of the viewport now (the consent
 * banner). A page's own bottom bar (the sponsor wizard's selection bar)
 * steps back into the flow while it does: one bottom bar at a time, so the
 * two never stack over the page on a phone. `false` on the server.
 */
export function useOverlayBarOpen(): boolean {
  return useSyncExternalStore(
    subscribeOverlay,
    () => overlayOpen,
    () => false
  );
}

function applyReservedSpace(): void {
  let total = 0;
  let overlay = 0;
  for (const bar of reserved.values()) {
    total += bar.height;
    if (bar.overlay) {
      overlay += bar.height;
    }
  }
  const { style } = document.documentElement;
  style.scrollPaddingBottom = total > 0 ? `${total}px` : "";
  if (overlay > 0) {
    style.setProperty(OVERLAY_BOTTOM_VAR, `${overlay}px`);
  } else {
    style.removeProperty(OVERLAY_BOTTOM_VAR);
  }
  if (overlayOpen !== overlay > 0) {
    overlayOpen = overlay > 0;
    for (const listener of overlayListeners) {
      listener();
    }
  }
}

/**
 * Keeps room at the bottom of the page for a bar that sits over it (WCAG
 * 2.4.11, focus not obscured): the bar's height, measured as it changes,
 * goes into `scroll-padding-bottom`, so focus is never scrolled under it.
 * Bars add up (the consent banner and the sponsor wizard's selection bar
 * can show together). An `overlay` bar (fixed, out of the flow) also adds
 * its height to `--overlay-bottom`, which the footer takes as its bottom
 * padding: the bar floats over the footer's own surface, and the footer's
 * last links can still be scrolled clear of it, without a strip of page
 * after the footer.
 */
export function useReservedSpace({
  overlay = false,
}: {
  overlay?: boolean;
} = {}): (element: HTMLElement | null) => void {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!element) {
      setHeight(0);
      return;
    }
    const measure = (): void => setHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  useEffect(() => {
    const key = Symbol("reserved-space");
    reserved.set(key, { height, overlay });
    applyReservedSpace();
    return () => {
      reserved.delete(key);
      applyReservedSpace();
    };
  }, [height, overlay]);
  return setElement;
}
