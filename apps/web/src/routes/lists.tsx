import { createLogger } from "@smog/shared";
import type { GestureCardData } from "@smog/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  ListPlus,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { GestureRows } from "@/components/lists/GestureRows";
import { ListControlPanel } from "@/components/lists/ListControlPanel";
import {
  ListEmptyState,
  ListLoadingState,
} from "@/components/lists/ListEmptyState";
import { ListRail } from "@/components/lists/ListRail";
import type { GestureRowAction, ListRecord } from "@/components/lists/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useGestures } from "@/hooks/useGestures";
import { useAuth } from "@/lib/auth";
import { useConvexUserId } from "@/lib/convex-user-sync";
import {
  LIST_GESTURE_ADDED_EVENT,
  LIST_GESTURE_REMOVED_EVENT,
  useLists,
} from "@/lib/lists-context";
import { client } from "@/utils/orpc";

const logger = createLogger("lists");

export const Route = createFileRoute("/lists")({
  component: ListsComponent,
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This route coordinates list CRUD, sharing, ordering, and adding; rendering is delegated to list components.
function ListsComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const convexUserId = useConvexUserId();
  const { refetchSavedGestures } = useLists();
  const { gestures: allGestures, isLoading: isLoadingAllGestures } =
    useGestures();
  const [lists, setLists] = useState<ListRecord[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [activeGestures, setActiveGestures] = useState<GestureCardData[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [isLoadingGestures, setIsLoadingGestures] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isAddingGestures, setIsAddingGestures] = useState(false);
  const [gestureSearch, setGestureSearch] = useState("");

  const activeList = useMemo(
    () => lists.find((list) => list._id === activeListId) ?? null,
    [activeListId, lists]
  );

  const shareUrl = activeList?.viewShareToken
    ? `${window.location.origin}/lists/${
        activeList.allowSharedEditing && activeList.editShareToken
          ? activeList.editShareToken
          : activeList.viewShareToken
      }`
    : "";

  const activeGestureIds = useMemo(
    () => new Set(activeGestures.map((gesture) => gesture._id)),
    [activeGestures]
  );

  const addableGestures = useMemo(() => {
    const query = gestureSearch.trim().toLowerCase();
    return allGestures
      .filter((gesture) => !activeGestureIds.has(gesture._id))
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
  }, [activeGestureIds, allGestures, gestureSearch]);

  const loadLists = useCallback(
    async (preferredListId?: string) => {
      if (!convexUserId) {
        setLists([]);
        setActiveListId(null);
        return;
      }

      setIsLoadingLists(true);
      try {
        await client.lists.initialize();
        const userLists = (await client.lists.getMyLists()) as ListRecord[];
        setLists(userLists);
        setActiveListId((current) => {
          if (
            preferredListId &&
            userLists.some((list) => list._id === preferredListId)
          ) {
            return preferredListId;
          }
          if (current && userLists.some((list) => list._id === current)) {
            return current;
          }
          return userLists[0]?._id ?? null;
        });
      } catch (error) {
        logger.error("Failed to load lists:", error);
        toast.error(t("web.lists.failedToLoad", "Could not load lists"));
      } finally {
        setIsLoadingLists(false);
      }
    },
    [convexUserId, t]
  );

  const loadActiveGestures = useCallback(async () => {
    if (!(convexUserId && activeListId)) {
      setActiveGestures([]);
      return;
    }

    setIsLoadingGestures(true);
    try {
      const gestures = await client.lists.getListGestures({
        listId: activeListId,
      });
      setActiveGestures(gestures);
    } catch (error) {
      logger.error("Failed to load list gestures:", error);
      toast.error(t("web.lists.failedToLoadGestures", "Could not load list"));
    } finally {
      setIsLoadingGestures(false);
    }
  }, [activeListId, convexUserId, t]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    loadActiveGestures();
  }, [loadActiveGestures]);

  useEffect(() => {
    const handleGestureAdded = (event: Event) => {
      const detail = (
        event as CustomEvent<{ gestureId: string; listId: string }>
      ).detail;
      if (!(detail && detail.listId === activeListId)) {
        return;
      }
      const gesture = allGestures.find((item) => item._id === detail.gestureId);
      if (!gesture) {
        loadActiveGestures();
        return;
      }
      setActiveGestures((current) =>
        current.some((item) => item._id === detail.gestureId)
          ? current
          : [...current, gesture]
      );
    };

    window.addEventListener(LIST_GESTURE_ADDED_EVENT, handleGestureAdded);
    const handleGestureRemoved = (event: Event) => {
      const detail = (
        event as CustomEvent<{ gestureId: string; listId: string }>
      ).detail;
      if (!(detail && detail.listId === activeListId)) {
        return;
      }
      setActiveGestures((current) =>
        current.filter((item) => item._id !== detail.gestureId)
      );
    };

    window.addEventListener(LIST_GESTURE_REMOVED_EVENT, handleGestureRemoved);
    return () => {
      window.removeEventListener(LIST_GESTURE_ADDED_EVENT, handleGestureAdded);
      window.removeEventListener(
        LIST_GESTURE_REMOVED_EVENT,
        handleGestureRemoved
      );
    };
  }, [activeListId, allGestures, loadActiveGestures]);

  const handleSelectGesture = (gestureId: string) => {
    navigate({ to: "/gestures/$id", params: { id: gestureId } });
  };

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name) {
      return;
    }

    try {
      const listId = await client.lists.create({
        allowSharedEditing: false,
        name,
        visibility: "private",
      });
      setNewListName("");
      setIsCreateListOpen(false);
      await loadLists(listId);
      toast.success(t("web.lists.created", "List created"));
    } catch (error) {
      logger.error("Failed to create list:", error);
      toast.error(t("web.lists.createFailed", "Could not create list"));
    }
  };

  const startRename = (list: ListRecord) => {
    setEditingListId(list._id);
    setEditingName(list.name);
  };

  const cancelRename = () => {
    setEditingListId(null);
    setEditingName("");
  };

  const saveRename = async () => {
    const name = editingName.trim();
    if (!(editingListId && name)) {
      return;
    }

    try {
      await client.lists.rename({ listId: editingListId, name });
      cancelRename();
      await loadLists(editingListId);
      toast.success(t("web.lists.renamed", "List renamed"));
    } catch (error) {
      logger.error("Failed to rename list:", error);
      toast.error(t("web.lists.renameFailed", "Could not rename list"));
    }
  };

  const updateSharing = async (updates: {
    visibility?: "private" | "shared";
    allowSharedEditing?: boolean;
  }) => {
    if (!activeList) {
      return;
    }

    try {
      const updated = await client.lists.updateSharing({
        allowSharedEditing:
          updates.allowSharedEditing ?? activeList.allowSharedEditing,
        listId: activeList._id,
        visibility: updates.visibility ?? activeList.visibility,
      });
      setLists((current) =>
        current.map((list) => (list._id === updated._id ? updated : list))
      );
      toast.success(t("web.lists.sharingUpdated", "Sharing updated"));
    } catch (error) {
      logger.error("Failed to update sharing:", error);
      toast.error(t("web.lists.sharingFailed", "Could not update sharing"));
    }
  };

  const copyShareLink = async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t("web.lists.linkCopied", "Share link copied"));
    } catch (error) {
      logger.error("Failed to copy share link:", error);
      toast.error(t("web.lists.copyFailed", "Could not copy link"));
    }
  };

  const regenerateShareTokens = async () => {
    if (!activeList) {
      return;
    }

    try {
      const updated = await client.lists.regenerateShareTokens({
        listId: activeList._id,
      });
      setLists((current) =>
        current.map((list) => (list._id === updated._id ? updated : list))
      );
      toast.success(t("web.lists.linkRegenerated", "Share link refreshed"));
    } catch (error) {
      logger.error("Failed to regenerate share tokens:", error);
      toast.error(t("web.lists.regenerateFailed", "Could not refresh link"));
    }
  };

  const deleteActiveList = async () => {
    if (!(activeList && !activeList.isDefaultFavorites)) {
      return;
    }
    const confirmed = window.confirm(
      t("web.lists.deleteConfirm", "Delete this list?")
    );
    if (!confirmed) {
      return;
    }

    try {
      await client.lists.delete({ listId: activeList._id });
      await loadLists();
      toast.success(t("web.lists.deleted", "List deleted"));
    } catch (error) {
      logger.error("Failed to delete list:", error);
      toast.error(t("web.lists.deleteFailed", "Could not delete list"));
    }
  };

  const removeGesture = async (gestureId: string) => {
    if (!activeList) {
      return;
    }

    try {
      await client.lists.removeGestureFromList({
        gestureId,
        listId: activeList._id,
      });
      setActiveGestures((current) =>
        current.filter((gesture) => gesture._id !== gestureId)
      );
      await refetchSavedGestures();
      toast.success(t("web.lists.gestureRemoved", "Gesture removed"));
    } catch (error) {
      logger.error("Failed to remove gesture from list:", error);
      toast.error(t("web.lists.removeFailed", "Could not remove gesture"));
    }
  };

  const addGesture = async (gesture: GestureCardData) => {
    if (!activeList) {
      return;
    }

    try {
      await client.lists.addGestureToList({
        gestureId: gesture._id,
        listId: activeList._id,
      });
      setActiveGestures((current) =>
        current.some((item) => item._id === gesture._id)
          ? current
          : [...current, gesture]
      );
      await refetchSavedGestures();
      toast.success(t("web.lists.gestureAdded", "Gesture added"));
    } catch (error) {
      logger.error("Failed to add gesture to list:", error);
      toast.error(t("web.lists.addFailed", "Could not add gesture"));
    }
  };

  const moveGesture = async (gestureId: string, direction: -1 | 1) => {
    if (!activeList) {
      return;
    }
    const currentIndex = activeGestures.findIndex(
      (gesture) => gesture._id === gestureId
    );
    const nextIndex = currentIndex + direction;
    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= activeGestures.length
    ) {
      return;
    }

    const nextGestures = [...activeGestures];
    const [gesture] = nextGestures.splice(currentIndex, 1);
    if (!gesture) {
      return;
    }
    nextGestures.splice(nextIndex, 0, gesture);
    setActiveGestures(nextGestures);

    try {
      await client.lists.reorderItems({
        gestureIds: nextGestures.map((item) => item._id),
        listId: activeList._id,
      });
    } catch (error) {
      logger.error("Failed to reorder list:", error);
      toast.error(t("web.lists.reorderFailed", "Could not reorder list"));
      await loadActiveGestures();
    }
  };

  const actionsForActiveGesture = (
    gesture: GestureCardData,
    index: number
  ): GestureRowAction[] => [
    {
      disabled: index === 0,
      icon: ArrowUp,
      label: t("web.lists.moveUp", "Move up"),
      onClick: () => moveGesture(gesture._id, -1),
    },
    {
      disabled: index === activeGestures.length - 1,
      icon: ArrowDown,
      label: t("web.lists.moveDown", "Move down"),
      onClick: () => moveGesture(gesture._id, 1),
    },
    {
      icon: X,
      label: t("web.lists.removeGesture", "Remove gesture"),
      onClick: () => removeGesture(gesture._id),
    },
    {
      icon: Eye,
      label: t("web.lists.viewGesture", "View gesture"),
      onClick: () => handleSelectGesture(gesture._id),
    },
  ];

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

  if (!isAuthenticated) {
    return (
      <ListEmptyState
        description={t(
          "web.lists.signInDescription",
          "Create, reorder, and share gesture lists across your devices."
        )}
        icon={ListPlus}
        title={t("web.lists.signInTitle", "Sign in to manage lists")}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-border border-b bg-background px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-bold text-2xl tracking-normal">
            {t("web.lists.title", "Lists")}
          </h1>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
        <section className="min-h-0 overflow-y-auto border-border border-b bg-muted/20 p-3 lg:border-r lg:border-b-0">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              {t("web.lists.yourLists", "Your lists")}
            </p>
            <Button
              aria-label={t("web.lists.create", "Create")}
              onClick={() => {
                setNewListName("");
                setIsCreateListOpen(true);
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {isLoadingLists && lists.length === 0 ? (
            <ListLoadingState
              label={t("web.lists.loading", "Loading lists...")}
            />
          ) : (
            <ListRail
              activeListId={activeListId}
              editingListId={editingListId}
              editingName={editingName}
              lists={lists}
              onCancelRename={cancelRename}
              onEditingNameChange={setEditingName}
              onSaveRename={saveRename}
              onSelectList={(listId) => {
                setActiveListId(listId);
                setIsAddingGestures(false);
              }}
              onStartRename={startRename}
              selectedLabel={t("web.lists.selected", "Selected")}
            />
          )}
        </section>

        <main className="flex min-h-0 flex-col overflow-hidden">
          {activeList ? (
            <ListControlPanel
              activeGestureCount={activeGestures.length}
              isAddingGestures={isAddingGestures}
              list={activeList}
              onCopyShareLink={copyShareLink}
              onDeleteList={deleteActiveList}
              onRegenerateShareLink={regenerateShareTokens}
              onToggleAdding={() => setIsAddingGestures((current) => !current)}
              onUpdateSharing={updateSharing}
            />
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeList ? (
              isAddingGestures ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="shrink-0 border-border border-b px-4 py-3 lg:px-5">
                    <div className="relative">
                      <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-9 pl-9"
                        onChange={(event) =>
                          setGestureSearch(event.target.value)
                        }
                        placeholder={t(
                          "web.lists.searchToAdd",
                          "Search gestures to add"
                        )}
                        value={gestureSearch}
                      />
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {isLoadingAllGestures ? (
                      <ListLoadingState />
                    ) : addableGestures.length === 0 ? (
                      <ListEmptyState
                        description={t(
                          "web.lists.noAddableGesturesDescription",
                          "All matching gestures are already in this list."
                        )}
                        icon={Check}
                        title={t(
                          "web.lists.noAddableGestures",
                          "Nothing to add"
                        )}
                      />
                    ) : (
                      <GestureRows
                        actionsForGesture={actionsForAddableGesture}
                        gestures={addableGestures}
                        onSelectGesture={handleSelectGesture}
                      />
                    )}
                  </div>
                </div>
              ) : isLoadingGestures ? (
                <ListLoadingState />
              ) : activeGestures.length === 0 ? (
                <ListEmptyState
                  action={{
                    label: t("web.lists.browseGestures", "Browse gestures"),
                    onClick: () => navigate({ to: "/gestures" }),
                  }}
                  description={t(
                    "web.lists.noGesturesDescription",
                    "Browse gestures and use the list button to save them."
                  )}
                  icon={ListPlus}
                  title={t(
                    "web.lists.noGesturesTitle",
                    "No gestures in this list yet"
                  )}
                />
              ) : (
                <GestureRows
                  actionsForGesture={actionsForActiveGesture}
                  gestures={activeGestures}
                  onSelectGesture={handleSelectGesture}
                />
              )
            ) : (
              <ListEmptyState
                icon={ListPlus}
                title={t("web.lists.noLists", "Create a list to get started.")}
              />
            )}
          </div>
        </main>
      </div>
      <Dialog
        onOpenChange={(open) => {
          setIsCreateListOpen(open);
          if (!open) {
            setNewListName("");
          }
        }}
        open={isCreateListOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("web.lists.createDialogTitle", "New list")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "web.lists.createDialogDescription",
                "Name the collection you want to build."
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            onChange={(event) => setNewListName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleCreateList();
              }
            }}
            placeholder={t("web.lists.newListPlaceholder", "New list name")}
            value={newListName}
          />
          <DialogFooter>
            <Button
              onClick={() => setIsCreateListOpen(false)}
              type="button"
              variant="ghost"
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!newListName.trim()}
              onClick={handleCreateList}
              type="button"
            >
              {t("web.lists.create", "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
