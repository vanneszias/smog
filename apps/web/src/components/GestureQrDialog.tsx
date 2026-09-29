import { Copy, Download } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getGestureUrl } from "@/utils/deviceDetection";

// Rendered at print resolution and scaled down for display
const QR_SIZE = 1024;

interface GestureQrDialogProps {
  gestureId: string;
  gestureName: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function toFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `smog-${slug || "gesture"}-qr.png`;
}

export function GestureQrDialog({
  gestureId,
  gestureName,
  open,
  onOpenChange,
}: GestureQrDialogProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = getGestureUrl(gestureId);

  const handleCopy = useCallback((): void => {
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(t("ui.gestureDetail.linkCopied")))
      .catch((error) => {
        console.error("[GestureQrDialog] Failed to copy link:", error);
        toast.error(url);
      });
  }, [t, url]);

  const handleDownload = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = toFileName(gestureName);
    link.click();
  }, [gestureName]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{gestureName}</DialogTitle>
          <DialogDescription>
            {t("ui.gestureDetail.qrCodeDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center rounded-lg bg-white p-4">
          <QRCodeCanvas
            level="M"
            marginSize={2}
            ref={canvasRef}
            size={QR_SIZE}
            style={{ height: 256, width: 256 }}
            title={url}
            value={url}
          />
        </div>
        <code className="block break-all rounded-md bg-muted p-2 text-center font-mono text-muted-foreground text-xs">
          {url}
        </code>
        <div className="grid grid-cols-2 gap-2">
          <Button className="gap-2" onClick={handleCopy} variant="outline">
            <Copy className="h-4 w-4" />
            {t("ui.gestureDetail.copyLink")}
          </Button>
          <Button className="gap-2" onClick={handleDownload}>
            <Download className="h-4 w-4" />
            {t("ui.gestureDetail.downloadQrCode")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
