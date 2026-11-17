import { handSvgs } from "@smog/brand/svg";
import { cn } from "@smog/ui-web";
import { type ReactNode, useLayoutEffect, useRef } from "react";

/** Set once the hand has drawn itself in this browser session. */
const DRAWN_KEY = "smog:hero-hand-drawn";

const PATH_TAG = /<(path|line|polyline|polygon|circle|ellipse)\b/g;

/**
 * The pointing-across hand (find) with each drawn part numbered: `--i` is
 * its place from wrist to fingertip and `--n` the count, so the stroke
 * reveal in `styles.css` draws the parts one after another. Built once.
 */
const POINTING_HAND = (() => {
  const svg = handSvgs[1] ?? "";
  let index = 0;
  const numbered = svg.replace(PATH_TAG, (_match, tag: string) => {
    const part = `<${tag} style="--i:${index}"`;
    index += 1;
    return part;
  });
  return numbered.replace("<svg ", `<svg style="--n:${index}" `);
})();

/**
 * Whether the hand is already drawn in this session: read from session
 * storage once per page load (a second mount in the same load, React's
 * strict mode, gets the same answer), and true once a draw has ended.
 */
let drawn: boolean | undefined;

function drawnBefore(): boolean {
  if (drawn === undefined) {
    try {
      drawn = window.sessionStorage.getItem(DRAWN_KEY) === "1";
      window.sessionStorage.setItem(DRAWN_KEY, "1");
    } catch {
      // Storage blocked: draw on every page load rather than never.
      drawn = false;
    }
  }
  return drawn;
}

function markDrawn(): void {
  drawn = true;
}

/**
 * The home hero's hand: the pointing-across hand (find), mirrored so it
 * points back at the search field, that draws itself once per browser
 * session from wrist to fingertip. The drawing starts with the first
 * paint (CSS, `.hero-hand`), so the server's HTML needs no script and the
 * box never changes size. Later in the session the animation is finished
 * before the browser paints. Under reduced motion it is simply there.
 * Decorative: hidden from assistive technology.
 */
export function HeroHand({ className }: { className?: string }): ReactNode {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    if (!drawnBefore()) {
      // Back on home later in this page load: no second drawing.
      node.addEventListener("animationend", markDrawn, { once: true });
      return () => node.removeEventListener("animationend", markDrawn);
    }
    if (typeof node.getAnimations === "function") {
      for (const animation of node.getAnimations({ subtree: true })) {
        animation.finish();
      }
    }
  }, []);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "hero-hand inline-flex shrink-0 -scale-x-100 *:h-full *:w-auto",
        className
      )}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: generated, trusted artwork from @smog/brand
      dangerouslySetInnerHTML={{ __html: POINTING_HAND }}
      data-slot="hero-hand"
      ref={ref}
    />
  );
}
