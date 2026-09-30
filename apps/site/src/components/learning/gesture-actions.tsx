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
import { Copy, Ellipsis, QrCode, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type ReactNode, useCallback, useState } from "react";
import { copyText, shareUrl, useSiteUrl } from "@/lib/share";
import { gestureHref } from "./links";
import { SaveToList } from "./save-to-list";
import { type Hearts, useHeart } from "./use-hearts";

interface ActionGesture {
  id: string;
  name: string;
  slug: string;
}

/** The QR code of the gesture page (black on white, also in dark mode). */
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
            size={256}
            title={t("gesture.qr.title", { name: gesture.name })}
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
