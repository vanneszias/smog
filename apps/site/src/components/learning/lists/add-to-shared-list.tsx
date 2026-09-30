import { useGestureSearch } from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  Button,
  ErrorState,
  GestureRow,
  IconButton,
  NoResultsEmptyState,
  SearchField,
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@smog/ui-web";
import { Plus } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { SEARCH_LIMIT } from "@/lib/gesture-queries";
import { GestureRowsSkeleton } from "../gesture-cards";

function AddButton({
  gesture,
  onAdd,
}: {
  gesture: { id: string; name: string };
  onAdd: (gestureId: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const add = useCallback(() => onAdd(gesture.id), [gesture.id, onAdd]);
  return (
    <IconButton
      icon={<Plus />}
      label={t("lists.shared.addOne", { name: gesture.name })}
      onClick={add}
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
}): ReactNode {
  const { t } = useTranslation();
  const search = useGestureSearch({ limit: SEARCH_LIMIT, q });
  const { refetch } = search;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  if (search.isError && !search.data) {
    return <ErrorState onRetry={retry} retrying={search.isRefetching} />;
  }
  if (!search.data) {
    return <GestureRowsSkeleton count={4} />;
  }
  if (search.data.items.length === 0) {
    return <NoResultsEmptyState />;
  }
  return (
    <ul className="flex flex-col gap-1">
      {search.data.items.map((gesture) => (
        <li key={gesture.id}>
          <GestureRow
            gesture={gesture}
            trailing={
              present.has(gesture.id) ? (
                <Badge variant="primary">{t("lists.shared.inList")}</Badge>
              ) : (
                <AddButton gesture={gesture} onAdd={onAdd} />
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}

/** Edit links: search the catalogue and add gestures to the shared list. */
export function AddToSharedList({
  listName,
  onAdd,
  present,
}: {
  listName: string;
  onAdd: (gestureId: string) => void;
  present: readonly string[];
}): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const presentIds = useMemo(() => new Set(present), [present]);
  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button icon={<Plus />}>{t("lists.shared.add")}</Button>
      </SheetTrigger>
      <SheetContent title={t("lists.shared.addTitle", { name: listName })}>
        <SearchField
          aria-label={t("home.searchLabel")}
          onValueChange={setQ}
          placeholder={t("home.searchPlaceholder")}
          value={q}
        />
        {open ? <Results onAdd={onAdd} present={presentIds} q={q} /> : null}
      </SheetContent>
    </Sheet>
  );
}
