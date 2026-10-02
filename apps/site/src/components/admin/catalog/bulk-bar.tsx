import { useAdminGestureMutations } from "@smog/admin/client";
import type { AdminCategory, BulkUpdateInput } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Text,
  useToast,
} from "@smog/ui-web";
import {
  ChevronDown,
  Eye,
  EyeOff,
  FolderMinus,
  FolderPlus,
  ListChecks,
  X,
} from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { errorCode } from "./errors";

export interface BulkBarProps {
  categories: readonly AdminCategory[];
  onClear: () => void;
  /** After an action succeeded: clears the selection and moves the focus. */
  onDone: () => void;
  /** The selected gesture ids (at most `BULK_UPDATE_MAX`, one page). */
  selected: readonly string[];
}

function CategoryItem({
  category,
  onPick,
}: {
  category: AdminCategory;
  onPick: (id: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const pick = useCallback(() => onPick(category.id), [category.id, onPick]);
  return (
    <MenuItem onSelect={pick}>
      {category.publishedAt === null
        ? t("admin.categories.hiddenName", { name: category.name })
        : category.name}
    </MenuItem>
  );
}

function CategoryMenu({
  categories,
  disabled,
  icon,
  label,
  onPick,
}: {
  categories: readonly AdminCategory[];
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onPick: (id: string) => void;
}): ReactNode {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button disabled={disabled} icon={icon} variant="secondary">
          {label}
          <ChevronDown aria-hidden="true" className="size-4" />
        </Button>
      </MenuTrigger>
      <MenuContent align="start" className="max-h-80 overflow-y-auto">
        {categories.map((category) => (
          <CategoryItem category={category} key={category.id} onPick={onPick} />
        ))}
      </MenuContent>
    </Menu>
  );
}

/** Phones: every action in one menu, so the bar stays one row. */
function CompactActions({
  busy,
  categories,
  onAdd,
  onPublish,
  onRemove,
  onUnpublish,
}: {
  busy: boolean;
  categories: readonly AdminCategory[];
  onAdd: (id: string) => void;
  onPublish: () => void;
  onRemove: (id: string) => void;
  onUnpublish: () => void;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button disabled={busy} icon={<ListChecks />} loading={busy}>
          {t("admin.gestures.bulk.actions")}
          <ChevronDown aria-hidden="true" className="size-4" />
        </Button>
      </MenuTrigger>
      <MenuContent align="start" className="max-h-96 overflow-y-auto">
        <MenuItem icon={<Eye />} onSelect={onPublish}>
          {t("admin.gestures.bulk.publish")}
        </MenuItem>
        <MenuItem icon={<EyeOff />} onSelect={onUnpublish}>
          {t("admin.gestures.bulk.unpublish")}
        </MenuItem>
        {categories.length > 0 ? (
          <>
            <MenuSeparator />
            <MenuLabel>{t("admin.gestures.bulk.addCategory")}</MenuLabel>
            {categories.map((category) => (
              <CategoryItem
                category={category}
                key={`add-${category.id}`}
                onPick={onAdd}
              />
            ))}
            <MenuSeparator />
            <MenuLabel>{t("admin.gestures.bulk.removeCategory")}</MenuLabel>
            {categories.map((category) => (
              <CategoryItem
                category={category}
                key={`remove-${category.id}`}
                onPick={onRemove}
              />
            ))}
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

/**
 * The selection's actions (A-19): publish, unpublish, add to or remove
 * from a category, each one `bulkUpdate` (all or nothing, one audit entry).
 * On a phone the actions sit in one menu.
 */
export function BulkBar({
  categories,
  onClear,
  onDone,
  selected,
}: BulkBarProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { bulkUpdate } = useAdminGestureMutations();
  const run = useCallback(
    (patch: Omit<BulkUpdateInput, "ids">) => {
      bulkUpdate
        .mutateAsync({ ...patch, ids: [...selected] })
        .then(({ updated }) => {
          toast({
            title: t("admin.gestures.bulk.done", { count: updated }),
            variant: "success",
          });
          onDone();
        })
        .catch((error: unknown) => {
          console.error(
            "[admin] Failed to update the selected gestures:",
            error
          );
          toast({
            title:
              errorCode(error) === "INVALID_STATE"
                ? t("admin.gestures.bulk.noCategoryLeft")
                : t("admin.gestures.errors.saveFailed"),
            variant: "danger",
          });
        });
    },
    [bulkUpdate, onDone, selected, t, toast]
  );
  const publish = useCallback(() => run({ published: true }), [run]);
  const unpublish = useCallback(() => run({ published: false }), [run]);
  const add = useCallback((id: string) => run({ addCategoryIds: [id] }), [run]);
  const remove = useCallback(
    (id: string) => run({ removeCategoryIds: [id] }),
    [run]
  );
  const busy = bulkUpdate.isPending;
  return (
    <section
      aria-label={t("admin.gestures.bulk.label")}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-primary bg-primary-subtle p-2"
    >
      <Text
        as="span"
        className="px-2 tabular-nums"
        role="status"
        size="body-sm"
        weight="medium"
      >
        {t("admin.gestures.bulk.selected", { count: selected.length })}
      </Text>
      <div className="sm:hidden">
        <CompactActions
          busy={busy}
          categories={categories}
          onAdd={add}
          onPublish={publish}
          onRemove={remove}
          onUnpublish={unpublish}
        />
      </div>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        <Button disabled={busy} icon={<Eye />} loading={busy} onClick={publish}>
          {t("admin.gestures.bulk.publish")}
        </Button>
        <Button
          disabled={busy}
          icon={<EyeOff />}
          onClick={unpublish}
          variant="secondary"
        >
          {t("admin.gestures.bulk.unpublish")}
        </Button>
        <CategoryMenu
          categories={categories}
          disabled={busy || categories.length === 0}
          icon={<FolderPlus />}
          label={t("admin.gestures.bulk.addCategory")}
          onPick={add}
        />
        <CategoryMenu
          categories={categories}
          disabled={busy || categories.length === 0}
          icon={<FolderMinus />}
          label={t("admin.gestures.bulk.removeCategory")}
          onPick={remove}
        />
      </div>
      <Button icon={<X />} onClick={onClear} variant="ghost">
        <span className="sr-only sm:not-sr-only">
          {t("admin.gestures.bulk.clear")}
        </span>
      </Button>
    </section>
  );
}
