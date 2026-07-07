import { Check, Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ListStatusBadge } from "./ListStatusBadge";
import type { ListRecord } from "./types";

export function ListControlPanel({
  activeGestureCount,
  list,
  onCopyShareLink,
  onDeleteList,
  onRegenerateShareLink,
  onToggleAdding,
  onUpdateSharing,
  isAddingGestures,
}: {
  activeGestureCount: number;
  isAddingGestures: boolean;
  list: ListRecord;
  onCopyShareLink: () => void;
  onDeleteList: () => void;
  onRegenerateShareLink: () => void;
  onToggleAdding: () => void;
  onUpdateSharing: (updates: {
    visibility?: "private" | "shared";
    allowSharedEditing?: boolean;
  }) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="shrink-0 border-border border-b bg-background px-4 py-3 lg:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate font-bold text-xl leading-tight">
              {list.name}
            </h2>
            <ListStatusBadge list={list} />
            <span className="text-muted-foreground text-sm">
              {activeGestureCount}{" "}
              {activeGestureCount === 1
                ? t("web.lists.oneGesture", "gesture")
                : t("web.lists.manyGestures", "gestures")}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
            <span>{t("web.lists.shareList", "Share list")}</span>
            <Switch
              checked={list.visibility === "shared"}
              onCheckedChange={(checked) =>
                onUpdateSharing({
                  visibility: checked ? "shared" : "private",
                  allowSharedEditing: checked ? list.allowSharedEditing : false,
                })
              }
            />
          </div>

          {list.visibility === "shared" ? (
            <>
              <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                <span>{t("web.lists.allowEditing", "Allow editing")}</span>
                <Switch
                  checked={list.allowSharedEditing}
                  onCheckedChange={(checked) =>
                    onUpdateSharing({ allowSharedEditing: checked })
                  }
                />
              </div>
              <Button onClick={onCopyShareLink} type="button" variant="outline">
                <Copy className="h-4 w-4" />
                {t("web.lists.copyLink", "Copy")}
              </Button>
              <Button
                aria-label={t(
                  "web.lists.refreshShareLink",
                  "Refresh share link"
                )}
                onClick={onRegenerateShareLink}
                size="icon"
                type="button"
                variant="outline"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          ) : null}

          <Button
            onClick={onToggleAdding}
            type="button"
            variant={isAddingGestures ? "secondary" : "default"}
          >
            {isAddingGestures ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {isAddingGestures
              ? t("web.lists.doneAdding", "Done adding")
              : t("web.lists.addGestures", "Add gestures")}
          </Button>

          {list.isDefaultFavorites ? null : (
            <Button
              aria-label={t("web.lists.delete", "Delete list")}
              onClick={onDeleteList}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
