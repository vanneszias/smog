import { useGestureSearch } from "@smog/gestures/client";
import type { GestureSummary } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  ErrorState,
  GestureRow,
  IconButton,
  NoResultsEmptyState,
  SearchField,
  Sheet,
  SheetContent,
  Skeleton,
} from "@smog/ui-native";
import Plus from "lucide-react-native/icons/plus";
import { type ReactElement, useCallback, useMemo, useState } from "react";
import { View } from "react-native";

/** Results shown in the add sheet (a search narrows them). */
const ADD_SEARCH_LIMIT = 20;

function AddButton({
  gesture,
  onAdd,
}: {
  gesture: GestureSummary;
  onAdd: (gestureId: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const add = useCallback(() => onAdd(gesture.id), [gesture.id, onAdd]);
  return (
    <IconButton
      icon={<Plus />}
      label={t("lists.sharedView.addOne", { name: gesture.name })}
      onPress={add}
      variant="ghost"
    />
  );
}

function Results({
  onAdd,
  present,
  q,
}: {
  onAdd: (gestureId: string) => void;
  present: ReadonlySet<string>;
  q: string;
}): ReactElement {
  const { t } = useTranslation();
  const search = useGestureSearch({ limit: ADD_SEARCH_LIMIT, q });
  const { refetch } = search;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  if (search.isError && !search.data) {
    return <ErrorState onRetry={retry} retrying={search.isRefetching} />;
  }
  if (!search.data) {
    return (
      <View className="gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </View>
    );
  }
  if (search.data.items.length === 0) {
    return <NoResultsEmptyState />;
  }
  return (
    <View>
      {search.data.items.map((gesture) => (
        <GestureRow
          gesture={gesture}
          key={gesture.id}
          trailing={
            present.has(gesture.id) ? (
              <Badge variant="primary">{t("lists.sharedView.inList")}</Badge>
            ) : (
              <AddButton gesture={gesture} onAdd={onAdd} />
            )
          }
        />
      ))}
    </View>
  );
}

/**
 * Edit links: a sheet that searches the catalogue and adds gestures to
 * the shared list (the site's AddToSharedList, as a bottom sheet). The
 * gestures already in the list are marked instead.
 */
export function AddToSharedList({
  listName,
  onAdd,
  onOpenChange,
  open,
  present,
}: {
  listName: string;
  onAdd: (gestureId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  present: readonly string[];
}): ReactElement {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const presentIds = useMemo(() => new Set(present), [present]);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        testID="add-to-shared-list"
        title={t("lists.sharedView.addTitle", { name: listName })}
      >
        <SearchField
          accessibilityLabel={t("home.searchLabel")}
          onValueChange={setQ}
          placeholder={t("home.searchPlaceholder")}
          value={q}
        />
        {open ? <Results onAdd={onAdd} present={presentIds} q={q} /> : null}
      </SheetContent>
    </Sheet>
  );
}
