import { Check, Pencil, Save, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getListStatusLabel } from "./ListStatusBadge";
import type { ListRecord } from "./types";

export function ListRail({
  activeListId,
  editingListId,
  editingName,
  lists,
  onCancelRename,
  onEditingNameChange,
  onSaveRename,
  onSelectList,
  onStartRename,
  selectedLabel,
}: {
  activeListId: string | null;
  editingListId: string | null;
  editingName: string;
  lists: ListRecord[];
  onCancelRename: () => void;
  onEditingNameChange: (name: string) => void;
  onSaveRename: () => void;
  onSelectList: (listId: string) => void;
  onStartRename: (list: ListRecord) => void;
  selectedLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-1">
      {lists.map((list) => {
        const isActive = list._id === activeListId;
        const isEditing = editingListId === list._id;

        return (
          <div
            className={cn(
              "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md border border-transparent px-2 py-1.5 transition-colors",
              isActive
                ? "border-primary/30 bg-primary/10"
                : "hover:border-border hover:bg-background"
            )}
            key={list._id}
          >
            <button
              className="min-w-0 rounded-sm py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelectList(list._id)}
              type="button"
            >
              {isEditing ? (
                <Input
                  autoFocus
                  className="h-8"
                  onChange={(event) => onEditingNameChange(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onSaveRename();
                    }
                    if (event.key === "Escape") {
                      onCancelRename();
                    }
                  }}
                  value={editingName}
                />
              ) : (
                <>
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="truncate font-semibold text-sm">
                      {list.name}
                    </h2>
                    {isActive ? (
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                        <span className="sr-only">{selectedLabel}</span>
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-muted-foreground text-xs">
                    {getListStatusLabel(list, (_key, fallback) => fallback)}
                  </p>
                </>
              )}
            </button>
            <div className="flex items-center">
              {isEditing ? (
                <>
                  <Button
                    aria-label={t("web.lists.saveListName", "Save list name")}
                    onClick={onSaveRename}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label={t("web.lists.cancelRename", "Cancel rename")}
                    onClick={onCancelRename}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button
                  aria-label={t("web.lists.renameList", "Rename list")}
                  className="opacity-60 transition-opacity hover:opacity-100"
                  disabled={list.isDefaultFavorites}
                  onClick={() => onStartRename(list)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
