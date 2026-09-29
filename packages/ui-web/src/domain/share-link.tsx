import { useTranslation } from "@smog/i18n/react";
import { Check, Copy, Link2Off } from "lucide-react";
import {
  type ComponentProps,
  type FocusEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import { AlertDialog } from "../components/alert-dialog";
import { Button } from "../components/button";
import { Input } from "../components/input";
import { cn } from "../lib/cn";

/** How long the copy button says "Copied". */
const COPIED_MS = 2000;

export type ShareAccess = "view" | "edit";

export interface ShareLinkProps
  extends Omit<ComponentProps<"section">, "children"> {
  /** `view` links show the list; `edit` links also let signed-in people edit it. */
  access: ShareAccess;
  /**
   * The caller copies `url` (clipboard) and must surface a failure itself
   * (a toast); the button confirms "Copied" either way.
   */
  onCopy: () => void;
  /** Called after the user confirms; the link stops working at once. */
  onRevoke: () => void;
  /** Busy state of the revoke confirmation. */
  revoking?: boolean;
  url: string;
}

/** One active share link of a list: what it allows, the url, copy and revoke. */
export function ShareLink({
  className,
  onCopy,
  onRevoke,
  revoking = false,
  access,
  url,
  ...props
}: ShareLinkProps): ReactNode {
  const { t } = useTranslation();
  const headingId = useId();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = useCallback((): void => {
    onCopy();
    setCopied(true);
  }, [onCopy]);
  const selectAll = useCallback((event: FocusEvent<HTMLInputElement>): void => {
    event.target.select();
  }, []);
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-4",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-title-3" id={headingId}>
          {t(
            access === "edit"
              ? "lists.share.editTitle"
              : "lists.share.viewTitle"
          )}
        </h3>
        <p className="text-body-sm text-foreground-muted">
          {t(
            access === "edit"
              ? "lists.share.editDescription"
              : "lists.share.viewDescription"
          )}
        </p>
      </div>
      <Input
        aria-label={t("lists.share.linkLabel")}
        onFocus={selectAll}
        readOnly
        value={url}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          icon={copied ? <Check /> : <Copy />}
          onClick={copy}
          variant="secondary"
        >
          {copied ? t("kit.copied") : t("lists.share.copyLink")}
        </Button>
        {/* Announced when it fills; a live region on the button is not read reliably. */}
        <span className="sr-only" role="status">
          {copied ? t("kit.copied") : ""}
        </span>
        <AlertDialog
          confirmLabel={t("lists.share.revokeConfirm")}
          description={t("lists.share.revokeDescription")}
          loading={revoking}
          onConfirm={onRevoke}
          title={t("lists.share.revokeTitle")}
          tone="danger"
        >
          <Button icon={<Link2Off />} variant="ghost">
            {t("lists.share.revoke")}
          </Button>
        </AlertDialog>
      </div>
    </section>
  );
}
