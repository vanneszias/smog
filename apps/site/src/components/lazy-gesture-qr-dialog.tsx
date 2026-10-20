import { lazy, type ReactNode, Suspense } from "react";
import type { GestureQrDialogProps } from "@/components/gesture-qr-dialog";

const GestureQrDialog = lazy(() =>
  import("@/components/gesture-qr-dialog").then((module) => ({
    default: module.GestureQrDialog,
  }))
);

/**
 * `GestureQrDialog` behind a lazy import (phase 9 task 6): the QR encoder
 * and the dialog (7 kB gzip) load when a QR code is first asked for, not
 * with the gesture page. Nothing mounts while it is closed.
 */
export function LazyGestureQrDialog(props: GestureQrDialogProps): ReactNode {
  if (!props.open) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <GestureQrDialog {...props} />
    </Suspense>
  );
}
