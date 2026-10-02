import type { TranslationKey } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import type { ListItem } from "@smog/lists/schema";
import {
  GestureRow,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  useToast,
} from "@smog/ui-web";
import { ArrowDown, ArrowUp, Ellipsis, Trash2 } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import {
  type ReorderEvent,
  type ReorderPosition,
  SortableList,
  type SortableRowArgs,
} from "@/components/sortable-list";
import { gestureHref, RouterLink } from "../links";
import { type Hearts, useHeart } from "../use-hearts";

interface SortableItemsProps {
  hearts: Hearts;
  items: readonly ListItem[];
  onRemove: (gestureId: string) => Promise<void>;
  /** The complete new order (every item once). */
  onReorder: (gestureIds: readonly string[]) => Promise<void>;
}

const REORDER_KEYS = {
  cancelled: "lists.reorder.cancelled",
  dropped: "lists.reorder.dropped",
  moved: "lists.reorder.moved",
  picked: "lists.reorder.picked",
} as const satisfies Record<ReorderEvent, TranslationKey>;

function ItemRow({
  dragHandle,
  hearts,
  isDragging,
  item,
  moveDown,
  moveUp,
  onRemove,
}: SortableRowArgs<ListItem> & {
  hearts: Hearts;
  onRemove: (gestureId: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const heart = useHeart(hearts, item.id);
  const remove = useCallback(() => onRemove(item.id), [item.id, onRemove]);
  return (
    <GestureRow
      className={isDragging ? "bg-surface-raised shadow-2" : undefined}
      dragHandle={dragHandle}
      favorite={heart.active}
      gesture={item}
      href={gestureHref(item.slug)}
      linkComponent={RouterLink}
      onFavoriteToggle={heart.onToggle}
      trailing={
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              icon={<Ellipsis />}
              label={t("lists.itemActions", { name: item.name })}
            />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem
              disabled={!moveUp}
              icon={<ArrowUp />}
              onSelect={moveUp ?? undefined}
            >
              {t("lists.moveUp")}
            </MenuItem>
            <MenuItem
              disabled={!moveDown}
              icon={<ArrowDown />}
              onSelect={moveDown ?? undefined}
            >
              {t("lists.moveDown")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} onSelect={remove} variant="danger">
              {t("lists.removeItem")}
            </MenuItem>
          </MenuContent>
        </Menu>
      }
    />
  );
}

/**
 * A list's gestures in order, reordered by dragging the handle (pointer or
 * keyboard: space, the arrows, space) or with "move up/down" in the row
 * menu (spec §16 flow 2), through the shared `SortableList`. The new order
 * shows at once and rolls back if the hook rejects it (a stale list gets
 * `INVALID_STATE`).
 */
export function SortableItems({
  hearts,
  items,
  onRemove,
  onReorder,
}: SortableItemsProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const remove = useCallback(
    (gestureId: string): void => {
      onRemove(gestureId).catch((error: unknown) => {
        console.error("[lists] Failed to remove a gesture:", error);
        toast({ title: t("states.actionFailed"), variant: "danger" });
      });
    },
    [onRemove, t, toast]
  );
  const announce = useCallback(
    (event: ReorderEvent, position: ReorderPosition) =>
      t(REORDER_KEYS[event], { ...position }),
    [t]
  );
  const renderRow = useCallback(
    (args: SortableRowArgs<ListItem>) => (
      <ItemRow {...args} hearts={hearts} onRemove={remove} />
    ),
    [hearts, remove]
  );
  return (
    <SortableList
      announce={announce}
      failedMessage={t("lists.reorder.failed")}
      instructions={t("lists.reorder.instructions")}
      items={items}
      onReorder={onReorder}
      renderRow={renderRow}
    />
  );
}
