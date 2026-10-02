import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@smog/ui-web";
import { Save } from "lucide-react";
import type { ReactNode } from "react";
import type { RowChanges, TableField } from "./table-edits";

const FIELD_KEYS = {
  categoryIds: "admin.gestures.fields.categoryIds",
  description: "admin.gestures.fields.description",
  keywords: "admin.gestures.fields.keywords",
  name: "admin.gestures.fields.name",
  playbackId: "admin.gestures.fields.playbackId",
} as const satisfies Record<TableField, string>;

export interface ChangesDialogProps {
  changes: readonly RowChanges[];
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  saving: boolean;
}

function Value({ value }: { value: string }): ReactNode {
  const { t } = useTranslation();
  return value ? (
    <span className="whitespace-pre-wrap break-words">{value}</span>
  ) : (
    <span className="text-foreground-muted">
      {t("admin.gestures.changes.empty")}
    </span>
  );
}

/**
 * The table editor's confirmation: per gesture, every changed field with
 * its old and new value, then the one `saveMany`.
 */
export function ChangesDialog({
  changes,
  onConfirm,
  onOpenChange,
  open,
  saving,
}: ChangesDialogProps): ReactNode {
  const { t } = useTranslation();
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-w-content"
        description={t("admin.gestures.changes.description", {
          count: changes.length,
        })}
        title={t("admin.gestures.changes.title")}
      >
        <div className="flex flex-col gap-4">
          {changes.map((row) => (
            <Table aria-label={row.name} key={row.id}>
              <TableCaption className="caption-top text-left font-medium text-body-sm text-foreground">
                {row.name}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.gestures.changes.field")}</TableHead>
                  <TableHead>{t("admin.gestures.changes.before")}</TableHead>
                  <TableHead>{t("admin.gestures.changes.after")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.fields.map((change) => (
                  <TableRow key={change.field}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {t(FIELD_KEYS[change.field])}
                    </TableCell>
                    <TableCell className="text-foreground-muted line-through decoration-foreground-muted/60">
                      <Value value={change.before} />
                    </TableCell>
                    <TableCell>
                      <Value value={change.after} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t("kit.cancel")}</Button>
          </DialogClose>
          <Button icon={<Save />} loading={saving} onClick={onConfirm}>
            {t("admin.gestures.changes.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
