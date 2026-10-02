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

/** Chips shown per row before "+N". */
const SHOWN_CATEGORIES = 2;

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

function PublishedCell({ row }: { row: AdminGestureRow }): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setPublished } = useAdminGestureMutations();
  const toggle = useCallback(
    (published: boolean) => {
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
    [row.id, row.name, setPublished, t, toast]
  );
  return (
    <Switch
      aria-label={t("admin.gestures.publishToggle", { name: row.name })}
      checked={row.publishedAt !== null}
      disabled={setPublished.isPending}
      onCheckedChange={toggle}
    />
  );
}

function RowMenu({
  onQr,
  row,
}: {
  onQr: (row: AdminGestureRow) => void;
  row: AdminGestureRow;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { setPublished } = useAdminGestureMutations();
  const published = row.publishedAt !== null;
  const edit = useCallback(() => {
    navigate({ params: { id: row.id }, to: "/admin/gestures/$id" }).catch(
      (error: unknown) => {
        console.error("[admin] Failed to open the gesture:", error);
      }
    );
  }, [navigate, row.id]);
  const qr = useCallback(() => onQr(row), [onQr, row]);
  const toggle = useCallback(() => {
    setPublished
      .mutateAsync({ id: row.id, published: !published })
      .catch((error: unknown) => {
        console.error("[admin] Failed to publish the gesture:", error);
        toast({
          title: t("admin.gestures.errors.saveFailed"),
          variant: "danger",
        });
      });
  }, [published, row.id, setPublished, t, toast]);
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
      title={row.categories.map((category) => category.name).join(", ")}
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
  const time = useAuditTime();
  const [qrRow, setQrRow] = useState<AdminGestureRow | null>(null);
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
        sortValue: (row) => row.name,
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
        sortValue: (row) => row.keywords.length,
      },
      {
        cell: (row) => <PublishedCell row={row} />,
        header: t("admin.gestures.columns.published"),
        id: "published",
        sortValue: (row) => (row.publishedAt === null ? 0 : 1),
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
        sortValue: (row) => row.updatedAt,
      },
      {
        align: "end",
        cell: (row) => <RowMenu onQr={setQrRow} row={row} />,
        header: (
          <span className="sr-only">{t("admin.gestures.columns.actions")}</span>
        ),
        id: "actions",
      },
    ],
    [headerChecked, rows.length, selected, t, time, toggleAll, toggleRow]
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
        <GestureQrDialog gesture={qrRow} onOpenChange={closeQr} open />
      ) : null}
    </>
  );
}
