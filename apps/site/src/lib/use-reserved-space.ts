import { useEffect, useState } from "react";

/** The heights reserved by every mounted bar (the consent banner, …). */
const reserved = new Map<symbol, number>();

function applyScrollPadding(): void {
  let total = 0;
  for (const height of reserved.values()) {
    total += height;
  }
  document.documentElement.style.scrollPaddingBottom =
    total > 0 ? `${total}px` : "";
}

/**
 * Keeps room at the bottom of the page for a bar that sits over it (WCAG
 * 2.4.11, focus not obscured): the bar's height, measured as it changes,
 * goes into `scroll-padding-bottom`, so focus is never scrolled under it.
 * Bars add up (the consent banner and the sponsor wizard's selection bar
 * can show together). `height` is for a fixed bar's in-flow spacer.
 */
export function useReservedSpace(): {
  height: number;
  ref: (element: HTMLElement | null) => void;
} {
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
    reserved.set(key, height);
    applyScrollPadding();
    return () => {
      reserved.delete(key);
      applyScrollPadding();
    };
  }, [height]);
  return { height, ref: setElement };
}
