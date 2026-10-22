import { useTranslation } from "@smog/i18n/react";
import { Button, FavoriteButton, useToast } from "@smog/ui-web";
import { QrCode, Share2 } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { LazyGestureQrDialog } from "@/components/lazy-gesture-qr-dialog";
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
 * The gesture's actions, all in view (phase 10a): the heart, "save to list",
 * share and the QR code (spec §16).
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
      <Button icon={<Share2 />} onClick={share} variant="secondary">
        {t("gesture.share")}
      </Button>
      <Button icon={<QrCode />} onClick={openQr} variant="secondary">
        {t("gesture.qr.open")}
      </Button>
      <LazyGestureQrDialog
        gesture={gesture}
        onOpenChange={setQrOpen}
        open={qrOpen}
      />
    </div>
  );
}
