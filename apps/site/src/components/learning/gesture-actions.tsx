import { useTranslation } from "@smog/i18n/react";
import {
  FavoriteButton,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  useToast,
} from "@smog/ui-web";
import { Ellipsis, QrCode, Share2 } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { GestureQrDialog } from "@/components/gesture-qr-dialog";
import { shareUrl, useSiteUrl } from "@/lib/share";
import { gestureHref } from "./links";
import { SaveToList } from "./save-to-list";
import { type Hearts, useHeart } from "./use-hearts";

interface ActionGesture {
  id: string;
  name: string;
  slug: string;
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
      <GestureQrDialog
        gesture={gesture}
        onOpenChange={setQrOpen}
        open={qrOpen}
      />
    </div>
  );
}
