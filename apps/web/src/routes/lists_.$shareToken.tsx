import { createLogger } from "@smog/shared";
import type { GestureCardData } from "@smog/ui";
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { Check, Eye, ListPlus, Lock, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGestures } from "@/hooks/useGestures";
import { useAuth } from "@/lib/auth";
import { client } from "@/utils/orpc";

const logger = createLogger("sharedList");

interface SharedList {
  _id: string;
  name: string;
  description?: string;
  allowSharedEditing: boolean;
  canEdit: boolean;
}

export const Route = createFileRoute("/lists_/$shareToken")({
  component: SharedListComponent,
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Shared list viewing and editable collaboration live in one route.
function SharedListComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shareToken } = useParams({ from: "/lists/$shareToken" });
  const { isAuthenticated } = useAuth();
  const { gestures: allGestures, isLoading: isLoadingAllGestures } =
    useGestures();
  const [list, setList] = useState<SharedList | null>(null);
  const [gestures, setGestures] = useState<GestureCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingGestures, setIsAddingGestures] = useState(false);
  const [gestureSearch, setGestureSearch] = useState("");

  const gestureIds = useMemo(
    () => new Set(gestures.map((gesture) => gesture._id)),
    [gestures]
  );

  const addableGestures = useMemo(() => {
    const query = gestureSearch.trim().toLowerCase();
    return allGestures
      .filter((gesture) => !gestureIds.has(gesture._id))
      .filter((gesture) => {
        if (!query) {
          return true;
        }
        return [
          gesture.name,
          gesture.info,
          ...gesture.concept,
          ...gesture.categories
            .filter(Boolean)
            .map((category) => category?.name ?? ""),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [allGestures, gestureIds, gestureSearch]);

  const loadSharedList = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sharedList, sharedGestures] = await Promise.all([
        client.lists.getSharedList({ shareToken }),
        client.lists.getSharedListGestures({ shareToken }),
      ]);
      setList(sharedList);
      setGestures(sharedGestures);
    } catch (error) {
      logger.error("Failed to load shared list:", error);
      toast.error(t("web.lists.failedToLoad", "Could not load lists"));
    } finally {
      setIsLoading(false);
    }
  }, [shareToken, t]);

  useEffect(() => {
    loadSharedList();
  }, [loadSharedList]);

  const handleSelectGesture = (gestureId: string) => {
    navigate({ to: "/gestures/$id", params: { id: gestureId } });
  };

  const removeGesture = async (gestureId: string) => {
    if (!list?.canEdit) {
      return;
    }

    try {
      await client.lists.removeGestureFromEditableSharedList({
        editShareToken: shareToken,
        gestureId,
      });
      setGestures((current) =>
        current.filter((gesture) => gesture._id !== gestureId)
      );
      toast.success(t("web.lists.gestureRemoved", "Gesture removed"));
    } catch (error) {
      logger.error("Failed to remove shared list gesture:", error);
      toast.error(t("web.lists.removeFailed", "Could not remove gesture"));
    }
  };

  const addGesture = async (gesture: GestureCardData) => {
    if (!list?.canEdit) {
      return;
    }

    try {
      await client.lists.addGestureToEditableSharedList({
        editShareToken: shareToken,
        gestureId: gesture._id,
      });
      setGestures((current) =>
        current.some((item) => item._id === gesture._id)
          ? current
          : [...current, gesture]
      );
      toast.success(t("web.lists.gestureAdded", "Gesture added"));
    } catch (error) {
      logger.error("Failed to add shared list gesture:", error);
      toast.error(t("web.lists.addFailed", "Could not add gesture"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Lock className="mb-4 h-16 w-16 text-muted-foreground" />
        <h1 className="mb-2 font-bold text-2xl">
          {t("web.lists.sharedNotFoundTitle", "List unavailable")}
        </h1>
        <p className="max-w-md text-muted-foreground">
          {t(
            "web.lists.sharedNotFoundDescription",
            "This list is private, deleted, or the link has been replaced."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-border border-b bg-background p-4 lg:px-12">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              {t("web.lists.sharedList", "Shared list")}
            </p>
            <h1 className="font-bold text-2xl">{list.name}</h1>
            {list.description ? (
              <p className="mt-1 text-muted-foreground text-sm">
                {list.description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            {list.canEdit ? (
              <>
                <Plus className="h-4 w-4 text-primary" />
                {t("web.lists.editable", "Editable")}
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 text-primary" />
                {t("web.lists.viewOnly", "View only")}
              </>
            )}
          </div>
        </div>
      </div>

      {list.canEdit && !isAuthenticated ? (
        <div className="border-border border-b bg-card px-4 py-3 text-sm lg:px-12">
          {t(
            "web.lists.signInToEdit",
            "Sign in to add or remove gestures from this shared list."
          )}
        </div>
      ) : null}

      {list.canEdit && isAuthenticated ? (
        <div className="flex flex-wrap items-center gap-3 border-border border-b bg-card px-4 py-3 lg:px-12">
          <Button
            onClick={() => setIsAddingGestures((current) => !current)}
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
          {isAddingGestures ? (
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setGestureSearch(event.target.value)}
                placeholder={t(
                  "web.lists.searchToAdd",
                  "Search gestures to add"
                )}
                value={gestureSearch}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isAddingGestures ? (
          <div className="divide-y divide-border">
            {isLoadingAllGestures ? (
              <div className="flex h-full items-center justify-center p-8">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : addableGestures.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <Check className="mb-4 h-16 w-16 text-muted-foreground" />
                <h2 className="mb-2 font-bold text-xl">
                  {t("web.lists.noAddableGestures", "Nothing to add")}
                </h2>
              </div>
            ) : (
              addableGestures.map((gesture) => (
                <div
                  className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 lg:px-12"
                  key={gesture._id}
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => handleSelectGesture(gesture._id)}
                    type="button"
                  >
                    <p className="truncate font-medium">{gesture.name}</p>
                  </button>
                  <Button
                    onClick={() => addGesture(gesture)}
                    type="button"
                    variant="outline"
                  >
                    <Plus className="h-4 w-4" />
                    {t("web.lists.add", "Add")}
                  </Button>
                </div>
              ))
            )}
          </div>
        ) : gestures.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <ListPlus className="mb-4 h-16 w-16 text-muted-foreground" />
            <h2 className="mb-2 font-bold text-xl">
              {t("web.lists.noGesturesTitle", "No gestures in this list yet")}
            </h2>
            <p className="text-muted-foreground">
              {t(
                "web.lists.sharedEmptyDescription",
                "The owner has not added gestures to this list."
              )}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {gestures.map((gesture) => (
              <div
                className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 lg:px-12"
                key={gesture._id}
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => handleSelectGesture(gesture._id)}
                  type="button"
                >
                  <p className="truncate font-medium">{gesture.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {gesture.categories
                      .filter(Boolean)
                      .slice(0, 3)
                      .map((category) =>
                        category ? (
                          <span
                            className="rounded-full bg-secondary px-2 py-0.5 text-xs"
                            key={category._id}
                          >
                            {category.name}
                          </span>
                        ) : null
                      )}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {list.canEdit && isAuthenticated ? (
                    <Button
                      onClick={() => removeGesture(gesture._id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button
                    onClick={() => handleSelectGesture(gesture._id)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
