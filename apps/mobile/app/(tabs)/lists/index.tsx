import { useTranslation } from "@smog/i18n/react";
import { useLists } from "@smog/lists/client";
import type { ListSummary } from "@smog/lists/schema";
import {
  Badge,
  Button,
  ErrorState,
  IconButton,
  ListItem,
  ListsEmptyState,
  Skeleton,
  useColor,
} from "@smog/ui-native";
import { Stack, useRouter } from "expo-router";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ListIcon from "lucide-react-native/icons/list";
import Plus from "lucide-react-native/icons/plus";
import { type ReactElement, useCallback, useState } from "react";
import { FlatList, type ListRenderItemInfo, View } from "react-native";
import { ConnectionBanner } from "@/components/connection-banner";
import { HeaderActions } from "@/components/header-actions";
import { ListNameSheet } from "@/components/list-name-sheet";
import { type AppQueryUtils, useRetry } from "@/lib/retry";
import { SCREEN_CONTENT_CLASS_NAME, SCREEN_SCROLL_OPTIONS } from "@/lib/screen";

const listQueries = (rpc: AppQueryUtils) => [rpc.lists.key()];

function ListRow({
  list,
  onOpen,
}: {
  list: ListSummary;
  onOpen: (id: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const muted = useColor("mutedForeground");
  const shared = list.shares.view || list.shares.edit;
  const { id } = list;
  const open = useCallback(() => onOpen(id), [id, onOpen]);
  return (
    <ListItem
      description={t("lists.itemCount", { count: list.itemCount })}
      leading={<ListIcon />}
      onPress={open}
      title={list.name}
      trailing={
        <View className="flex-row items-center gap-2">
          {shared ? <Badge variant="primary">{t("lists.shared")}</Badge> : null}
          <ChevronRight color={muted} />
        </View>
      }
    />
  );
}

function keyOf(list: ListSummary): string {
  return list.id;
}

/**
 * The user's lists, most recently changed first (on the device for guests,
 * from the account when signed in; the hook picks). The header's plus and
 * the empty state create one, which then opens.
 */
export default function ListsScreen(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { create, lists, status } = useLists();
  const [creating, setCreating] = useState(false);
  const retry = useRetry(listQueries);

  const open = useCallback(
    (id: string) => router.push({ params: { id }, pathname: "/lists/[id]" }),
    [router]
  );
  const startCreate = useCallback(() => setCreating(true), []);
  const submitCreate = useCallback(
    async (name: string) => {
      const list = await create({ name });
      open(list.id);
    },
    [create, open]
  );
  const headerRight = useCallback(
    () => (
      <HeaderActions>
        <IconButton
          icon={<Plus />}
          label={t("lists.newList")}
          onPress={startCreate}
          variant="ghost"
        />
      </HeaderActions>
    ),
    [startCreate, t]
  );
  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<ListSummary>) => (
      <ListRow list={item} onOpen={open} />
    ),
    [open]
  );

  let empty: ReactElement | null = null;
  if (status === "loading") {
    empty = (
      <View className="gap-3 px-4" testID="lists-loading">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </View>
    );
  } else if (status === "error" && lists.length === 0) {
    empty = <ErrorState onRetry={retry} />;
  } else if (lists.length === 0) {
    empty = (
      <ListsEmptyState
        action={
          <Button icon={<Plus />} onPress={startCreate} variant="secondary">
            {t("lists.newList")}
          </Button>
        }
      />
    );
  }

  return (
    <View className="flex-1 bg-background" testID="lists-screen">
      <Stack.Screen options={{ headerRight }} />
      <FlatList
        {...SCREEN_SCROLL_OPTIONS}
        contentContainerClassName={SCREEN_CONTENT_CLASS_NAME}
        data={lists}
        keyExtractor={keyOf}
        ListEmptyComponent={empty}
        ListHeaderComponent={<ConnectionBanner className="mb-2" />}
        renderItem={renderRow}
        testID="lists-scroll"
      />
      <ListNameSheet
        onOpenChange={setCreating}
        onSubmit={submitCreate}
        open={creating}
        submitLabel={t("lists.create")}
        title={t("lists.newList")}
      />
    </View>
  );
}
