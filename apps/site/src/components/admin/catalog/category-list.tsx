import {
  useAdminCategories,
  useAdminCategoryMutations,
} from "@smog/admin/client";
import { type AdminCategory, CATEGORY_NAME_MAX } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Button,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  Heading,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Skeleton,
  Switch,
  Text,
  useToast,
} from "@smog/ui-web";
import {
  ArrowDown,
  ArrowUp,
  Ellipsis,
  Eye,
  EyeOff,
  FolderTree,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useState,
} from "react";
import {
  type ReorderEvent,
  type ReorderPosition,
  SortableList,
  type SortableRowArgs,
} from "@/components/sortable-list";
import { conflictReason } from "./errors";

const REORDER_KEYS = {
  cancelled: "admin.categories.reorder.cancelled",
  dropped: "admin.categories.reorder.dropped",
  moved: "admin.categories.reorder.moved",
  picked: "admin.categories.reorder.picked",
} as const satisfies Record<ReorderEvent, string>;

interface RowActions {
  onDelete: (category: AdminCategory) => void;
  onRename: (category: AdminCategory) => void;
}

function PublishSwitch({ category }: { category: AdminCategory }): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setPublished } = useAdminCategoryMutations();
  const toggle = useCallback(
    (published: boolean) => {
      setPublished
        .mutateAsync({ id: category.id, published })
        .then(() =>
          toast({
            title: published
              ? t("admin.categories.publishedToast", { name: category.name })
              : t("admin.categories.unpublishedToast", { name: category.name }),
            variant: "success",
          })
        )
        .catch((error: unknown) => {
          console.error("[admin] Failed to publish the category:", error);
          toast({
            title: t("admin.categories.errors.saveFailed"),
            variant: "danger",
          });
        });
    },
    [category.id, category.name, setPublished, t, toast]
  );
  return (
    <Switch
      aria-label={t("admin.categories.publishToggle", { name: category.name })}
      checked={category.publishedAt !== null}
      disabled={setPublished.isPending}
      onCheckedChange={toggle}
    />
  );
}

function CategoryRow({
  actions,
  dragHandle,
  isDragging,
  item: category,
  moveDown,
  moveUp,
}: SortableRowArgs<AdminCategory> & { actions: RowActions }): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setPublished } = useAdminCategoryMutations();
  const published = category.publishedAt !== null;
  const used = category.gestureCount > 0;
  const rename = useCallback(
    () => actions.onRename(category),
    [actions, category]
  );
  const remove = useCallback(
    () => actions.onDelete(category),
    [actions, category]
  );
  const toggle = useCallback(() => {
    setPublished
      .mutateAsync({ id: category.id, published: !published })
      .catch((error: unknown) => {
        console.error("[admin] Failed to publish the category:", error);
        toast({
          title: t("admin.categories.errors.saveFailed"),
          variant: "danger",
        });
      });
  }, [category.id, published, setPublished, t, toast]);
  return (
    <div
      className={cn(
        "flex min-h-touch items-center gap-2 rounded-lg border border-border-subtle bg-surface py-1 pr-1 pl-1",
        isDragging && "bg-surface-raised shadow-2"
      )}
      data-testid="category-row"
    >
      {dragHandle}
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
        <Text className="truncate" weight="medium">
          {category.name}
        </Text>
        <Text as="span" className="tabular-nums" size="body-sm" tone="muted">
          {t("admin.categories.count", { count: category.gestureCount })}
          {used
            ? ` · ${t("admin.categories.publishedCount", {
                count: category.publishedGestureCount,
              })}`
            : null}
        </Text>
      </div>
      <PublishSwitch category={category} />
      <Menu>
        <MenuTrigger asChild>
          <IconButton
            icon={<Ellipsis />}
            label={t("admin.categories.rowActions", { name: category.name })}
          />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem
            disabled={!moveUp}
            icon={<ArrowUp />}
            onSelect={moveUp ?? undefined}
          >
            {t("admin.categories.moveUp")}
          </MenuItem>
          <MenuItem
            disabled={!moveDown}
            icon={<ArrowDown />}
            onSelect={moveDown ?? undefined}
          >
            {t("admin.categories.moveDown")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Pencil />} onSelect={rename}>
            {t("admin.categories.rename")}
          </MenuItem>
          <MenuItem icon={published ? <EyeOff /> : <Eye />} onSelect={toggle}>
            {published
              ? t("admin.categories.unpublish")
              : t("admin.categories.publish")}
          </MenuItem>
          <MenuSeparator />
          {used ? (
            <MenuItem disabled icon={<Trash2 />}>
              {t("admin.categories.inUse")}
            </MenuItem>
          ) : (
            <MenuItem icon={<Trash2 />} onSelect={remove} variant="danger">
              {t("admin.categories.delete")}
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
    </div>
  );
}

type FormTarget =
  | { kind: "create" }
  | { category: AdminCategory; kind: "rename" };

function CategoryForm({
  onDone,
  target,
}: {
  onDone: () => void;
  target: FormTarget;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { create, update } = useAdminCategoryMutations();
  const initial = target.kind === "rename" ? target.category.name : "";
  const [name, setName] = useState(initial);
  const [published, setPublishedDraft] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
    setError(null);
  }, []);
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > CATEGORY_NAME_MAX) {
        setError(t("admin.gestures.editor.nameRequired"));
        return;
      }
      const saving =
        target.kind === "create"
          ? create
              .mutateAsync({ name: trimmed, published })
              .then((created) =>
                t("admin.categories.form.created", { name: created.name })
              )
          : update
              .mutateAsync({
                expectedUpdatedAt: target.category.updatedAt,
                id: target.category.id,
                name: trimmed,
              })
              .then(() => t("admin.categories.form.renamed"));
      saving
        .then((title) => {
          toast({ title, variant: "success" });
          onDone();
        })
        .catch((failure: unknown) => {
          console.error("[admin] Failed to save the category:", failure);
          const reason = conflictReason(failure);
          if (reason === "duplicateName") {
            setError(t("admin.categories.form.duplicate"));
          } else if (reason === "stale") {
            setError(t("admin.categories.form.stale"));
          } else {
            setError(t("admin.categories.errors.saveFailed"));
          }
        });
    },
    [create, name, onDone, published, t, target, toast, update]
  );
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
      <Field
        counter={{ count: name.trim().length, max: CATEGORY_NAME_MAX }}
        error={error ?? undefined}
        hint={
          target.kind === "rename"
            ? t("admin.categories.form.slugNote")
            : undefined
        }
        label={t("admin.categories.form.name")}
        required
      >
        <Input autoComplete="off" onChange={onName} value={name} />
      </Field>
      {target.kind === "create" ? (
        <Switch
          checked={published}
          label={t("admin.categories.form.published")}
          onCheckedChange={setPublishedDraft}
        />
      ) : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">{t("kit.cancel")}</Button>
        </DialogClose>
        <Button loading={create.isPending || update.isPending} type="submit">
          {target.kind === "create"
            ? t("admin.categories.form.create")
            : t("admin.categories.form.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Section({
  actions,
  categories,
  empty,
  onReorder,
  title,
}: {
  actions: RowActions;
  categories: readonly AdminCategory[];
  empty: string;
  onReorder: (ids: readonly string[]) => Promise<unknown>;
  title: string;
}): ReactNode {
  const { t } = useTranslation();
  const headingId = useId();
  const announce = useCallback(
    (event: ReorderEvent, position: ReorderPosition) =>
      t(REORDER_KEYS[event], { ...position }),
    [t]
  );
  const renderRow = useCallback(
    (args: SortableRowArgs<AdminCategory>) => (
      <CategoryRow {...args} actions={actions} />
    ),
    [actions]
  );
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <Heading id={headingId} level={2}>
        {title}{" "}
        <span className="font-regular text-foreground-muted tabular-nums">
          ({categories.length})
        </span>
      </Heading>
      {categories.length === 0 ? (
        <Text size="body-sm" tone="muted">
          {empty}
        </Text>
      ) : (
        <SortableList
          announce={announce}
          failedMessage={t("admin.categories.reorder.failed")}
          instructions={t("admin.categories.reorder.instructions")}
          items={categories}
          onReorder={onReorder}
          renderRow={renderRow}
        />
      )}
    </section>
  );
}

/**
 * `/admin/categories` (A-22): every category from D1 in `sort_order`, in a
 * published and a hidden section with gesture counts. Create, rename,
 * publish, reorder (drag by pointer or keyboard, or move up/down; the whole
 * order is one `reorder`) and delete, which is offered only while no
 * gesture uses the category.
 */
export function CategoryList(): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const categories = useAdminCategories();
  const { remove, reorder } = useAdminCategoryMutations();
  const [form, setForm] = useState<FormTarget | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const all = categories.data ?? [];
  const published = useMemo(
    () => all.filter((category) => category.publishedAt !== null),
    [all]
  );
  const hidden = useMemo(
    () => all.filter((category) => category.publishedAt === null),
    [all]
  );
  const reorderPublished = useCallback(
    (ids: readonly string[]) =>
      reorder.mutateAsync({
        ids: [...ids, ...hidden.map((category) => category.id)],
      }),
    [hidden, reorder]
  );
  const reorderHidden = useCallback(
    (ids: readonly string[]) =>
      reorder.mutateAsync({
        ids: [...published.map((category) => category.id), ...ids],
      }),
    [published, reorder]
  );
  const actions = useMemo<RowActions>(
    () => ({
      onDelete: setDeleting,
      onRename: (category) => setForm({ category, kind: "rename" }),
    }),
    []
  );
  const openCreate = useCallback(() => setForm({ kind: "create" }), []);
  const closeForm = useCallback(() => setForm(null), []);
  const onFormOpen = useCallback((open: boolean) => {
    if (!open) {
      setForm(null);
    }
  }, []);
  const onDeleteOpen = useCallback((open: boolean) => {
    if (!open) {
      setDeleting(null);
    }
  }, []);
  const confirmDelete = useCallback(() => {
    if (!deleting) {
      return;
    }
    const { id, name } = deleting;
    remove
      .mutateAsync({ id })
      .then(() =>
        toast({
          title: t("admin.categories.deleteConfirm.deleted", { name }),
          variant: "success",
        })
      )
      .catch((error: unknown) => {
        console.error("[admin] Failed to delete the category:", error);
        toast({
          title:
            conflictReason(error) === "inUse"
              ? t("admin.categories.deleteConfirm.inUse")
              : t("admin.categories.errors.saveFailed"),
          variant: "danger",
        });
      });
  }, [deleting, remove, t, toast]);
  const { refetch } = categories;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the categories:", error);
    });
  }, [refetch]);

  let body: ReactNode;
  if (categories.data) {
    body =
      all.length === 0 ? (
        <EmptyState
          action={
            <Button icon={<Plus />} onClick={openCreate}>
              {t("admin.categories.new")}
            </Button>
          }
          description={t("admin.categories.empty.description")}
          icon={<FolderTree />}
          level={2}
          title={t("admin.categories.empty.title")}
        />
      ) : (
        <div className="flex max-w-content flex-col gap-6">
          <Section
            actions={actions}
            categories={published}
            empty={t("admin.categories.sections.publishedEmpty")}
            onReorder={reorderPublished}
            title={t("admin.categories.sections.published")}
          />
          <Section
            actions={actions}
            categories={hidden}
            empty={t("admin.categories.sections.hiddenEmpty")}
            onReorder={reorderHidden}
            title={t("admin.categories.sections.hidden")}
          />
        </div>
      );
  } else if (categories.isError) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else {
    body = <Skeleton className="h-96 w-full max-w-content" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button icon={<Plus />} onClick={openCreate}>
          {t("admin.categories.new")}
        </Button>
      </div>
      {body}
      <Dialog onOpenChange={onFormOpen} open={form !== null}>
        {form ? (
          <DialogContent
            title={
              form.kind === "create"
                ? t("admin.categories.form.createTitle")
                : t("admin.categories.form.renameTitle", {
                    name: form.category.name,
                  })
            }
          >
            <CategoryForm onDone={closeForm} target={form} />
          </DialogContent>
        ) : null}
      </Dialog>
      <AlertDialog
        confirmLabel={t("admin.categories.deleteConfirm.confirm")}
        description={t("admin.categories.deleteConfirm.description")}
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onOpenChange={onDeleteOpen}
        open={deleting !== null}
        title={t("admin.categories.deleteConfirm.title", {
          name: deleting?.name ?? "",
        })}
        tone="danger"
      />
    </div>
  );
}
