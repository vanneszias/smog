import { useTranslation } from "@smog/i18n/react";
import { type ReactElement, type ReactNode, useCallback } from "react";
import { View } from "react-native";
import { useControllableState } from "../lib/controllable";
import { withPress } from "../lib/overlay";
import { Button } from "./button";
import { ModalCard } from "./dialog";
import { Heading, Text } from "./text";

export interface AlertDialogProps {
  /** Content between the description and the actions (e.g. a confirmation field). */
  body?: ReactNode;
  /** Cancel label (`kit.cancel` by default). */
  cancelLabel?: string;
  /** The trigger element (optional when controlled with `open`). */
  children?: ReactElement;
  className?: string;
  /** Disables confirm (until the body's field is filled in). */
  confirmDisabled?: boolean;
  /** Confirm label (`kit.confirm` by default). */
  confirmLabel?: string;
  defaultOpen?: boolean;
  description?: ReactNode;
  /** Shows a spinner on confirm while an async action runs. */
  loading?: boolean;
  onConfirm: () => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  testID?: string;
  title: ReactNode;
  /** `danger` for destructive, irreversible actions (warning haptic on confirm). */
  tone?: "default" | "danger";
}

/**
 * A confirmation that interrupts: title, description, cancel and confirm,
 * in a native modal with the `alert` role. The backdrop does not close it.
 */
export function AlertDialog({
  body,
  cancelLabel,
  children,
  className,
  confirmDisabled = false,
  confirmLabel,
  defaultOpen = false,
  description,
  loading = false,
  onConfirm,
  onOpenChange,
  open,
  testID,
  title,
  tone = "default",
}: AlertDialogProps): ReactElement {
  const { t } = useTranslation();
  const [isOpen, setOpen] = useControllableState(
    open,
    defaultOpen,
    onOpenChange
  );
  const show = useCallback((): void => {
    setOpen(true);
  }, [setOpen]);
  const close = useCallback((): void => {
    setOpen(false);
  }, [setOpen]);
  const confirm = useCallback((): void => {
    // As Radix's Action: confirming also closes it (a controlled caller can
    // keep it open while `loading` by ignoring that onOpenChange).
    onConfirm();
    setOpen(false);
  }, [onConfirm, setOpen]);
  return (
    <>
      {children ? withPress(children, show) : null}
      <ModalCard
        className={className}
        dismissable={false}
        onClose={close}
        open={isOpen}
        role="alert"
        testID={testID}
      >
        <View className="flex-col gap-1">
          <Heading size="title-2">{title}</Heading>
          {description ? <Text tone="muted">{description}</Text> : null}
        </View>
        {body ? <View className="flex-col gap-4">{body}</View> : null}
        <View className="mt-2 flex-col gap-2">
          <Button
            disabled={confirmDisabled}
            loading={loading}
            onPress={confirm}
            variant={tone === "danger" ? "danger" : "primary"}
          >
            {confirmLabel ?? t("kit.confirm")}
          </Button>
          <Button onPress={close} variant="secondary">
            {cancelLabel ?? t("kit.cancel")}
          </Button>
        </View>
      </ModalCard>
    </>
  );
}
