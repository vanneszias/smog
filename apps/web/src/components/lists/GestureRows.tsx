import type { GestureCardData } from "@smog/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GestureRowAction } from "./types";

function GestureRow({
  actions,
  className,
  gesture,
  onSelect,
}: {
  actions: GestureRowAction[];
  className?: string;
  gesture: GestureCardData;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "group grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-border border-b px-4 py-2.5 transition-colors hover:bg-muted/30 lg:px-5",
        className
      )}
    >
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

export function GestureRows({
  actionsForGesture,
  gestures,
  onSelectGesture,
}: {
  actionsForGesture: (
    gesture: GestureCardData,
    index: number
  ) => GestureRowAction[];
  gestures: GestureCardData[];
  onSelectGesture: (gestureId: string) => void;
}) {
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
