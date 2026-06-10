import { createLogger } from "@smog/shared";
import type { GestureCardData } from "@smog/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Eye, ListPlus, Lock, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { GestureRows } from "@/components/lists/GestureRows";
import {
  ListEmptyState,
  ListLoadingState,
} from "@/components/lists/ListEmptyState";
import type {
  GestureRowAction,
  SharedListRecord,
} from "@/components/lists/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGestures } from "@/hooks/useGestures";
import { useAuth } from "@/lib/auth";
import { client } from "@/utils/orpc";

const logger = createLogger("sharedList");

export const Route = createFileRoute("/lists_/$shareToken")({
  component: SharedListComponent,
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Shared list viewing and editable collaboration live in one route.
function SharedListComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shareToken } = Route.useParams();
  const { isAuthenticated } = useAuth();
  const { gestures: allGestures, isLoading: isLoadingAllGestures } =
    useGestures();
  const [list, setList] = useState<SharedListRecord | null>(null);
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

  const actionsForVisibleGesture = (gesture: GestureCardData) => {
    const actions: GestureRowAction[] = [];
    if (list?.canEdit && isAuthenticated) {
      actions.push({
        icon: X,
        label: t("web.lists.removeGesture", "Remove gesture"),
        onClick: () => removeGesture(gesture._id),
      });
    }
    actions.push({
      icon: Eye,
      label: t("web.lists.viewGesture", "View gesture"),
      onClick: () => handleSelectGesture(gesture._id),
    });
    return actions;
  };

  const actionsForAddableGesture = (
    gesture: GestureCardData
  ): GestureRowAction[] => [
    {
      icon: Plus,
      label: t("web.lists.add", "Add"),
      onClick: () => addGesture(gesture),
      variant: "outline",
    },
  ];

  if (isLoading) {
    return <ListLoadingState />;
  }

  if (!list) {
    return (
      <ListEmptyState
        description={t(
          "web.lists.sharedNotFoundDescription",
          "This list is private, deleted, or the link has been replaced."
        )}
        icon={Lock}
        title={t("web.lists.sharedNotFoundTitle", "List unavailable")}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-border border-b bg-background px-4 py-4 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {t("web.lists.sharedList", "Shared list")}
            </p>
            <h1 className="mt-1 font-bold text-3xl tracking-normal">
              {list.name}
            </h1>
            {list.description ? (
              <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                {list.description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-medium text-sm">
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
        <div className="border-border border-b bg-card px-4 py-3 text-sm lg:px-8">
          {t(
            "web.lists.signInToEdit",
            "Sign in to add or remove gestures from this shared list."
          )}
        </div>
      ) : null}

      {list.canEdit && isAuthenticated ? (
        <div className="grid gap-3 border-border border-b bg-card px-4 py-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:px-8">
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
            <div className="relative min-w-[240px]">
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
          isLoadingAllGestures ? (
            <ListLoadingState />
          ) : addableGestures.length === 0 ? (
            <ListEmptyState
              icon={Check}
              title={t("web.lists.noAddableGestures", "Nothing to add")}
            />
          ) : (
            <GestureRows
              actionsForGesture={actionsForAddableGesture}
              gestures={addableGestures}
              onSelectGesture={handleSelectGesture}
            />
          )
        ) : gestures.length === 0 ? (
          <ListEmptyState
            description={t(
              "web.lists.sharedEmptyDescription",
              "The owner has not added gestures to this list."
            )}
            icon={ListPlus}
            title={t(
              "web.lists.noGesturesTitle",
              "No gestures in this list yet"
            )}
          />
        ) : (
          <GestureRows
            actionsForGesture={actionsForVisibleGesture}
            gestures={gestures}
            onSelectGesture={handleSelectGesture}
          />
        )}
      </div>
    </div>
  );
}
