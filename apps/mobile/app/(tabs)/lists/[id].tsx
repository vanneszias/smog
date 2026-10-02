import { useTranslation } from "@smog/i18n/react";
import { useList } from "@smog/lists/client";
import type { ListItem } from "@smog/lists/schema";
import {
  AlertDialog,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  ListItemsEmptyState,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Skeleton,
  Text,
  useColor,
  useToast,
} from "@smog/ui-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import GripVertical from "lucide-react-native/icons/grip-vertical";
import Pencil from "lucide-react-native/icons/pencil";
import Search from "lucide-react-native/icons/search";
import Share2 from "lucide-react-native/icons/share-2";
import Trash from "lucide-react-native/icons/trash";
import X from "lucide-react-native/icons/x";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type AccessibilityActionEvent, Pressable, View } from "react-native";
import ReorderableList, {
  type ReorderableListReorderEvent,
  reorderItems,
  useReorderableDrag,
} from "react-native-reorderable-list";
import { ConnectionBanner } from "@/components/connection-banner";
import {
  GestureRowItem,
  useOpenGesture,
  useToggleFavorite,
} from "@/components/gesture-cards";
import { ListNameSheet } from "@/components/list-name-sheet";
import { ListShareSheet } from "@/components/list-share-sheet";
import { type AppQueryUtils, useRetry } from "@/lib/retry";

const listQueries = (rpc: AppQueryUtils) => [
  rpc.lists.key(),
  rpc.gestures.byIds.key(),
];

interface RowProps {
  count: number;
  favorite: boolean;
  index: number;
  item: ListItem;
  onFavorite: (gestureId: string) => void;
  onMove: (from: number, to: number) => void;
  onOpen: (slug: string) => void;
  onRemove: (item: ListItem) => void;
}

/** A gesture in the list: drag handle, the row, its menu and the heart. */
function ReorderableRow({
  count,
  favorite,
  index,
  item,
  onFavorite,
  onMove,
  onOpen,
  onRemove,
}: RowProps): ReactElement {
  const { t } = useTranslation();
  const drag = useReorderableDrag();
  const muted = useColor("foregroundMuted");
  const moveUp = useCallback(() => onMove(index, index - 1), [index, onMove]);
  const moveDown = useCallback(() => onMove(index, index + 1), [index, onMove]);
  const removeThis = useCallback(() => onRemove(item), [item, onRemove]);
  const actions = useMemo(
    () => [
      { label: t("lists.moveUp"), name: "moveUp" },
      { label: t("lists.moveDown"), name: "moveDown" },
    ],
    [t]
  );
  // Screen readers move the row with the handle's actions instead of a drag.
  const onAccessibilityAction = useCallback(
    ({ nativeEvent }: AccessibilityActionEvent) => {
      if (nativeEvent.actionName === "moveUp") {
        moveUp();
      } else if (nativeEvent.actionName === "moveDown") {
        moveDown();
      }
    },
    [moveDown, moveUp]
  );
  return (
    <GestureRowItem
      className="bg-background px-4"
      dragHandle={
        <Pressable
          accessibilityActions={actions}
          accessibilityHint={item.name}
          accessibilityLabel={t("a11y.dragHandle")}
          accessibilityRole="button"
          className="min-h-touch min-w-touch items-center justify-center"
          onAccessibilityAction={onAccessibilityAction}
          onPressIn={drag}
          testID={`drag-${item.id}`}
        >
          <GripVertical color={muted} />
        </Pressable>
      }
      favorite={favorite}
      gesture={item}
      onFavorite={onFavorite}
      onOpen={onOpen}
      trailing={
        <Menu>
          <MenuTrigger>
            <IconButton
              icon={<Ellipsis />}
              label={t("lists.itemActions", { name: item.name })}
              variant="ghost"
            />
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              disabled={index === 0}
              icon={<ArrowUp />}
              onSelect={moveUp}
            >
              {t("lists.moveUp")}
            </MenuItem>
            <MenuItem
              disabled={index === count - 1}
              icon={<ArrowDown />}
              onSelect={moveDown}
            >
              {t("lists.moveDown")}
            </MenuItem>
            <MenuItem icon={<X />} onSelect={removeThis} variant="danger">
              {t("lists.removeItem")}
            </MenuItem>
          </MenuContent>
        </Menu>
      }
    />
  );
}

function keyOf(item: ListItem): string {
  return item.id;
}

/**
 * One of the user's lists (a device list for guests, an account list
 * signed in; the hook picks): drag to reorder (or move up/down in a row's
 * menu), remove, rename, delete, and share (signed in; guests get a
 * sign-in prompt in the share sheet).
 */
export default function ListScreen(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const list = useList(id);
  const openGesture = useOpenGesture();
  const favorites = useToggleFavorite();
  const [sheet, setSheet] = useState<"delete" | "rename" | "share" | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  // The order being saved, shown at once (the hook's update lands a tick later).
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);

  const serverItems = list.list?.items;
  useEffect(() => {
    if (serverItems) {
      setPendingOrder(null);
    }
  }, [serverItems]);
  const items = useMemo(() => {
    const current = serverItems ?? [];
    if (!pendingOrder) {
      return current;
    }
    const byId = new Map(current.map((item) => [item.id, item]));
    return pendingOrder.flatMap((gestureId) => {
      const item = byId.get(gestureId);
      return item ? [item] : [];
    });
  }, [pendingOrder, serverItems]);

  const fail = useCallback(
    (title: string) => (error: unknown) => {
      console.error("[lists] Failed to change a list:", error);
      toast({ title, variant: "danger" });
    },
    [toast]
  );
  const { reorder, removeItem } = list;
  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || to < 0 || to >= items.length) {
        return;
      }
      const next = reorderItems(items, from, to).map((item) => item.id);
      setPendingOrder(next);
      reorder(next).catch((error: unknown) => {
        setPendingOrder(null);
        fail(t("lists.reorderFailed"))(error);
      });
    },
    [fail, items, reorder, t]
  );
  const onReorder = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => move(from, to),
    [move]
  );
  const remove = useCallback(
    (item: ListItem) => {
      removeItem(item.id)
        .then(() =>
          toast({
            title: t("lists.removedFrom", { name: list.list?.name ?? "" }),
          })
        )
        .catch(fail(t("states.actionFailed")));
    },
    [fail, list.list?.name, removeItem, t, toast]
  );
  const { remove: removeList, update } = list;
  const rename = useCallback((name: string) => update({ name }), [update]);
  const confirmDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await removeList();
      setSheet(null);
      toast({ title: t("lists.deleted"), variant: "success" });
      router.back();
    } catch (error) {
      fail(t("states.actionFailed"))(error);
    } finally {
      setDeleting(false);
    }
  }, [fail, removeList, router, t, toast]);
  const explore = useCallback(() => router.navigate("/search"), [router]);
  const goToLists = useCallback(() => router.navigate("/lists"), [router]);
  const openShare = useCallback(() => setSheet("share"), []);
  const openRename = useCallback(() => setSheet("rename"), []);
  const openDelete = useCallback(() => setSheet("delete"), []);
  const retry = useRetry(listQueries);
  const closeSheet = useCallback((open: boolean) => {
    if (!open) {
      setSheet(null);
    }
  }, []);

  const renderRow = useCallback(
    ({ index, item }: { index: number; item: ListItem }) => (
      <ReorderableRow
        count={items.length}
        favorite={favorites.isFavorite(item.id)}
        index={index}
        item={item}
        onFavorite={favorites.toggle}
        onMove={move}
        onOpen={openGesture}
        onRemove={remove}
      />
    ),
    [favorites, items.length, move, openGesture, remove]
  );

  const headerRight = useCallback(
    () =>
      list.list ? (
        <View className="flex-row items-center">
          <IconButton
            icon={<Share2 />}
            label={t("lists.share.title")}
            onPress={openShare}
            variant="ghost"
          />
          <Menu>
            <MenuTrigger>
              <IconButton
                icon={<Ellipsis />}
                label={t("lists.actions")}
                variant="ghost"
              />
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<Pencil />} onSelect={openRename}>
                {t("lists.rename")}
              </MenuItem>
              <MenuItem icon={<Trash />} onSelect={openDelete} variant="danger">
                {t("lists.delete")}
              </MenuItem>
            </MenuContent>
          </Menu>
        </View>
      ) : null,
    [list.list, openDelete, openRename, openShare, t]
  );

  let content: ReactElement;
  if (list.status === "loading") {
    content = (
      <View className="gap-3 px-4" testID="list-loading">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </View>
    );
  } else if (list.notFound) {
    content = (
      <EmptyState
        action={
          <Button onPress={goToLists} variant="secondary">
            {t("nav.lists")}
          </Button>
        }
        description={t("lists.notFound.description")}
        title={t("lists.notFound.title")}
      />
    );
  } else if (!list.list) {
    content = <ErrorState onRetry={retry} />;
  } else if (items.length === 0) {
    content = (
      <ListItemsEmptyState
        action={
          <Button icon={<Search />} onPress={explore} variant="secondary">
            {t("common.exploreGestures")}
          </Button>
        }
      />
    );
  } else {
    content = (
      <ReorderableList
        contentInsetAdjustmentBehavior="automatic"
        data={items}
        keyExtractor={keyOf}
        ListHeaderComponent={
          list.list.description ? (
            <Text className="px-4 pb-2" tone="muted">
              {list.list.description}
            </Text>
          ) : null
        }
        onReorder={onReorder}
        renderItem={renderRow}
        testID="list-items"
      />
    );
  }

  return (
    <View className="flex-1 gap-2 bg-background pt-2" testID="list-screen">
      <Stack.Screen options={{ headerRight, title: list.list?.name ?? "" }} />
      <ConnectionBanner />
      {content}
      {list.list ? (
        <>
          <ListNameSheet
            initialName={list.list.name}
            onOpenChange={closeSheet}
            onSubmit={rename}
            open={sheet === "rename"}
            submitLabel={t("common.save")}
            title={t("lists.rename")}
          />
          <ListShareSheet
            listId={id}
            listName={list.list.name}
            onOpenChange={closeSheet}
            open={sheet === "share"}
          />
          <AlertDialog
            confirmLabel={t("common.delete")}
            description={t("lists.deleteDescription", {
              name: list.list.name,
            })}
            loading={deleting}
            onConfirm={confirmDelete}
            onOpenChange={closeSheet}
            open={sheet === "delete"}
            title={t("lists.deleteTitle")}
            tone="danger"
          />
        </>
      ) : null}
    </View>
  );
}
