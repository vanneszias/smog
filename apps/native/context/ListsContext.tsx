import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useConvexUserId } from "@/context/ConvexUserSync";
import { useToast } from "@/context/ToastContext";
import { useTranslation } from "@/context/TranslationContext";
import { useNativeInteractions } from "@/hooks/useNativeInteractions";
import { trackAnalyticsEvent } from "@/lib/openpanel";
import logger from "@/utils/logger";

export interface GestureListRecord {
  _id: Id<"gesture_lists">;
  name: string;
  description?: string;
  visibility: "private" | "shared";
  viewShareToken?: string;
  editShareToken?: string;
  allowSharedEditing: boolean;
  isDefaultFavorites: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ListPickerRequest {
  gestureId: string;
  gestureName?: string;
  source: "gesture_detail" | "gesture_list" | "search_results";
}

interface ListsContextValue {
  containingListIds: Set<string>;
  createList: (name: string) => Promise<Id<"gesture_lists"> | null>;
  createListAndAddGesture: (name: string) => Promise<void>;
  closeListPicker: () => void;
  isGestureSaved: (gestureId: string) => boolean;
  isPickerBusy: boolean;
  isPickerLoading: boolean;
  lists: GestureListRecord[] | undefined;
  openListPicker: (request: ListPickerRequest) => void;
  pendingGesture: ListPickerRequest | null;
  togglePendingGestureInList: (list: GestureListRecord) => Promise<void>;
}

const ListsContext = createContext<ListsContextValue | null>(null);

export function useLists() {
  const value = useContext(ListsContext);
  if (!value) {
    throw new Error("useLists must be used within ListsProvider");
  }
  return value;
}

export function ListsProvider({ children }: { children: React.ReactNode }) {
  const userId = useConvexUserId();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { triggerHaptic, triggerSelection } = useNativeInteractions();
  const [pendingGesture, setPendingGesture] =
    useState<ListPickerRequest | null>(null);
  const [isPickerBusy, setIsPickerBusy] = useState(false);

  const initializeUserLists = useMutation(api.lists.initializeUserLists);
  const createListMutation = useMutation(api.lists.createList);
  const addGestureToList = useMutation(api.lists.addGestureToList);
  const removeGestureFromList = useMutation(api.lists.removeGestureFromList);

  const queriedLists = useQuery(
    api.lists.listUserLists,
    userId ? { userId } : "skip"
  ) as GestureListRecord[] | undefined;
  const savedGestureIds = useQuery(
    api.lists.getSavedGestureIds,
    userId ? { userId } : "skip"
  );
  const gestureListIds = useQuery(
    api.lists.getGestureListIds,
    userId && pendingGesture
      ? {
          userId,
          gestureId: pendingGesture.gestureId as Id<"gestures">,
        }
      : "skip"
  );

  useEffect(() => {
    if (!userId) {
      return;
    }
    initializeUserLists({ userId }).catch((error) => {
      logger.error("[lists] Failed to initialize lists:", error);
    });
  }, [initializeUserLists, userId]);

  const savedGestureIdSet = useMemo(
    () => new Set((savedGestureIds ?? []).map(String)),
    [savedGestureIds]
  );
  const lists = useMemo(
    () =>
      queriedLists
        ? [...queriedLists].sort(
            (left, right) =>
              Number(right.isDefaultFavorites) - Number(left.isDefaultFavorites)
          )
        : undefined,
    [queriedLists]
  );
  const containingListIds = useMemo(
    () => new Set((gestureListIds ?? []).map(String)),
    [gestureListIds]
  );
  const isPickerLoading = Boolean(
    userId && pendingGesture && gestureListIds === undefined
  );

  const isGestureSaved = useCallback(
    (gestureId: string) => savedGestureIdSet.has(gestureId),
    [savedGestureIdSet]
  );

  const openListPicker = useCallback((request: ListPickerRequest) => {
    setPendingGesture(request);
  }, []);

  const closeListPicker = useCallback(() => {
    if (!isPickerBusy) {
      setPendingGesture(null);
    }
  }, [isPickerBusy]);

  const createList = useCallback(
    async (name: string) => {
      const normalizedName = name.trim();
      if (!(userId && normalizedName)) {
        return null;
      }

      try {
        const listId = await createListMutation({
          userId,
          name: normalizedName,
          visibility: "private",
          allowSharedEditing: false,
        });
        triggerHaptic("success");
        showToast(t("lists.listCreated", { name: normalizedName }));
        return listId;
      } catch (error) {
        logger.error("[lists] Failed to create list:", error);
        triggerHaptic("error");
        showToast(t("lists.saveFailed"));
        return null;
      }
    },
    [createListMutation, showToast, t, triggerHaptic, userId]
  );

  const togglePendingGestureInList = useCallback(
    async (list: GestureListRecord) => {
      if (!(userId && pendingGesture) || isPickerBusy) {
        return;
      }

      const isContained = containingListIds.has(String(list._id));
      const listName = list.isDefaultFavorites
        ? t("lists.favorites")
        : list.name;
      setIsPickerBusy(true);
      try {
        if (isContained) {
          await removeGestureFromList({
            userId,
            listId: list._id,
            gestureId: pendingGesture.gestureId as Id<"gestures">,
          });
        } else {
          await addGestureToList({
            userId,
            listId: list._id,
            gestureId: pendingGesture.gestureId as Id<"gestures">,
          });
        }
        trackAnalyticsEvent("gesture_collection_changed", {
          action: isContained ? "removed" : "added",
          collection: "list",
          gesture_id: pendingGesture.gestureId,
          source: pendingGesture.source,
        });
        triggerSelection();
        showToast(
          isContained
            ? t("lists.removedFromList", { name: listName })
            : t("lists.addedToList", { name: listName })
        );
        setPendingGesture(null);
      } catch (error) {
        logger.error("[lists] Failed to update gesture membership:", error);
        triggerHaptic("error");
        showToast(isContained ? t("lists.removeFailed") : t("lists.addFailed"));
      } finally {
        setIsPickerBusy(false);
      }
    },
    [
      addGestureToList,
      containingListIds,
      isPickerBusy,
      pendingGesture,
      removeGestureFromList,
      showToast,
      t,
      triggerHaptic,
      triggerSelection,
      userId,
    ]
  );

  const createListAndAddGesture = useCallback(
    async (name: string) => {
      const normalizedName = name.trim();
      if (!(userId && pendingGesture && normalizedName) || isPickerBusy) {
        return;
      }

      setIsPickerBusy(true);
      try {
        const listId = await createListMutation({
          userId,
          name: normalizedName,
          visibility: "private",
          allowSharedEditing: false,
        });
        await addGestureToList({
          userId,
          listId,
          gestureId: pendingGesture.gestureId as Id<"gestures">,
        });
        trackAnalyticsEvent("gesture_collection_changed", {
          action: "added",
          collection: "list",
          gesture_id: pendingGesture.gestureId,
          source: pendingGesture.source,
        });
        triggerHaptic("success");
        showToast(t("lists.createdAndAdded", { name: normalizedName }));
        setPendingGesture(null);
      } catch (error) {
        logger.error("[lists] Failed to create list and add gesture:", error);
        triggerHaptic("error");
        showToast(t("lists.addFailed"));
      } finally {
        setIsPickerBusy(false);
      }
    },
    [
      addGestureToList,
      createListMutation,
      isPickerBusy,
      pendingGesture,
      showToast,
      t,
      triggerHaptic,
      userId,
    ]
  );

  const value = useMemo(
    () => ({
      containingListIds,
      createList,
      createListAndAddGesture,
      closeListPicker,
      isGestureSaved,
      isPickerBusy,
      isPickerLoading,
      lists,
      openListPicker,
      pendingGesture,
      togglePendingGestureInList,
    }),
    [
      containingListIds,
      createList,
      createListAndAddGesture,
      closeListPicker,
      isGestureSaved,
      isPickerBusy,
      isPickerLoading,
      lists,
      openListPicker,
      pendingGesture,
      togglePendingGestureInList,
    ]
  );

  return (
    <ListsContext.Provider value={value}>{children}</ListsContext.Provider>
  );
}
