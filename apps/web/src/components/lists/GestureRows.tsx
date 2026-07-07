import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
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
import type { GestureCardData } from "@smog/ui";
import { GripVertical } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GestureRowAction } from "./types";

function GestureRow({
  actions,
  className,
  dragHandle,
  gesture,
  onSelect,
}: {
  actions: GestureRowAction[];
  className?: string;
  dragHandle?: ReactNode;
  gesture: GestureCardData;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "group grid min-h-[64px] items-center gap-3 border-border border-b px-4 py-2.5 transition-colors hover:bg-muted/30 lg:px-5",
        dragHandle
          ? "grid-cols-[auto_minmax(0,1fr)_auto]"
          : "grid-cols-[minmax(0,1fr)_auto]",
        className
      )}
    >
      {dragHandle}
      <button className="min-w-0 text-left" onClick={onSelect} type="button">
        <p className="truncate font-semibold text-base leading-tight">
          {gesture.name}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {gesture.categories
            .filter(Boolean)
            .slice(0, 3)
            .map((category) =>
              category ? (
                <span
                  className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground text-xs"
                  key={category._id}
                >
                  {category.name}
                </span>
              ) : null
            )}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              aria-label={action.label}
              disabled={action.disabled}
              key={action.label}
              onClick={action.onClick}
              size="icon"
              type="button"
              variant={action.variant ?? "ghost"}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function SortableGestureRow({
  actions,
  dragHandleLabel,
  gesture,
  onSelect,
}: {
  actions: GestureRowAction[];
  dragHandleLabel: string;
  gesture: GestureCardData;
  onSelect: () => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: gesture._id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <GestureRow
        actions={actions}
        className={cn(isDragging && "relative z-10 bg-muted/70 shadow-sm")}
        dragHandle={
          <button
            aria-label={dragHandleLabel}
            className="flex h-9 w-8 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
        gesture={gesture}
        onSelect={onSelect}
      />
    </div>
  );
}

export function GestureRows({
  actionsForGesture,
  dragHandleLabel = "Drag to reorder",
  gestures,
  onSelectGesture,
  onReorder,
}: {
  actionsForGesture: (
    gesture: GestureCardData,
    index: number
  ) => GestureRowAction[];
  dragHandleLabel?: string;
  gestures: GestureCardData[];
  onSelectGesture: (gestureId: string) => void;
  onReorder?: (gestures: GestureCardData[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!(over && active.id !== over.id && onReorder)) {
      return;
    }

    const oldIndex = gestures.findIndex((gesture) => gesture._id === active.id);
    const newIndex = gestures.findIndex((gesture) => gesture._id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    onReorder(arrayMove(gestures, oldIndex, newIndex));
  };

  if (onReorder) {
    return (
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={gestures.map((gesture) => gesture._id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="divide-y-0">
            {gestures.map((gesture, index) => (
              <SortableGestureRow
                actions={actionsForGesture(gesture, index)}
                dragHandleLabel={dragHandleLabel}
                gesture={gesture}
                key={gesture._id}
                onSelect={() => onSelectGesture(gesture._id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <div className="divide-y-0">
      {gestures.map((gesture, index) => (
        <GestureRow
          actions={actionsForGesture(gesture, index)}
          gesture={gesture}
          key={gesture._id}
          onSelect={() => onSelectGesture(gesture._id)}
        />
      ))}
    </div>
  );
}
