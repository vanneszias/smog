import { Check, Pencil, Save, X } from "lucide-react";
import type { ChangeEvent, KeyboardEvent, MouseEvent } from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getListStatusLabel } from "./ListStatusBadge";
import type { ListRecord } from "./types";

function stopPropagation(event: MouseEvent<HTMLInputElement>): void {
  event.stopPropagation();
}

function ListRailItem({
  editingName,
  isActive,
  isEditing,
  list,
  onCancelRename,
  onEditingNameChange,
  onSaveRename,
  onSelectList,
  onStartRename,
  selectedLabel,
}: {
  editingName: string;
  isActive: boolean;
  isEditing: boolean;
  list: ListRecord;
  onCancelRename: () => void;
  onEditingNameChange: (name: string) => void;
  onSaveRename: () => void;
  onSelectList: (listId: string) => void;
  onStartRename: (list: ListRecord) => void;
  selectedLabel: string;
}) {
  const { t } = useTranslation();

  const handleSelect = useCallback(() => {
    onSelectList(list._id);
  }, [list._id, onSelectList]);

  const handleStartRename = useCallback(() => {
    onStartRename(list);
  }, [list, onStartRename]);

  const handleEditingNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onEditingNameChange(event.target.value);
    },
    [onEditingNameChange]
  );

  const handleEditingKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        onSaveRename();
      }
      if (event.key === "Escape") {
        onCancelRename();
      }
    },
    [onCancelRename, onSaveRename]
  );

  return (
    <div
      className={cn(
        "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md border border-transparent px-2 py-1.5 transition-colors",
        isActive
          ? "border-primary/30 bg-primary/10"
          : "hover:border-border hover:bg-background"
      )}
    >
      <button
        className="min-w-0 rounded-sm py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={handleSelect}
        type="button"
      >
        {isEditing ? (
          <Input
            autoFocus
            className="h-8"
            onChange={handleEditingNameChange}
            onClick={stopPropagation}
            onKeyDown={handleEditingKeyDown}
            value={editingName}
          />
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate font-semibold text-sm">{list.name}</h2>
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
            onClick={handleStartRename}
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
}

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
  return (
    <div className="grid gap-1">
      {lists.map((list) => {
        const isActive = list._id === activeListId;
        const isEditing = editingListId === list._id;

        return (
          <ListRailItem
            editingName={editingName}
            isActive={isActive}
            isEditing={isEditing}
            key={list._id}
            list={list}
            onCancelRename={onCancelRename}
            onEditingNameChange={onEditingNameChange}
            onSaveRename={onSaveRename}
            onSelectList={onSelectList}
            onStartRename={onStartRename}
            selectedLabel={selectedLabel}
          />
        );
      })}
    </div>
  );
}
