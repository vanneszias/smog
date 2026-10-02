import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Text,
  useToast,
} from "@smog/ui-web";
import { slugify } from "@smog/utils";
import { Copy, Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type ReactNode, useCallback, useRef } from "react";
import { qrPngDataUrl } from "@/lib/qr-png";
import { copyText, useSiteUrl } from "@/lib/share";

/** The downloaded PNG's name: `smog-<slug>-qr.png` (the old dialog's pattern). */
export function qrFileName(slug: string): string {
  return `smog-${slugify(slug) || "gesture"}-qr.png`;
}

/** The public page a gesture's QR code opens: `${SITE_URL}/gestures/<slug>`. */
export function gesturePageUrl(siteUrl: string, slug: string): string {
  return `${siteUrl}/gestures/${encodeURIComponent(slug)}`;
}

export interface GestureQrDialogProps {
  gesture: { name: string; slug: string };
  /** A line under the URL (the admin: a hidden gesture's page is a 404). */
  note?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * The QR code of a gesture's public page (black on white, also in dark
 * mode), with copy and a 1024 px PNG download (inventory L-14). The public
 * gesture page and the admin (A-28) both open it.
 */
export function GestureQrDialog({
  gesture,
  note,
  onOpenChange,
  open,
}: GestureQrDialogProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const url = gesturePageUrl(useSiteUrl(), gesture.slug);
  const qr = useRef<SVGSVGElement>(null);
  // A fixed 1024 px PNG, drawn from the SVG only when asked for.
  const download = useCallback((): void => {
    const svg = qr.current;
    if (!svg) {
      return;
    }
    qrPngDataUrl(svg)
      .then((href) => {
        const link = document.createElement("a");
        link.href = href;
        link.download = qrFileName(gesture.slug);
        link.click();
      })
      .catch((error: unknown) => {
        console.error("[gesture] Failed to download the QR code:", error);
        toast({ title: t("states.actionFailed"), variant: "danger" });
      });
  }, [gesture.slug, t, toast]);
  const copy = useCallback((): void => {
    copyText(url)
      .then(() => toast({ title: t("gesture.linkCopied"), variant: "success" }))
      .catch(() => {
        toast({ title: t("gesture.copyFailed", { url }), variant: "danger" });
      });
  }, [t, toast, url]);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        description={t("gesture.qr.description")}
        title={t("gesture.qr.title", { name: gesture.name })}
      >
        <div className="flex flex-col items-center gap-3">
          <QRCodeSVG
            bgColor="#FFFFFF"
            className="size-64 rounded-md"
            fgColor="#000000"
            level="M"
            marginSize={2}
            ref={qr}
            size={256}
            title={t("gesture.qr.title", { name: gesture.name })}
            value={url}
          />
          <Text className="break-all text-center" size="body-sm" tone="muted">
            {url}
          </Text>
          {note ? (
            <Text
              className="rounded-md bg-warning-subtle px-3 py-2 text-center text-warning-strong"
              role="note"
              size="body-sm"
            >
              {note}
            </Text>
          ) : null}
        </div>
        <DialogFooter>
          <Button icon={<Copy />} onClick={copy} variant="secondary">
            {t("lists.share.copyLink")}
          </Button>
          <Button icon={<Download />} onClick={download}>
            {t("gesture.qr.download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
