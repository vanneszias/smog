import { useTranslation } from "@smog/i18n/react";
import { AlertDialog } from "@smog/ui-web";
import { useBlocker } from "@tanstack/react-router";
import { type ReactNode, useCallback, useRef } from "react";

export interface LeaveGuardProps {
  /** Read at navigation time: whether unsaved edits would be lost. */
  shouldBlock: () => boolean;
}

/**
 * Asks before a navigation (a link, the rail, back) or a reload loses
 * unsaved edits (the gesture editor and the table editor). "Stay" keeps
 * the page; "Leave" goes on.
 */
export function LeaveGuard({ shouldBlock }: LeaveGuardProps): ReactNode {
  const { t } = useTranslation();
  const blocker = useBlocker({
    enableBeforeUnload: shouldBlock,
    shouldBlockFn: shouldBlock,
    withResolver: true,
  });
  // The confirm also closes the dialog; that close must not reset.
  const leaving = useRef(false);
  const { proceed, reset, status } = blocker;
  const leave = useCallback(() => {
    leaving.current = true;
    proceed?.();
  }, [proceed]);
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open && status === "blocked" && !leaving.current) {
        reset?.();
      }
      leaving.current = false;
    },
    [reset, status]
  );
  return (
    <AlertDialog
      cancelLabel={t("admin.gestures.leave.stay")}
      confirmLabel={t("admin.gestures.leave.leave")}
      description={t("admin.gestures.leave.description")}
      onConfirm={leave}
      onOpenChange={onOpenChange}
      open={status === "blocked"}
      title={t("admin.gestures.leave.title")}
      tone="danger"
    />
  );
}
