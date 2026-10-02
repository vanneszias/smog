import { useTranslation } from "@smog/i18n/react";
import { useList } from "@smog/lists/client";
import {
  AlertDialog,
  Button,
  EmptyState,
  ErrorState,
  Heading,
  IconButton,
  ListItemsEmptyState,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Text,
  useToast,
} from "@smog/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Ellipsis, Pencil, Share2, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { GestureRowsSkeleton } from "../gesture-cards";
import type { Hearts } from "../use-hearts";
import { ListFormDialog, type ListFormValues } from "./list-form-dialog";
import { ShareSheet } from "./share-sheet";
import { SortableItems } from "./sortable-items";

/**
 * One list (`?id=`): its name and description, share, edit and delete,
 * and its gestures in order (drag or the row menu to reorder).
 */
export function ListDetail({
  hearts,
  id,
}: {
  hearts: Hearts;
  id: string;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detail = useList(id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const openShare = useCallback(() => setSharing(true), []);
  const openEdit = useCallback(() => setEditing(true), []);
  const openDelete = useCallback(() => setDeleting(true), []);
  const retry = useCallback(() => {
    queryClient
      .invalidateQueries({ type: "active" })
      .catch((error: unknown) => {
        console.error("[lists] Failed to reload the list:", error);
      });
  }, [queryClient]);
  const { remove: removeList, update } = detail;
  const remove = useCallback((): void => {
    setRemoving(true);
    removeList()
      .then(() => navigate({ replace: true, search: {}, to: "/lists" }))
      .catch((error: unknown) => {
        console.error("[lists] Failed to delete the list:", error);
        toast({ title: t("states.actionFailed"), variant: "danger" });
      })
      .finally(() => {
        setRemoving(false);
        setDeleting(false);
      });
  }, [navigate, removeList, t, toast]);
  const save = useCallback(
    async (values: ListFormValues): Promise<void> => {
      try {
        await update(values);
      } catch (error) {
        toast({ title: t("states.actionFailed"), variant: "danger" });
        throw error;
      }
    },
    [t, toast, update]
  );

  if (detail.notFound) {
    return (
      <EmptyState
        action={
          <Button asChild variant="secondary">
            <Link to="/lists">{t("lists.all")}</Link>
          </Button>
        }
        description={t("lists.notFound.description")}
        level={2}
        title={t("lists.notFound.title")}
      />
    );
  }
  if (detail.status === "error") {
    return <ErrorState level={2} onRetry={retry} />;
  }
  const { list } = detail;
  if (!list) {
    return <GestureRowsSkeleton />;
  }

  return (
    <section aria-labelledby="list-title" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading className="break-words" id="list-title" level={2}>
            {list.name}
          </Heading>
          {list.description ? (
            <Text tone="muted">{list.description}</Text>
          ) : null}
          <Text size="body-sm" tone="muted">
            {t("lists.itemCount", { count: list.items.length })}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Button icon={<Share2 />} onClick={openShare} variant="secondary">
            {t("common.share")}
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <IconButton icon={<Ellipsis />} label={t("lists.actions")} />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem icon={<Pencil />} onSelect={openEdit}>
                {t("lists.rename")}
              </MenuItem>
              <MenuItem
                icon={<Trash2 />}
                onSelect={openDelete}
                variant="danger"
              >
                {t("lists.delete")}
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
      {list.items.length === 0 ? (
        <ListItemsEmptyState
          action={
            <Button asChild>
              <Link to="/gestures">{t("search.browse")}</Link>
            </Button>
          }
          level={3}
        />
      ) : (
        <SortableItems
          hearts={hearts}
          items={list.items}
          onRemove={detail.removeItem}
          onReorder={detail.reorder}
        />
      )}
      <ListFormDialog
        initial={{ description: list.description ?? "", name: list.name }}
        onOpenChange={setEditing}
        onSubmit={save}
        open={editing}
        submitLabel={t("common.save")}
        title={t("lists.renameTitle")}
      />
      <AlertDialog
        confirmLabel={t("common.delete")}
        description={t("lists.deleteDescription", { name: list.name })}
        loading={removing}
        onConfirm={remove}
        onOpenChange={setDeleting}
        open={deleting}
        title={t("lists.deleteTitle")}
        tone="danger"
      />
      <ShareSheet listId={id} onOpenChange={setSharing} open={sharing} />
    </section>
  );
}
