import { useTranslation } from "@smog/i18n/react";
import { useSharedList } from "@smog/lists/client";
import type { ListItem } from "@smog/lists/schema";
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  ListItemsEmptyState,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import LogIn from "lucide-react-native/icons/log-in";
import Plus from "lucide-react-native/icons/plus";
import X from "lucide-react-native/icons/x";
import { type ReactElement, useCallback, useMemo, useState } from "react";
import { FlatList, type ListRenderItemInfo, View } from "react-native";
import { AddToSharedList } from "@/components/add-to-shared-list";
import { ConnectionBanner } from "@/components/connection-banner";
import {
  GestureRowItem,
  useOpenGesture,
  useToggleFavorite,
} from "@/components/gesture-cards";
import { type AppQueryUtils, useRetry } from "@/lib/retry";

const sharedQueries = (rpc: AppQueryUtils) => [rpc.lists.shared.get.key()];

/** Takes a gesture out of the list (edit links, signed in). */
function RemoveButton({
  gestureId,
  onRemove,
}: {
  gestureId: string;
  onRemove: (gestureId: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const remove = useCallback(() => onRemove(gestureId), [gestureId, onRemove]);
  return (
    <IconButton
      icon={<X />}
      label={t("lists.removeItem")}
      onPress={remove}
      variant="ghost"
    />
  );
}

function keyOf(item: ListItem): string {
  return item.id;
}

/**
 * A list behind a share link (`/lists/<token>` on the site). Anyone can
 * view it; with an edit link a signed-in user can also add gestures (the
 * header's "Add gestures" sheet) and take them out, as on the site, and a
 * guest with an edit link is asked to sign in. Revoked or unknown links
 * show "not found".
 */
export default function SharedListScreen(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { token = "" } = useLocalSearchParams<{ token: string }>();
  const shared = useSharedList(token);
  const open = useOpenGesture();
  const { isFavorite, toggle } = useToggleFavorite();
  const { addItem, canEdit, removeItem } = shared;
  const retry = useRetry(sharedQueries);
  const [adding, setAdding] = useState(false);
  const listName = shared.data?.list.name ?? "";

  const add = useCallback(
    (gestureId: string) => {
      addItem(gestureId)
        .then((added) => {
          // Nothing to say when it was there already, or a double tap.
          if (added) {
            toast({
              title: t("lists.addedTo", { name: listName }),
              variant: "success",
            });
          }
        })
        .catch((error: unknown) => {
          console.error("[lists] Failed to add to a shared list:", error);
          toast({ title: t("states.actionFailed"), variant: "danger" });
        });
    },
    [addItem, listName, t, toast]
  );
  const present = useMemo(
    () => shared.data?.items.map((item) => item.id) ?? [],
    [shared.data]
  );
  const startAdding = useCallback(() => setAdding(true), []);
  const headerRight = useCallback(
    () =>
      canEdit ? (
        <IconButton
          icon={<Plus />}
          label={t("lists.sharedView.add")}
          onPress={startAdding}
          variant="ghost"
        />
      ) : null,
    [canEdit, startAdding, t]
  );

  const remove = useCallback(
    (gestureId: string) => {
      removeItem(gestureId).catch((error: unknown) => {
        console.error("[lists] Failed to remove from a shared list:", error);
        toast({ title: t("states.actionFailed"), variant: "danger" });
      });
    },
    [removeItem, t, toast]
  );
  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<ListItem>) => (
      <GestureRowItem
        className="px-4"
        favorite={isFavorite(item.id)}
        gesture={item}
        onFavorite={toggle}
        onOpen={open}
        trailing={
          canEdit ? (
            <RemoveButton gestureId={item.id} onRemove={remove} />
          ) : null
        }
      />
    ),
    [canEdit, isFavorite, open, remove, toggle]
  );

  const { data } = shared;
  const goHome = useCallback(() => router.navigate("/"), [router]);
  const signIn = useCallback(() => router.push("/sign-in"), [router]);
  let content: ReactElement;
  if (shared.notFound) {
    content = (
      <EmptyState
        action={
          <Button onPress={goHome} variant="secondary">
            {t("states.notFound.action")}
          </Button>
        }
        description={t("lists.notFound.description")}
        title={t("lists.notFound.title")}
      />
    );
  } else if (data) {
    content = (
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={data.items}
        keyExtractor={keyOf}
        ListEmptyComponent={<ListItemsEmptyState />}
        ListHeaderComponent={
          <View className="gap-2 px-4 pb-3">
            <Text tone="muted">
              {t("lists.sharedView.by", { owner: data.list.ownerName })}
            </Text>
            {data.list.description ? (
              <Text>{data.list.description}</Text>
            ) : null}
            {canEdit ? (
              <Text size="body-sm" tone="muted">
                {t("lists.sharedCanEdit")}
              </Text>
            ) : null}
            {shared.requiresSignIn ? (
              <View className="gap-2 rounded-lg bg-surface p-4">
                <Text>{t("lists.sharedView.signInToEdit")}</Text>
                <Button
                  className="self-start"
                  icon={<LogIn />}
                  onPress={signIn}
                  variant="secondary"
                >
                  {t("nav.signIn")}
                </Button>
              </View>
            ) : null}
          </View>
        }
        renderItem={renderRow}
      />
    );
  } else if (shared.status === "error") {
    content = <ErrorState onRetry={retry} />;
  } else {
    content = (
      <View className="gap-3 px-4" testID="shared-loading">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </View>
    );
  }

  return (
    <View className="flex-1 gap-2 bg-background pt-2" testID="shared-screen">
      <Stack.Screen options={{ headerRight, title: listName }} />
      <ConnectionBanner />
      {content}
      {canEdit ? (
        <AddToSharedList
          listName={listName}
          onAdd={add}
          onOpenChange={setAdding}
          open={adding}
          present={present}
        />
      ) : null}
    </View>
  );
}
