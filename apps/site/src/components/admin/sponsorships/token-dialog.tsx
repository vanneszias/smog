import type { SponsorshipTokenPurpose } from "@smog/db/enums";
import { formatDate } from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  useToast,
} from "@smog/ui-web";
import { Copy } from "lucide-react";
import { type FocusEvent, type ReactNode, useCallback, useRef } from "react";
import { usePageLocale } from "./labels";

/** A link an action answered (A-07): shown once, never stored. */
export interface ShownLink {
  expiresAt: number;
  purpose: SponsorshipTokenPurpose;
  url: string;
}

export interface TokenDialogProps {
  /** The link to show; the dialog is closed while it is `null`. */
  link: ShownLink | null;
  /** The sponsorship's display name (the title). */
  name: string;
  /** Closing drops the link: it is never shown again. */
  onClose: () => void;
}

function selectAll(event: FocusEvent<HTMLInputElement>): void {
  event.currentTarget.select();
}

/**
 * The re-edit or renewal link, the one place a raw token is shown (ruling
 * 11): a read-only field, Copy and the expiry. The link lives only in the
 * parent's state while the dialog is open; nothing caches or logs it, and
 * no email is sent (parity: the admin sends it by hand).
 */
export function TokenDialog({
  link,
  name,
  onClose,
}: TokenDialogProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const locale = usePageLocale();
  const input = useRef<HTMLInputElement>(null);
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );
  const url = link?.url;
  const copy = useCallback(() => {
    if (!url) {
      return;
    }
    const copied = () =>
      toast({ title: t("admin.sponsorships.link.copied"), variant: "success" });
    // The clipboard needs a secure context; otherwise the text is selected
    // for the admin to copy by hand.
    if (!navigator.clipboard) {
      input.current?.select();
      toast({ title: t("admin.sponsorships.link.copyByHand") });
      return;
    }
    navigator.clipboard.writeText(url).then(copied, (error: unknown) => {
      console.error("[admin] Failed to copy the link:", error);
      input.current?.select();
      toast({ title: t("admin.sponsorships.link.copyByHand") });
    });
  }, [t, toast, url]);
  const reedit = link?.purpose !== "renewal";
  return (
    <Dialog onOpenChange={onOpenChange} open={link !== null}>
      {link ? (
        <DialogContent
          className="wrap-anywhere"
          description={t("admin.sponsorships.link.description", {
            date: formatDate(link.expiresAt, locale, {
              dateStyle: "long",
              timeStyle: "short",
            }),
          })}
          title={t(
            reedit
              ? "admin.sponsorships.link.reeditTitle"
              : "admin.sponsorships.link.renewalTitle",
            { name }
          )}
        >
          <Field
            hint={t(
              reedit
                ? "admin.sponsorships.link.reeditHint"
                : "admin.sponsorships.link.renewalHint"
            )}
            label={t("admin.sponsorships.link.label")}
          >
            <Input
              className="font-mono"
              onFocus={selectAll}
              readOnly
              ref={input}
              spellCheck={false}
              value={link.url}
            />
          </Field>
          <DialogFooter>
            <Button onClick={onClose} variant="secondary">
              {t("admin.sponsorships.link.done")}
            </Button>
            <Button icon={<Copy />} onClick={copy}>
              {t("admin.sponsorships.link.copy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
