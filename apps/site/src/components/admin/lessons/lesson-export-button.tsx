import { useTranslation } from "@smog/i18n/react";
import { Button } from "@smog/ui-web";
import { FileDown } from "lucide-react";
import { lazy, type ReactNode, Suspense, useCallback, useState } from "react";

// The dialog (preview, template and language choices) loads when it first
// opens, so it stays out of the builder's entry (heavy blocks are lazy).
const LessonExportDialog = lazy(async () => ({
  default: (await import("./lesson-export-dialog")).LessonExportDialog,
}));

/** "Make PDF": opens the export dialog (spec 5.3). Any teacher or admin, whoever authored the lesson. */
export function LessonExportButton({
  lessonId,
  pending,
  version,
}: {
  lessonId: string;
  /** The builder still holds changes the server has not stored: the download waits. */
  pending: boolean;
  /** The saved version of the lesson: a save refreshes the preview. */
  version: number;
}): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);
  const closeDialog = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button
        icon={<FileDown />}
        onClick={openDialog}
        size="sm"
        variant="secondary"
      >
        {t("admin.lessons.export.open")}
      </Button>
      {open ? (
        <Suspense fallback={null}>
          <LessonExportDialog
            lessonId={lessonId}
            onClose={closeDialog}
            pending={pending}
            version={version}
          />
        </Suspense>
      ) : null}
    </>
  );
}
