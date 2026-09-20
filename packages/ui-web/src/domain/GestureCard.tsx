import { Heart } from "lucide-react";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { cn } from "../lib/cn";

/**
 * A gesture as a card needs it: already loaded, already flattened.
 *
 * Nothing in this package fetches, so this is the shape a page hands down
 * rather than a Payload document. `categories` is optional because a gesture
 * can legitimately have none, and `playbackId` because a gesture whose video
 * is still processing has none yet.
 */
export interface GestureSummary {
  id: string;
  name: string;
  categories?: readonly { id: string; name: string }[];
  playbackId?: string | null;
}

export type GestureCardProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  gesture: GestureSummary;
  /** Renders the favourite control. Without it there is nothing to press. */
  onFavorite?: (id: string) => void;
  isFavorite?: boolean;
  favoriteLabel?: string;
  /**
   * Wraps the gesture's name in whatever link the consumer's router provides.
   *
   * This package must not import a `Link` — it has no router and no business
   * knowing which one the app uses — so navigation arrives by composition. A
   * card that gets one is a control, and takes `Card`'s `interactive`
   * variant with it.
   */
  renderLink?: (children: ReactNode) => ReactNode;
};

/**
 * One gesture in a list.
 *
 * **Long names are the reason this component has a layout at all.** Gesture
 * names run from two characters to a full phrase, and the seed fixtures
 * include "Aangenaam kennis met je te maken" for exactly this. Three things
 * keep one inside the card, and all three have to be present together:
 *
 * - `truncate` on the heading, which is the element that holds the text;
 * - `min-w-0` on the flex child around it, because a flex item's default
 *   `min-width: auto` refuses to shrink below its content and quietly
 *   defeats the `truncate` above it;
 * - `overflow-hidden` on the card, so nothing escapes the rounded edge.
 *
 * The category list wraps rather than pushing the card wide, and each badge
 * clips its own text the same way.
 *
 * The favourite control keeps **one** accessible name in both states and
 * reports the state through `aria-pressed`. Relabelling a toggle between
 * "add" and "remove" reads as a different control each time it is pressed;
 * `aria-pressed` is what a screen reader announces the state from.
 */
export const GestureCard = forwardRef<HTMLDivElement, GestureCardProps>(
  (
    {
      className,
      gesture,
      onFavorite,
      isFavorite = false,
      favoriteLabel = "Favoriet",
      renderLink,
      ...props
    },
    ref
  ) => {
    const categories = gesture.categories ?? [];

    return (
      <Card
        className={cn("overflow-hidden", className)}
        interactive={renderLink != null}
        ref={ref}
        {...props}
      >
        <div className="flex items-start gap-3 p-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-foreground text-md">
              {renderLink == null ? gesture.name : renderLink(gesture.name)}
            </h3>
            {categories.length === 0 ? null : (
              <ul className="mt-2 flex flex-wrap gap-1">
                {categories.map((category) => (
                  <li className="min-w-0" key={category.id}>
                    <Badge className="max-w-full truncate" size="sm">
                      {category.name}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {onFavorite == null ? null : (
            <Button
              aria-label={favoriteLabel}
              aria-pressed={isFavorite}
              className="shrink-0"
              onClick={() => onFavorite(gesture.id)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Heart
                aria-hidden="true"
                className={cn("size-5", isFavorite && "fill-current")}
              />
            </Button>
          )}
        </div>
      </Card>
    );
  }
);

GestureCard.displayName = "GestureCard";
