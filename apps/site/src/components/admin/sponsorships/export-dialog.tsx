import {
  sponsorshipsCsvFile,
  useAdminSponsorshipsExport,
} from "@smog/admin/client";
import type { SponsorshipsCsvInput } from "@smog/admin/schema";
import { SPONSORSHIP_STATUSES, type SponsorshipStatus } from "@smog/db/enums";
import { useTranslation } from "@smog/i18n/react";
import { SPONSORSHIP_STATUS_LABEL_KEYS } from "@smog/sponsorships/schema";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  Field,
  Input,
  Select,
  useToast,
} from "@smog/ui-web";
import { Download } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { sponsorshipActionError } from "./labels";
import { dayBounds } from "./search";

const ALL = "all";

/**
 * Saves a file the browser holds (an object URL and a temporary link): the
 * export is an oRPC answer, so there is no URL to navigate to.
 */
function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // After the click has handed the file to the browser.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export interface ExportDialogProps {
  /** The list's days, as a starting point (`YYYY-MM-DD`). */
  from?: string | undefined;
  /** The list's status (the All tab's), as a starting point. */
  status?: SponsorshipStatus | undefined;
  to?: string | undefined;
}

/**
 * "Export CSV" (A-09): a status and a creation date range, then the 18
 * column file (UTF-8 with its BOM, so Excel reads accents and €) is
 * downloaded under the server's name. The export is audited; over 50,000
 * rows it asks for a shorter range.
 */
export function ExportDialog({
  from,
  status,
  to,
}: ExportDialogProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const exporter = useAdminSponsorshipsExport();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string>(status ?? ALL);
  const [first, setFirst] = useState(from ?? "");
  const [last, setLast] = useState(to ?? "");

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setChosen(status ?? ALL);
        setFirst(from ?? "");
        setLast(to ?? "");
      }
      setOpen(next);
    },
    [from, status, to]
  );
  const onFirst = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setFirst(event.target.value),
    []
  );
  const onLast = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setLast(event.target.value),
    []
  );

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const picked = SPONSORSHIP_STATUSES.find((value) => value === chosen);
      const input: SponsorshipsCsvInput = {
        ...dayBounds(first || undefined, last || undefined),
        ...(picked ? { status: [picked] } : {}),
      };
      exporter
        .mutateAsync(input)
        .then((result) => {
          downloadFile(sponsorshipsCsvFile(result));
          toast({
            title: t("admin.export.done", { count: result.rows }),
            variant: "success",
          });
          setOpen(false);
        })
        .catch((error: unknown) => {
          console.error("[admin] Failed to export the sponsorships:", error);
          toast({ title: sponsorshipActionError(t, error), variant: "danger" });
        });
    },
    [chosen, exporter, first, last, t, toast]
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button icon={<Download />} variant="secondary">
          {t("admin.export.action")}
        </Button>
      </DialogTrigger>
      <DialogContent
        description={t("admin.export.description")}
        title={t("admin.export.title")}
      >
        <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
          <Field label={t("admin.export.status")}>
            <Select
              onValueChange={setChosen}
              options={[
                { label: t("admin.export.allStatuses"), value: ALL },
                ...SPONSORSHIP_STATUSES.map((value) => ({
                  label: t(SPONSORSHIP_STATUS_LABEL_KEYS[value]),
                  value,
                })),
              ]}
              value={chosen}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("admin.export.from")}>
              <Input onChange={onFirst} type="date" value={first} />
            </Field>
            <Field label={t("admin.export.to")}>
              <Input onChange={onLast} type="date" value={last} />
            </Field>
          </div>
          <DialogFooter>
            <Button
              icon={<Download />}
              loading={exporter.isPending}
              type="submit"
            >
              {t("admin.export.download")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
