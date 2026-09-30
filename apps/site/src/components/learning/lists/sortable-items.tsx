import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import {
  ArrowDown,
  ArrowUp,
  Ellipsis,
  GripVertical,
  Trash2,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { gestureHref, RouterLink } from "../links";
import { type Hearts, useHeart } from "../use-hearts";

interface SortableItemsProps {
  hearts: Hearts;
  items: readonly ListItem[];
  onRemove: (gestureId: string) => Promise<void>;
  /** The complete new order (every item once). */
  onReorder: (gestureIds: readonly string[]) => Promise<void>;
}

function SortableRow({
  hearts,
  index,
  item,
  onMove,
  onRemove,
  total,
}: {
  hearts: Hearts;
  index: number;
  item: ListItem;
  onMove: (from: number, to: number) => void;
  onRemove: (gestureId: string) => void;
  total: number;
}): ReactNode {
  const { t } = useTranslation();
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });
  const heart = useHeart(hearts, item.id);
  const moveUp = useCallback(() => onMove(index, index - 1), [index, onMove]);
  const moveDown = useCallback(() => onMove(index, index + 1), [index, onMove]);
  const remove = useCallback(() => onRemove(item.id), [item.id, onRemove]);
  const style = useMemo(
    () => ({ transform: CSS.Transform.toString(transform), transition }),
    [transform, transition]
  );
  return (
    <li
      className={isDragging ? "relative z-10" : undefined}
      ref={setNodeRef}
      // dnd-kit moves the row with a transform while it is dragged.
      style={style}
    >
      <GestureRow
        className={isDragging ? "bg-surface-raised shadow-2" : undefined}
        dragHandle={
          <IconButton
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none active:cursor-grabbing"
            icon={<GripVertical />}
            label={`${t("a11y.dragHandle")}: ${item.name}`}
            ref={setActivatorNodeRef}
          />
        }
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
                disabled={index === 0}
                icon={<ArrowUp />}
                onSelect={moveUp}
              >
                {t("lists.moveUp")}
              </MenuItem>
              <MenuItem
                disabled={index === total - 1}
                icon={<ArrowDown />}
                onSelect={moveDown}
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
    </li>
  );
}

/**
 * A list's gestures in order, reordered by dragging the handle (pointer or
 * keyboard: space, the arrows, space) or with "move up/down" in the row
 * menu (spec §16 flow 2). The new order shows at once and rolls back if the
 * hook rejects it (a stale list gets `INVALID_STATE`).
 */
export function SortableItems({
  hearts,
  items,
  onRemove,
  onReorder,
}: SortableItemsProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  // The order just asked for, until the list's data catches up.
  const [order, setOrder] = useState<string[] | null>(null);
  const itemsKey = items.map((item) => item.id).join(",");
  useEffect(() => {
    if (itemsKey) {
      setOrder(null);
    }
  }, [itemsKey]);

  const byId = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const shown = useMemo(
    () =>
      order
        ? order.flatMap((id) => {
            const item = byId.get(id);
            return item ? [item] : [];
          })
        : [...items],
    [byId, items, order]
  );
  const ids = useMemo(() => shown.map((item) => item.id), [shown]);

  const commit = useCallback(
    (next: string[]): void => {
      setOrder(next);
      onReorder(next).catch((error: unknown) => {
        console.error("[lists] Failed to reorder the list:", error);
        setOrder(null);
        toast({ title: t("lists.reorder.failed"), variant: "danger" });
      });
    },
    [onReorder, t, toast]
  );
  const move = useCallback(
    (from: number, to: number): void => {
      if (to < 0 || to >= ids.length || from === to) {
        return;
      }
      commit(arrayMove(ids, from, to));
    },
    [commit, ids]
  );
  const remove = useCallback(
    (gestureId: string): void => {
      onRemove(gestureId).catch((error: unknown) => {
        console.error("[lists] Failed to remove a gesture:", error);
        toast({ title: t("states.actionFailed"), variant: "danger" });
      });
    },
    [onRemove, t, toast]
  );
  const end = useCallback(
    ({ active, over }: DragEndEvent): void => {
      if (over && active.id !== over.id) {
        move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
      }
    },
    [ids, move]
  );

  const accessibility = useMemo(() => {
    const describe = (id: UniqueIdentifier | undefined) => ({
      name: byId.get(String(id))?.name ?? "",
      position: ids.indexOf(String(id)) + 1,
      total: ids.length,
    });
    const announcements: Announcements = {
      onDragCancel: ({ active }) =>
        t("lists.reorder.cancelled", describe(active.id)),
      onDragEnd: ({ active, over }) =>
        t("lists.reorder.dropped", {
          ...describe(active.id),
          position: describe(over?.id ?? active.id).position,
        }),
      onDragOver: ({ active, over }) =>
        t("lists.reorder.moved", {
          ...describe(active.id),
          position: describe(over?.id ?? active.id).position,
        }),
      onDragStart: ({ active }) =>
        t("lists.reorder.picked", describe(active.id)),
    };
    return {
      announcements,
      screenReaderInstructions: { draggable: t("lists.reorder.instructions") },
    };
  }, [byId, ids, t]);

  return (
    <DndContext
      accessibility={accessibility}
      collisionDetection={closestCenter}
      onDragEnd={end}
      sensors={sensors}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-1">
          {shown.map((item, index) => (
            <SortableRow
              hearts={hearts}
              index={index}
              item={item}
              key={item.id}
              onMove={move}
              onRemove={remove}
              total={shown.length}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
