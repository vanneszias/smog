import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { GestureCard } from "./gesture-card";
import type { GestureCardData } from "./types";

export interface GestureGridProps<T extends GestureCardData>
  extends Omit<ComponentProps<"ul">, "children"> {
  items: readonly T[];
  /** Renders one gesture (a GestureCard without link or heart by default). */
  renderItem?: (item: T, index: number) => ReactNode;
}

/** Gesture cards in a responsive grid: 2 columns on phones, up to 5 on desktop. */
export function GestureGrid<T extends GestureCardData>({
  className,
  items,
  renderItem,
  ...props
}: GestureGridProps<T>): ReactNode {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5",
        className
      )}
      {...props}
    >
      {items.map((item, index) => (
        <li className="flex min-w-0 *:flex-1" key={item.id}>
          {renderItem ? (
            renderItem(item, index)
          ) : (
            <GestureCard gesture={item} />
          )}
        </li>
      ))}
    </ul>
  );
}
