import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  FavoriteButton,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Text,
  useToast,
} from "@smog/ui-web";
import { slugify } from "@smog/utils";
import { Copy, Download, Ellipsis, QrCode, Share2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { copyText, shareUrl, useSiteUrl } from "@/lib/share";
import { gestureHref } from "./links";
import { SaveToList } from "./save-to-list";
import { type Hearts, useHeart } from "./use-hearts";

interface ActionGesture {
  id: string;
  name: string;
  slug: string;
}

/** The QR code is drawn at print size and shown scaled down. */
const QR_SIZE = 1024;
const QR_STYLE = { height: 256, width: 256 } as const;

/** The downloaded PNG's name: `smog-<slug>-qr.png` (the old dialog's pattern). */
export function qrFileName(slug: string): string {
  return `smog-${slugify(slug) || "gesture"}-qr.png`;
}

/**
 * The QR code of the gesture page (black on white, also in dark mode), with
 * copy and a PNG download (inventory L-14).
 */
function QrDialog({
  gesture,
  onOpenChange,
  open,
  url,
}: {
  gesture: ActionGesture;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  url: string;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const canvas = useRef<HTMLCanvasElement>(null);
  const download = useCallback((): void => {
    const drawn = canvas.current;
    if (!drawn) {
      return;
    }
    try {
      const link = document.createElement("a");
      link.href = drawn.toDataURL("image/png");
      link.download = qrFileName(gesture.slug);
      link.click();
    } catch (error) {
      console.error("[gesture] Failed to download the QR code:", error);
      toast({ title: t("states.actionFailed"), variant: "danger" });
    }
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
          <QRCodeCanvas
            aria-label={t("gesture.qr.title", { name: gesture.name })}
            bgColor="#FFFFFF"
            className="rounded-md"
            fgColor="#000000"
            level="M"
            marginSize={2}
            ref={canvas}
            role="img"
            size={QR_SIZE}
            style={QR_STYLE}
            value={url}
          />
          <Text className="break-all text-center" size="body-sm" tone="muted">
            {url}
          </Text>
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

/**
 * The gesture's actions: the heart and "save to list" up front, share and
 * the QR code in the overflow menu (spec §16).
 */
export function GestureActions({
  gesture,
  hearts,
}: {
  gesture: ActionGesture;
  hearts: Hearts;
}): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const siteUrl = useSiteUrl();
  const url = `${siteUrl}${gestureHref(gesture.slug)}`;
  const [qrOpen, setQrOpen] = useState(false);
  const heart = useHeart(hearts, gesture.id);
  const openQr = useCallback(() => setQrOpen(true), []);

  const share = useCallback((): void => {
    shareUrl(url, gesture.name)
      .then((result) => {
        if (result === "copied") {
          toast({ title: t("gesture.linkCopied"), variant: "success" });
        }
      })
      .catch(() => {
        toast({ title: t("gesture.copyFailed", { url }), variant: "danger" });
      });
  }, [gesture.name, t, toast, url]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FavoriteButton active={heart.active} onToggle={heart.onToggle} />
      <SaveToList gestureId={gesture.id} gestureName={gesture.name} />
      <Menu>
        <MenuTrigger asChild>
          <IconButton
            icon={<Ellipsis />}
            label={t("gesture.actions", { name: gesture.name })}
          />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<Share2 />} onSelect={share}>
            {t("gesture.share")}
          </MenuItem>
          <MenuItem icon={<QrCode />} onSelect={openQr}>
            {t("gesture.qr.open")}
          </MenuItem>
        </MenuContent>
      </Menu>
      <QrDialog
        gesture={gesture}
        onOpenChange={setQrOpen}
        open={qrOpen}
        url={url}
      />
    </div>
  );
}
