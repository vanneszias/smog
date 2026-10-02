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
import { cn, IconButton, useToast } from "@smog/ui-web";
import { GripVertical } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

/** What a reorder announcement says about the moved item. */
export interface ReorderPosition {
  name: string;
  /** 1-based. */
  position: number;
  total: number;
}

export type ReorderEvent = "cancelled" | "dropped" | "moved" | "picked";

export interface SortableItem {
  id: string;
  name: string;
}

/** What a row gets to render itself. */
export interface SortableRowArgs<Item extends SortableItem> {
  /** The drag handle (pointer and keyboard), labelled with the item's name. */
  dragHandle: ReactNode;
  index: number;
  isDragging: boolean;
  item: Item;
  /** `null` at the top or the bottom. */
  moveDown: (() => void) | null;
  moveUp: (() => void) | null;
  total: number;
}

export interface SortableListProps<Item extends SortableItem> {
  /** The live-region text for a drag event (`t(KEYS[event], position)`). */
  announce: (event: ReorderEvent, position: ReorderPosition) => string;
  className?: string;
  /** The toast when `onReorder` rejects (the order then rolls back). */
  failedMessage: string;
  /** The screen-reader instructions for the drag handle. */
  instructions: string;
  items: readonly Item[];
  /** The complete new order (every item once). */
  onReorder: (ids: readonly string[]) => Promise<unknown>;
  renderRow: (args: SortableRowArgs<Item>) => ReactNode;
}

function SortableEntry<Item extends SortableItem>({
  index,
  item,
  onMove,
  renderRow,
  total,
}: {
  index: number;
  item: Item;
  onMove: (from: number, to: number) => void;
  renderRow: SortableListProps<Item>["renderRow"];
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
  const moveUp = useCallback(() => onMove(index, index - 1), [index, onMove]);
  const moveDown = useCallback(() => onMove(index, index + 1), [index, onMove]);
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
      {renderRow({
        dragHandle: (
          <IconButton
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none active:cursor-grabbing"
            icon={<GripVertical />}
            label={t("a11y.dragHandleFor", { name: item.name })}
            ref={setActivatorNodeRef}
          />
        ),
        index,
        isDragging,
        item,
        moveDown: index < total - 1 ? moveDown : null,
        moveUp: index > 0 ? moveUp : null,
        total,
      })}
    </li>
  );
}

/**
 * An ordered list reordered by dragging the handle (pointer, or keyboard:
 * space, the arrows, space) or with "move up/down" (each row puts them in
 * its menu), with every move announced (spec §16 flow 2). The new order
 * shows at once and rolls back with a toast if `onReorder` rejects. Lists
 * and the admin categories use it.
 */
export function SortableList<Item extends SortableItem>({
  announce,
  className,
  failedMessage,
  instructions,
  items,
  onReorder,
  renderRow,
}: SortableListProps<Item>): ReactNode {
  const { toast } = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  // The order just asked for, until the data catches up.
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
        console.error("[reorder] Failed to save the new order:", error);
        setOrder(null);
        toast({ title: failedMessage, variant: "danger" });
      });
    },
    [failedMessage, onReorder, toast]
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
  // A drag is announced by dnd-kit; a menu move ("Move up/down") here.
  const [moved, setMoved] = useState("");
  const menuMove = useCallback(
    (from: number, to: number): void => {
      const id = ids[from];
      if (to < 0 || to >= ids.length || from === to || id === undefined) {
        return;
      }
      move(from, to);
      setMoved(
        announce("dropped", {
          name: byId.get(id)?.name ?? "",
          position: to + 1,
          total: ids.length,
        })
      );
    },
    [announce, byId, ids, move]
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
    const describe = (id: UniqueIdentifier | undefined): ReorderPosition => ({
      name: byId.get(String(id))?.name ?? "",
      position: ids.indexOf(String(id)) + 1,
      total: ids.length,
    });
    const announcements: Announcements = {
      onDragCancel: ({ active }) => announce("cancelled", describe(active.id)),
      onDragEnd: ({ active, over }) =>
        announce("dropped", {
          ...describe(active.id),
          position: describe(over?.id ?? active.id).position,
        }),
      onDragOver: ({ active, over }) =>
        announce("moved", {
          ...describe(active.id),
          position: describe(over?.id ?? active.id).position,
        }),
      onDragStart: ({ active }) => announce("picked", describe(active.id)),
    };
    return {
      announcements,
      screenReaderInstructions: { draggable: instructions },
    };
  }, [announce, byId, ids, instructions]);

  return (
    <DndContext
      accessibility={accessibility}
      collisionDetection={closestCenter}
      onDragEnd={end}
      sensors={sensors}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className={cn("flex flex-col gap-1", className)}>
          {shown.map((item, index) => (
            <SortableEntry
              index={index}
              item={item}
              key={item.id}
              onMove={menuMove}
              renderRow={renderRow}
              total={shown.length}
            />
          ))}
        </ol>
      </SortableContext>
      <div aria-live="polite" className="sr-only" role="status">
        {moved}
      </div>
    </DndContext>
  );
}
