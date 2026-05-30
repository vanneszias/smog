import { createLogger } from "@smog/shared";
import type { GestureCardData } from "@smog/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Eye,
  Globe2,
  ListPlus,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useGestures } from "@/hooks/useGestures";
import { useAuth } from "@/lib/auth";
import { useConvexUserId } from "@/lib/convex-user-sync";
import { useFavorites } from "@/lib/favorites-context";
import { client } from "@/utils/orpc";

const logger = createLogger("favorites");

interface ListRecord {
  _id: string;
  name: string;
  visibility: "private" | "shared";
  allowSharedEditing: boolean;
  isDefaultFavorites: boolean;
  viewShareToken?: string;
  editShareToken?: string;
}

export const Route = createFileRoute("/favorites")({
  component: FavoritesComponent,
});

function getListTone(
  list: ListRecord,
  t: (key: string, fallback: string) => string
) {
  if (list.isDefaultFavorites) {
    return t("web.lists.defaultList", "Default list");
  }
  if (list.visibility === "shared") {
    return list.allowSharedEditing
      ? t("web.lists.sharedEditable", "Shared, editable")
      : t("web.lists.shared", "Shared");
  }
  return t("web.lists.private", "Private");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This route coordinates list CRUD, sharing, ordering, and adding in one screen.
function FavoritesComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const convexUserId = useConvexUserId();
  const { refetch: refetchFavorites } = useFavorites();
  const { gestures: allGestures, isLoading: isLoadingAllGestures } =
    useGestures();
  const [lists, setLists] = useState<ListRecord[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
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
        name,
        visibility: "private",
        allowSharedEditing: false,
      });
      setNewListName("");
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
        listId: activeList._id,
        visibility: updates.visibility ?? activeList.visibility,
        allowSharedEditing:
          updates.allowSharedEditing ?? activeList.allowSharedEditing,
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
        listId: activeList._id,
        gestureId,
      });
      setActiveGestures((current) =>
        current.filter((gesture) => gesture._id !== gestureId)
      );
      if (activeList.isDefaultFavorites) {
        await refetchFavorites();
      }
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
        listId: activeList._id,
        gestureId: gesture._id,
      });
      setActiveGestures((current) =>
        current.some((item) => item._id === gesture._id)
          ? current
          : [...current, gesture]
      );
      if (activeList.isDefaultFavorites) {
        await refetchFavorites();
      }
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
        listId: activeList._id,
        gestureIds: nextGestures.map((item) => item._id),
      });
    } catch (error) {
      logger.error("Failed to reorder list:", error);
      toast.error(t("web.lists.reorderFailed", "Could not reorder list"));
      await loadActiveGestures();
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center p-6">
        <ListPlus className="mb-4 h-16 w-16 text-muted-foreground" />
        <h2 className="mb-2 font-bold text-2xl">
          {t("web.lists.signInTitle", "Sign in to manage lists")}
        </h2>
        <p className="text-center text-muted-foreground">
          {t(
            "web.lists.signInDescription",
            "Create, reorder, and share gesture lists across your devices."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-border border-b bg-background p-4 lg:px-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-2xl">
              {t("web.lists.title", "Lists")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t(
                "web.lists.description",
                "Create gesture collections, keep them private, or share them with others."
              )}
            </p>
          </div>
          <div className="flex min-w-[280px] max-w-sm flex-1 gap-2 sm:flex-none">
            <Input
              onChange={(event) => setNewListName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleCreateList();
                }
              }}
              placeholder={t("web.lists.newListPlaceholder", "New list name")}
              value={newListName}
            />
            <Button onClick={handleCreateList} type="button">
              <Plus className="h-4 w-4" />
              {t("web.lists.create", "Create")}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {lists.map((list) => {
            const isActive = list._id === activeListId;
            const isEditing = editingListId === list._id;

            return (
              <div
                className={`rounded-lg border bg-card p-3 transition-colors ${
                  isActive ? "border-primary shadow-sm" : "border-border"
                }`}
                key={list._id}
              >
                <button
                  className="mb-3 flex w-full items-start justify-between gap-3 text-left"
                  onClick={() => setActiveListId(list._id)}
                  type="button"
                >
                  <div className="min-w-0">
                    {isEditing ? (
                      <Input
                        autoFocus
                        className="h-8"
                        onChange={(event) => setEditingName(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            saveRename();
                          }
                          if (event.key === "Escape") {
                            cancelRename();
                          }
                        }}
                        value={editingName}
                      />
                    ) : (
                      <h2 className="truncate font-semibold">{list.name}</h2>
                    )}
                    <p className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
                      {list.visibility === "shared" ? (
                        <Globe2 className="h-3.5 w-3.5" />
                      ) : (
                        <Lock className="h-3.5 w-3.5" />
                      )}
                      {getListTone(list, t)}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-primary text-xs">
                      {t("web.lists.selected", "Selected")}
                    </span>
                  ) : null}
                </button>

                <div className="flex gap-1">
                  {isEditing ? (
                    <>
                      <Button
                        onClick={saveRename}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={cancelRename}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={list.isDefaultFavorites}
                      onClick={() => startRename(list)}
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
          {isLoadingLists ? (
            <div className="rounded-lg border border-border bg-card p-4 text-muted-foreground text-sm">
              {t("web.lists.loading", "Loading lists...")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-border border-b bg-card/50 p-4 lg:border-r lg:border-b-0 lg:p-6">
          {activeList ? (
            <div className="space-y-5">
              <div>
                <p className="text-muted-foreground text-xs uppercase">
                  {t("web.lists.activeList", "Active list")}
                </p>
                <h2 className="mt-1 font-bold text-xl">{activeList.name}</h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  {activeGestures.length}{" "}
                  {activeGestures.length === 1
                    ? t("web.lists.oneGesture", "gesture")
                    : t("web.lists.manyGestures", "gestures")}
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">
                      {t("web.lists.shareList", "Share list")}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {activeList.visibility === "shared"
                        ? t(
                            "web.lists.shareEnabled",
                            "Anyone with the link can view it"
                          )
                        : t("web.lists.shareDisabled", "Only you can view it")}
                    </p>
                  </div>
                  <Switch
                    checked={activeList.visibility === "shared"}
                    onCheckedChange={(checked) =>
                      updateSharing({
                        visibility: checked ? "shared" : "private",
                        allowSharedEditing: checked
                          ? activeList.allowSharedEditing
                          : false,
                      })
                    }
                  />
                </div>

                {activeList.visibility === "shared" ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm">
                          {t("web.lists.allowEditing", "Allow editing")}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {t(
                            "web.lists.allowEditingHint",
                            "Signed-in collaborators can add or remove gestures"
                          )}
                        </p>
                      </div>
                      <Switch
                        checked={activeList.allowSharedEditing}
                        onCheckedChange={(checked) =>
                          updateSharing({ allowSharedEditing: checked })
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={copyShareLink}
                        type="button"
                        variant="outline"
                      >
                        <Copy className="h-4 w-4" />
                        {t("web.lists.copyLink", "Copy")}
                      </Button>
                      <Button
                        onClick={regenerateShareTokens}
                        size="icon"
                        type="button"
                        variant="outline"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>

              {activeList.isDefaultFavorites ? null : (
                <Button
                  className="w-full"
                  onClick={deleteActiveList}
                  type="button"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("web.lists.delete", "Delete list")}
                </Button>
              )}
              <Button
                className="w-full"
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
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("web.lists.noLists", "Create a list to get started.")}
            </p>
          )}
        </aside>

        <div className="min-h-0 overflow-y-auto">
          {isAddingGestures ? (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="shrink-0 border-border border-b p-4 lg:px-8">
                <div className="relative">
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
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {isLoadingAllGestures ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                ) : addableGestures.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                    <Check className="mb-4 h-16 w-16 text-muted-foreground" />
                    <h2 className="mb-2 font-bold text-xl">
                      {t("web.lists.noAddableGestures", "Nothing to add")}
                    </h2>
                    <p className="text-muted-foreground">
                      {t(
                        "web.lists.noAddableGesturesDescription",
                        "All matching gestures are already in this list."
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {addableGestures.map((gesture) => (
                      <div
                        className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 lg:px-8"
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
                        <Button
                          onClick={() => addGesture(gesture)}
                          type="button"
                          variant="outline"
                        >
                          <Plus className="h-4 w-4" />
                          {t("web.lists.add", "Add")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : isLoadingGestures ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : activeGestures.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <ListPlus className="mb-4 h-16 w-16 text-muted-foreground" />
              <h2 className="mb-2 font-bold text-xl">
                {t("web.lists.noGesturesTitle", "No gestures in this list yet")}
              </h2>
              <p className="mb-4 text-muted-foreground">
                {t(
                  "web.lists.noGesturesDescription",
                  "Browse gestures and use the list button to save them."
                )}
              </p>
              <Button
                onClick={() => navigate({ to: "/gestures" })}
                type="button"
              >
                {t("web.favorites.browseGestures")}
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activeGestures.map((gesture, index) => (
                <div
                  className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 lg:px-8"
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
                    <Button
                      disabled={index === 0}
                      onClick={() => moveGesture(gesture._id, -1)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      disabled={index === activeGestures.length - 1}
                      onClick={() => moveGesture(gesture._id, 1)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => removeGesture(gesture._id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
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
    </div>
  );
}
