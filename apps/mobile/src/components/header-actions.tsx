import { Surface } from "@smog/ui-native";
import type { ReactElement, ReactNode } from "react";

/**
 * The buttons a screen puts in the (green) native header: a `header`
 * Surface, so `IconButton`, `Button`, `FavoriteButton` and text read white
 * on the green and the sheets they open fall back to the page.
 */
export function HeaderActions({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <Surface className="flex-row items-center bg-transparent" tone="header">
      {children}
    </Surface>
  );
}
