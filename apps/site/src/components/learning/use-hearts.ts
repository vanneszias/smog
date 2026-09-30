import { useFavorites } from "@smog/favorites/client";
import { useTranslation } from "@smog/i18n/react";
import { useToast } from "@smog/ui-web";
import { useCallback } from "react";

export interface Hearts {
  isFavorite: (gestureId: string) => boolean;
  /** Flips the favorite at once; a failed flip is rolled back and toasted. */
  toggle: (gestureId: string) => void;
}

/**
 * The heart on every card and row: `useFavorites` without its items (the
 * device for guests, the account when signed in).
 */
export function useHearts(): Hearts {
  const { t } = useTranslation();
  const { toast } = useToast();
  const favorites = useFavorites({ items: false });
  const { toggle: flip } = favorites;
  const toggle = useCallback(
    (gestureId: string): void => {
      flip(gestureId).catch((error: unknown) => {
        console.error("[favorites] Failed to change a favorite:", error);
        toast({ title: t("states.actionFailed"), variant: "danger" });
      });
    },
    [flip, t, toast]
  );
  return { isFavorite: favorites.isFavorite, toggle };
}

/** The heart of one gesture: a stable `onToggle` for a card or row. */
export function useHeart(
  hearts: Hearts,
  gestureId: string
): { active: boolean; onToggle: () => void } {
  const { toggle } = hearts;
  const onToggle = useCallback(() => toggle(gestureId), [gestureId, toggle]);
  return { active: hearts.isFavorite(gestureId), onToggle };
}
