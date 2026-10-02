import type { AdminCategory } from "@smog/admin/schema";
import type { Translate } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
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
import { type ReactNode, useCallback, useState } from "react";
import { useAuditTime } from "@/components/admin/audit-data";
import type { DraftField, GestureDraft } from "./gesture-draft";
import {
  DRAFT_FIELD_KEYS,
  DRAFT_FIELD_NAME_KEYS,
  useListFormat,
} from "./labels";

export interface EditorConflict {
  conflicts: DraftField[];
  /** My form at the time of the save. */
  mine: GestureDraft;
  /** Their version (`merged` keeps it for the conflicting fields). */
  theirs: GestureDraft;
  /** When their version was saved (epoch ms). */
  theirsAt: number;
}

function fieldText(
  t: Translate,
  field: DraftField,
  draft: GestureDraft,
  categoryNames: ReadonlyMap<string, string>,
  list: (items: readonly string[]) => string
): string {
  switch (field) {
    case "name":
    case "description":
      return draft[field].trim() || t("admin.gestures.changes.empty");
    case "keywords":
      return list(draft.keywords) || t("admin.gestures.changes.empty");
    case "categoryIds":
      return list(draft.categoryIds.map((id) => categoryNames.get(id) ?? id));
    case "published":
      return draft.published
        ? t("admin.gestures.publishedBadge")
        : t("admin.gestures.hiddenBadge");
    default:
      return draft.video?.playbackId ?? t("admin.gestures.changes.empty");
  }
}

export interface ConflictDialogProps {
  categories: readonly AdminCategory[];
  conflict: EditorConflict | null;
  /** Closes without changing anything (Cancel, Escape). */
  onCancel: () => void;
  /** After the second confirmation: save mine over theirs. */
  onOverwrite: () => void;
  /** Take theirs for the conflicting fields (the default). */
  onUseTheirs: () => void;
}

/**
 * A stale save whose fields both admins changed (C1): per field their
 * version and mine side by side. "Use their version" is the focused
 * default; "Overwrite with mine" asks again, naming the fields; Cancel or
 * Escape changes nothing (the next save meets the conflict again).
 */
export function ConflictDialog({
  categories,
  conflict,
  onCancel,
  onOverwrite,
  onUseTheirs,
}: ConflictDialogProps): ReactNode {
  const { t } = useTranslation();
  const time = useAuditTime();
  const list = useListFormat();
  const [confirming, setConfirming] = useState(false);
  const names = new Map(
    categories.map((category) => [category.id, category.name])
  );
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onCancel();
      }
    },
    [onCancel]
  );
  const askOverwrite = useCallback(() => setConfirming(true), []);
  const confirmOverwrite = useCallback(() => {
    setConfirming(false);
    onOverwrite();
  }, [onOverwrite]);
  if (!conflict) {
    return null;
  }
  const fieldNames = list(
    conflict.conflicts.map((field) => t(DRAFT_FIELD_NAME_KEYS[field]))
  );
  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={!confirming}>
        <DialogContent
          className="max-w-content"
          description={t("admin.gestures.conflict.description", {
            time: time(conflict.theirsAt),
          })}
          title={t("admin.gestures.conflict.title")}
        >
          <div className="flex flex-col gap-4">
            {conflict.conflicts.map((field) => (
              <Table aria-label={t(DRAFT_FIELD_KEYS[field])} key={field}>
                <TableCaption className="caption-top text-left font-medium text-body-sm text-foreground">
                  {t(DRAFT_FIELD_KEYS[field])}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.gestures.conflict.theirs")}</TableHead>
                    <TableHead>{t("admin.gestures.conflict.mine")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="whitespace-pre-wrap break-words">
                      {fieldText(t, field, conflict.theirs, names, list)}
                    </TableCell>
                    <TableCell className="whitespace-pre-wrap break-words">
                      {fieldText(t, field, conflict.mine, names, list)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("kit.cancel")}</Button>
            </DialogClose>
            <Button onClick={askOverwrite} variant="danger">
              {t("admin.gestures.conflict.overwrite")}
            </Button>
            <Button autoFocus onClick={onUseTheirs}>
              {t("admin.gestures.conflict.useTheirs")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        confirmLabel={t("admin.gestures.conflict.overwriteConfirm")}
        description={t("admin.gestures.conflict.overwriteDescription", {
          fields: fieldNames,
        })}
        onConfirm={confirmOverwrite}
        onOpenChange={setConfirming}
        open={confirming}
        title={t("admin.gestures.conflict.overwriteTitle")}
        tone="danger"
      />
    </>
  );
}
