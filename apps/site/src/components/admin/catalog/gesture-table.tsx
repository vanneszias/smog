import { useAdminGestureMutations } from "@smog/admin/client";
import type { AdminGestureRow } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  Checkbox,
  DataTable,
  type DataTableColumn,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Switch,
  Text,
  TextLink,
  useToast,
} from "@smog/ui-web";
import { muxThumbnailUrl } from "@smog/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { Ellipsis, Eye, EyeOff, Pencil, QrCode } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useAuditTime } from "@/components/admin/audit-data";
import { GestureQrDialog } from "@/components/gesture-qr-dialog";
import { useListFormat } from "./labels";

/** Chips shown per row before "+N". */
const SHOWN_CATEGORIES = 2;

/** The last column stays in view while the table scrolls sideways. */
const STICKY_END =
  "sticky right-0 z-[1] bg-surface in-data-[state=selected]:bg-primary-subtle [thead_&]:bg-surface-sunken";

export interface GestureTableProps {
  onSelectedChange: (selected: ReadonlySet<string>) => void;
  rows: readonly AdminGestureRow[];
  /** The selected ids (the bulk bar acts on them). */
  selected: ReadonlySet<string>;
}

function rowId(row: AdminGestureRow): string {
  return row.id;
}

function SelectCell({
  onToggle,
  row,
  selected,
}: {
  onToggle: (id: string, selected: boolean) => void;
  row: AdminGestureRow;
  selected: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const change = useCallback(
    (checked: boolean | "indeterminate") => onToggle(row.id, checked === true),
    [onToggle, row.id]
  );
  return (
    <Checkbox
      aria-label={t("admin.gestures.columns.selectRow", { name: row.name })}
      checked={selected}
      onCheckedChange={change}
    />
  );
}

type OnPublish = (row: AdminGestureRow, published: boolean) => void;

function PublishedCell({
  onPublish,
  pending,
  row,
}: {
  onPublish: OnPublish;
  pending: boolean;
  row: AdminGestureRow;
}): ReactNode {
  const { t } = useTranslation();
  const toggle = useCallback(
    (published: boolean) => onPublish(row, published),
    [onPublish, row]
  );
  return (
    <Switch
      aria-label={t("admin.gestures.publishToggle", { name: row.name })}
      checked={row.publishedAt !== null}
      disabled={pending}
      onCheckedChange={toggle}
    />
  );
}

function RowMenu({
  onPublish,
  onQr,
  row,
}: {
  onPublish: OnPublish;
  onQr: (row: AdminGestureRow) => void;
  row: AdminGestureRow;
}): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const published = row.publishedAt !== null;
  const edit = useCallback(() => {
    navigate({ params: { id: row.id }, to: "/admin/gestures/$id" }).catch(
      (error: unknown) => {
        console.error("[admin] Failed to open the gesture:", error);
      }
    );
  }, [navigate, row.id]);
  const qr = useCallback(() => onQr(row), [onQr, row]);
  const toggle = useCallback(
    () => onPublish(row, !published),
    [onPublish, published, row]
  );
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton
          icon={<Ellipsis />}
          label={t("admin.gestures.rowActions", { name: row.name })}
        />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem icon={<Pencil />} onSelect={edit}>
          {t("admin.gestures.edit")}
        </MenuItem>
        <MenuItem icon={<QrCode />} onSelect={qr}>
          {t("admin.gestures.qr")}
        </MenuItem>
        <MenuItem icon={published ? <EyeOff /> : <Eye />} onSelect={toggle}>
          {published
            ? t("admin.gestures.unpublish")
            : t("admin.gestures.publish")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function CategoriesCell({ row }: { row: AdminGestureRow }): ReactNode {
  const { t } = useTranslation();
  const list = useListFormat();
  if (row.categories.length === 0) {
    return (
      <Text as="span" size="body-sm" tone="muted">
        {t("admin.gestures.noCategory")}
      </Text>
    );
  }
  const shown = row.categories.slice(0, SHOWN_CATEGORIES);
  const more = row.categories.length - shown.length;
  return (
    <span
      className="flex flex-wrap items-center gap-1"
      title={list(row.categories.map((category) => category.name))}
    >
      {shown.map((category) => (
        <Badge
          key={category.id}
          variant={category.published ? "primary" : "neutral"}
        >
          {category.published ? null : (
            <EyeOff aria-hidden="true" className="size-3" />
          )}
          {category.name}
          {category.published ? null : (
            <span className="sr-only">
              {" "}
              ({t("admin.categories.hiddenMark")})
            </span>
          )}
        </Badge>
      ))}
      {more > 0 ? (
        <Badge>{t("admin.gestures.moreCategories", { count: more })}</Badge>
      ) : null}
    </span>
  );
}

/**
 * The gestures as a dense table (A-18): a selection box, the video still,
 * the name (to the editor), categories (two chips and "+N", hidden ones
 * marked), keyword count, the published switch, the last change and a row
 * menu (Edit, QR code, Publish/Unpublish).
 */
export function GestureTable({
  onSelectedChange,
  rows,
  selected,
}: GestureTableProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const time = useAuditTime();
  // One mutation for every row's switch and menu (not one per row).
  const { setPublished } = useAdminGestureMutations();
  const [qrRow, setQrRow] = useState<AdminGestureRow | null>(null);
  const publish = useCallback<OnPublish>(
    (row, published) => {
      setPublished
        .mutateAsync({ id: row.id, published })
        .then(() =>
          toast({
            title: published
              ? t("admin.gestures.publishedToast", { name: row.name })
              : t("admin.gestures.unpublishedToast", { name: row.name }),
            variant: "success",
          })
        )
        .catch((error: unknown) => {
          console.error("[admin] Failed to publish the gesture:", error);
          toast({
            title: t("admin.gestures.errors.saveFailed"),
            variant: "danger",
          });
        });
    },
    [setPublished, t, toast]
  );
  const publishing = setPublished.isPending;
  const closeQr = useCallback((open: boolean) => {
    if (!open) {
      setQrRow(null);
    }
  }, []);
  const toggleRow = useCallback(
    (id: string, on: boolean) => {
      const next = new Set(selected);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      onSelectedChange(next);
    },
    [onSelectedChange, selected]
  );
  const allSelected =
    rows.length > 0 && rows.every((row) => selected.has(row.id));
  const someSelected = rows.some((row) => selected.has(row.id));
  const toggleAll = useCallback(
    (checked: boolean | "indeterminate") =>
      onSelectedChange(
        checked === true ? new Set(rows.map((row) => row.id)) : new Set()
      ),
    [onSelectedChange, rows]
  );
  let headerChecked: boolean | "indeterminate" = false;
  if (allSelected) {
    headerChecked = true;
  } else if (someSelected) {
    headerChecked = "indeterminate";
  }
  const columns = useMemo<DataTableColumn<AdminGestureRow>[]>(
    () => [
      {
        cell: (row) => (
          <SelectCell
            onToggle={toggleRow}
            row={row}
            selected={selected.has(row.id)}
          />
        ),
        header: (
          <Checkbox
            aria-label={t("admin.gestures.columns.selectAll")}
            checked={headerChecked}
            disabled={rows.length === 0}
            onCheckedChange={toggleAll}
          />
        ),
        id: "select",
      },
      {
        cell: (row) => (
          <img
            alt=""
            className="h-12 w-9 max-w-none rounded-sm bg-surface-sunken object-cover"
            height={48}
            loading="lazy"
            src={muxThumbnailUrl(row.playbackId, { width: 72 })}
            width={36}
          />
        ),
        header: (
          <span className="sr-only">{t("admin.gestures.columns.video")}</span>
        ),
        id: "video",
      },
      {
        cell: (row) => (
          <TextLink asChild className="font-medium" tone="default">
            <Link params={{ id: row.id }} to="/admin/gestures/$id">
              {row.name}
            </Link>
          </TextLink>
        ),
        header: t("admin.gestures.columns.name"),
        id: "name",
      },
      {
        cell: (row) => <CategoriesCell row={row} />,
        header: t("admin.gestures.columns.categories"),
        id: "categories",
      },
      {
        align: "end",
        cell: (row) =>
          t("admin.gestures.keywordCount", { count: row.keywords.length }),
        header: t("admin.gestures.columns.keywords"),
        id: "keywords",
      },
      {
        cell: (row) => (
          <time
            className="whitespace-nowrap tabular-nums"
            dateTime={new Date(row.updatedAt).toISOString()}
          >
            {time(row.updatedAt)}
          </time>
        ),
        header: t("admin.gestures.columns.updated"),
        id: "updated",
      },
      {
        // Pinned to the right, so a phone keeps the switch and the menu.
        cell: (row) => (
          <span className="flex items-center justify-end gap-1">
            <PublishedCell onPublish={publish} pending={publishing} row={row} />
            <RowMenu onPublish={publish} onQr={setQrRow} row={row} />
          </span>
        ),
        className: STICKY_END,
        header: t("admin.gestures.columns.published"),
        id: "actions",
      },
    ],
    [
      headerChecked,
      publish,
      publishing,
      rows.length,
      selected,
      t,
      time,
      toggleAll,
      toggleRow,
    ]
  );
  return (
    <>
      <DataTable
        aria-label={t("admin.gestures.title")}
        columns={columns}
        getRowId={rowId}
        rows={rows}
        selectedRowIds={selected}
        stickyHeader
      />
      {qrRow ? (
        <GestureQrDialog
          gesture={qrRow}
          note={
            qrRow.publishedAt === null
              ? t("admin.gestures.qrHiddenNote")
              : undefined
          }
          onOpenChange={closeQr}
          open
        />
      ) : null}
    </>
  );
}
