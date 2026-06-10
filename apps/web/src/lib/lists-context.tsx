import { createLogger } from "@smog/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ListStatusBadge } from "@/components/lists/ListStatusBadge";
import type { ListRecord } from "@/components/lists/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { client } from "../utils/orpc";
import { useAuth } from "./auth";
import { useConvexUserId } from "./convex-user-sync";

const logger = createLogger("listsContext");
export const LIST_GESTURE_ADDED_EVENT = "smog:list-gesture-added";
export const LIST_GESTURE_REMOVED_EVENT = "smog:list-gesture-removed";

interface SaveGestureRequest {
  categories?: string[];
  gestureId: string;
  gestureName?: string;
}

interface ListsContextType {
  isLoading: boolean;
  isGestureSaved: (gestureId: string) => boolean;
  openSaveGestureDialog: (request: SaveGestureRequest) => Promise<void>;
  refetchSavedGestures: () => Promise<void>;
  savedGestureIds: string[];
}

const ListsContext = createContext<ListsContextType | undefined>(undefined);

export function ListsProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const convexUserId = useConvexUserId();
  const [savedGestureIds, setSavedGestureIds] = useState<string[]>([]);
  const [lists, setLists] = useState<ListRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isAddingGesture, setIsAddingGesture] = useState(false);
  const [pendingGesture, setPendingGesture] =
    useState<SaveGestureRequest | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [gestureListIds, setGestureListIds] = useState<string[]>([]);
  const [newListName, setNewListName] = useState("");

  const fetchSavedGestures = useCallback(async () => {
    if (!convexUserId) {
      setSavedGestureIds([]);
      setLists([]);
      return;
    }

    setIsLoading(true);
    try {
      await client.lists.initialize();
      const [userLists, gestureIds] = await Promise.all([
        client.lists.getMyLists() as Promise<ListRecord[]>,
        client.lists.getSavedGestureIds(),
      ]);
      setLists(userLists);
      setSavedGestureIds(gestureIds);
    } catch (error) {
      logger.error("Failed to fetch saved list gestures:", error);
      toast.error(t("web.lists.failedToLoad", "Could not load lists"));
    } finally {
      setIsLoading(false);
    }
  }, [convexUserId, t]);

  useEffect(() => {
    fetchSavedGestures();
  }, [fetchSavedGestures]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSavedGestureIds([]);
      setLists([]);
    }
  }, [isAuthenticated]);

  const isGestureSaved = useCallback(
    (gestureId: string) => savedGestureIds.includes(gestureId),
    [savedGestureIds]
  );

  const openSaveGestureDialog = useCallback(
    async (request: SaveGestureRequest) => {
      if (!convexUserId) {
        toast.error(
          t("web.lists.signInRequired", "Please sign in to save gestures")
        );
        return;
      }

      setPendingGesture(request);
      setNewListName("");
      setIsPickerOpen(true);

      try {
        const [userLists, containingListIds] = await Promise.all([
          client.lists.getMyLists() as Promise<ListRecord[]>,
          client.lists.getGestureListIds({ gestureId: request.gestureId }),
        ]);
        setLists(userLists);
        setGestureListIds(containingListIds);
        setSelectedListId(
          (current) =>
            (current && userLists.some((list) => list._id === current)
              ? current
              : null) ??
            containingListIds[0] ??
            userLists.find((list) => list.isDefaultFavorites)?._id ??
            userLists[0]?._id ??
            null
        );
      } catch (error) {
        logger.error("Failed to load lists for gesture save:", error);
        toast.error(t("web.lists.failedToLoad", "Could not load lists"));
      }
    },
    [convexUserId, t]
  );

  const addPendingGestureToList = useCallback(
    async (listId: string) => {
      if (!(pendingGesture && convexUserId)) {
        return;
      }

      setIsAddingGesture(true);
      try {
        await client.lists.addGestureToList({
          gestureId: pendingGesture.gestureId,
          listId,
        });

        setSavedGestureIds((previous) =>
          previous.includes(pendingGesture.gestureId)
            ? previous
            : [...previous, pendingGesture.gestureId]
        );
        setGestureListIds((previous) =>
          previous.includes(listId) ? previous : [...previous, listId]
        );

        window.dispatchEvent(
          new CustomEvent(LIST_GESTURE_ADDED_EVENT, {
            detail: {
              gestureId: pendingGesture.gestureId,
              listId,
            },
          })
        );

        toast.success(
          pendingGesture.gestureName
            ? t("web.lists.addedToList", { name: pendingGesture.gestureName })
            : t("web.lists.addedToListShort", "Added to list")
        );
        setIsPickerOpen(false);
        setPendingGesture(null);
      } catch (error) {
        logger.error("Failed to add gesture to list:", error);
        toast.error(t("web.lists.addFailed", "Could not add gesture"));
      } finally {
        setIsAddingGesture(false);
      }
    },
    [convexUserId, pendingGesture, t]
  );

  const removePendingGestureFromList = useCallback(
    async (listId: string) => {
      if (!(pendingGesture && convexUserId)) {
        return;
      }

      setIsAddingGesture(true);
      try {
        await client.lists.removeGestureFromList({
          gestureId: pendingGesture.gestureId,
          listId,
        });

        const remainingListIds = gestureListIds.filter((id) => id !== listId);
        setGestureListIds(remainingListIds);
        if (remainingListIds.length === 0) {
          setSavedGestureIds((previous) =>
            previous.filter((id) => id !== pendingGesture.gestureId)
          );
        }

        window.dispatchEvent(
          new CustomEvent(LIST_GESTURE_REMOVED_EVENT, {
            detail: {
              gestureId: pendingGesture.gestureId,
              listId,
            },
          })
        );
        toast.success(t("web.lists.gestureRemoved", "Gesture removed"));
        setIsPickerOpen(false);
        setPendingGesture(null);
      } catch (error) {
        logger.error("Failed to remove gesture from list:", error);
        toast.error(t("web.lists.removeFailed", "Could not remove gesture"));
      } finally {
        setIsAddingGesture(false);
      }
    },
    [convexUserId, gestureListIds, pendingGesture, t]
  );

  const createListAndAddPendingGesture = useCallback(async () => {
    const name = newListName.trim();
    if (!(name && pendingGesture && convexUserId)) {
      return;
    }

    setIsAddingGesture(true);
    try {
      const listId = await client.lists.create({
        allowSharedEditing: false,
        name,
        visibility: "private",
      });
      const createdList = {
        _id: listId,
        allowSharedEditing: false,
        isDefaultFavorites: false,
        name,
        visibility: "private" as const,
      };
      setLists((current) => [createdList, ...current]);
      setSelectedListId(listId);
      await client.lists.addGestureToList({
        gestureId: pendingGesture.gestureId,
        listId,
      });
      setSavedGestureIds((previous) =>
        previous.includes(pendingGesture.gestureId)
          ? previous
          : [...previous, pendingGesture.gestureId]
      );
      setGestureListIds((previous) =>
        previous.includes(listId) ? previous : [...previous, listId]
      );
      window.dispatchEvent(
        new CustomEvent(LIST_GESTURE_ADDED_EVENT, {
          detail: {
            gestureId: pendingGesture.gestureId,
            listId,
          },
        })
      );
      toast.success(
        pendingGesture.gestureName
          ? t("web.lists.addedToList", { name: pendingGesture.gestureName })
          : t("web.lists.addedToListShort", "Added to list")
      );
      setIsPickerOpen(false);
      setPendingGesture(null);
      setNewListName("");
    } catch (error) {
      logger.error("Failed to create list and add gesture:", error);
      toast.error(t("web.lists.addFailed", "Could not add gesture"));
    } finally {
      setIsAddingGesture(false);
    }
  }, [convexUserId, newListName, pendingGesture, t]);

  const selectedList = useMemo(
    () => lists.find((list) => list._id === selectedListId) ?? null,
    [lists, selectedListId]
  );

  const selectedListHasGesture = selectedListId
    ? gestureListIds.includes(selectedListId)
    : false;

  const value = useMemo(
    () => ({
      isLoading,
      isGestureSaved,
      openSaveGestureDialog,
      refetchSavedGestures: fetchSavedGestures,
      savedGestureIds,
    }),
    [
      fetchSavedGestures,
      isGestureSaved,
      isLoading,
      openSaveGestureDialog,
      savedGestureIds,
    ]
  );

  return (
    <ListsContext.Provider value={value}>
      {children}
      <Dialog
        onOpenChange={(open) => {
          setIsPickerOpen(open);
          if (!open) {
            setPendingGesture(null);
            setGestureListIds([]);
            setNewListName("");
          }
        }}
        open={isPickerOpen}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {t("web.lists.saveDialogTitle", "Add to list")}
            </DialogTitle>
            <DialogDescription>
              {pendingGesture?.gestureName
                ? t("web.lists.saveDialogDescription", {
                    defaultValue: 'Choose a list for "{{name}}".',
                    name: pendingGesture.gestureName,
                  })
                : t(
                    "web.lists.saveDialogDescriptionFallback",
                    "Choose where this gesture should be saved."
                  )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Select
              onValueChange={(value) => setSelectedListId(value)}
              value={selectedListId ?? undefined}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t("web.lists.selectList", "Select a list")}
                />
              </SelectTrigger>
              <SelectContent>
                {lists.map((list) => (
                  <SelectItem key={list._id} value={list._id}>
                    {list.name}
                    {gestureListIds.includes(list._id)
                      ? ` · ${t("web.lists.alreadyInList", "Already in list")}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedList ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                <ListStatusBadge list={selectedList} />
                <span className="text-muted-foreground text-sm">
                  {selectedListHasGesture
                    ? t(
                        "web.lists.gestureAlreadyInSelected",
                        "This gesture is already in this list."
                      )
                    : t(
                        "web.lists.gestureNotInSelected",
                        "This gesture is not in this list yet."
                      )}
                </span>
              </div>
            ) : null}
          </div>

          <div className="grid gap-2 border-border border-t pt-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              onChange={(event) => setNewListName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  createListAndAddPendingGesture();
                }
              }}
              placeholder={t("web.lists.newListPlaceholder", "New list name")}
              value={newListName}
            />
            <Button
              disabled={isAddingGesture || !newListName.trim()}
              onClick={createListAndAddPendingGesture}
              type="button"
              variant="outline"
            >
              {t("web.lists.createAndAdd", "Create and add")}
            </Button>
          </div>

          <DialogFooter>
            <Button
              disabled={isAddingGesture}
              onClick={() => setIsPickerOpen(false)}
              type="button"
              variant="ghost"
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={isAddingGesture || !selectedListId}
              onClick={() => {
                if (selectedListId) {
                  if (selectedListHasGesture) {
                    removePendingGestureFromList(selectedListId);
                  } else {
                    addPendingGestureToList(selectedListId);
                  }
                }
              }}
              type="button"
              variant={selectedListHasGesture ? "destructive" : "default"}
            >
              {isAddingGesture
                ? t("web.lists.adding", "Adding...")
                : selectedListHasGesture
                  ? t("web.lists.removeFromSelected", "Remove from selected")
                  : t("web.lists.addToSelected", "Add to selected")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListsContext.Provider>
  );
}

export function useLists() {
  const context = useContext(ListsContext);
  if (!context) {
    throw new Error("useLists must be used within ListsProvider");
  }
  return context;
}
