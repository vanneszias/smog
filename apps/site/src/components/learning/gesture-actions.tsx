import { useTranslation } from "@smog/i18n/react";
import { Button, FavoriteButton, IconButton, useToast } from "@smog/ui-web";
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
 * The gesture's actions in one row that never wraps a lone button (spec
 * §16): the heart (outlined like its neighbours, it is the "save"), "save to
 * list", share (its label from `sm`) and the QR code as an icon button.
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
    // Wraps at 320 px and under text spacing (WCAG 1.4.10, 1.4.12): the
    // labelled save button leaves no room for the QR code on one row.
    <div className="flex flex-wrap items-center gap-2">
      <FavoriteButton
        active={heart.active}
        className="border-muted-foreground bg-card hover:bg-muted"
        onToggle={heart.onToggle}
      />
      <SaveToList gestureId={gesture.id} gestureName={gesture.name} />
      <Button
        aria-label={t("gesture.share")}
        icon={<Share2 />}
        onClick={share}
        variant="secondary"
      >
        <span className="hidden sm:inline">{t("gesture.share")}</span>
      </Button>
      <IconButton
        icon={<QrCode />}
        label={t("gesture.qr.open")}
        onClick={openQr}
        variant="secondary"
      />
      <LazyGestureQrDialog
        gesture={gesture}
        onOpenChange={setQrOpen}
        open={qrOpen}
      />
    </div>
  );
}
