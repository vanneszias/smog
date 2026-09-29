import { useTranslation } from "@smog/i18n/react";
import X from "lucide-react-native/icons/x";
import type { ReactElement, ReactNode } from "react";
import {
  type AccessibilityRole,
  Modal,
  Pressable,
  View,
  type ViewProps,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { cn } from "../lib/cn";
import { createOverlay } from "../lib/overlay";
import { useShadow, useThemeVars } from "../lib/theme";
import { IconButton } from "./icon-button";
import { Heading, Text } from "./text";

const overlay = createOverlay("Dialog");

/** Root: `open` / `defaultOpen` / `onOpenChange`. */
export const Dialog = overlay.Root;
/** Wraps one pressable child that opens the dialog (web: `asChild`). */
export const DialogTrigger = overlay.Trigger;
/** Wraps one pressable child that closes the dialog. */
export const DialogClose = overlay.Close;

export interface ModalCardProps {
  children?: ReactNode;
  className?: string;
  /** Pressing the backdrop closes it (dialogs yes, alert dialogs no). */
  dismissable?: boolean;
  onClose: () => void;
  open: boolean;
  role?: AccessibilityRole;
  testID?: string;
}

/**
 * The centred card on a dimmed backdrop in a native `Modal` (focus stays
 * inside, Android back closes it). The theme variables are re-applied at
 * the modal root; it fades in, or appears at once under reduced motion.
 */
export function ModalCard({
  children,
  className,
  dismissable = true,
  onClose,
  open,
  role,
  testID,
}: ModalCardProps): ReactElement {
  const reducedMotion = useReducedMotion();
  const themeVars = useThemeVars();
  const shadow = useShadow("2");
  return (
    <Modal
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={open}
    >
      <View
        className="flex-1 items-center justify-center p-4"
        style={themeVars}
        testID="overlay-theme-root"
      >
        <Pressable
          accessibilityElementsHidden
          className="absolute inset-0 bg-foreground/40"
          disabled={!dismissable}
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
        />
        <View
          accessibilityRole={role}
          accessibilityViewIsModal
          className={cn(
            "w-full flex-col gap-4 rounded-xl border border-border-subtle bg-surface-raised p-6",
            className
          )}
          style={shadow}
          testID={testID}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

export interface DialogContentProps {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  /** Hide the corner close button (the footer then needs a way out). */
  hideClose?: boolean;
  testID?: string;
  /** The dialog's heading. */
  title: ReactNode;
}

/** A centred modal: title, optional description, content and a close button. */
export function DialogContent({
  children,
  className,
  description,
  hideClose = false,
  testID,
  title,
}: DialogContentProps): ReactElement {
  const { t } = useTranslation();
  const { close, open } = overlay.useOverlay();
  return (
    <ModalCard
      className={className}
      onClose={close}
      open={open}
      testID={testID}
    >
      <View className="flex-row items-start gap-2">
        <View className="flex-1 flex-col gap-1">
          <Heading size="title-2">{title}</Heading>
          {description ? <Text tone="muted">{description}</Text> : null}
        </View>
        {hideClose ? null : (
          <IconButton
            className="-mt-2 -mr-2"
            icon={<X />}
            label={t("a11y.close")}
            onPress={close}
          />
        )}
      </View>
      {children}
    </ModalCard>
  );
}

/** Actions at the bottom, stacked (the primary action first). */
export function DialogFooter({ className, ...props }: ViewProps): ReactElement {
  return <View className={cn("mt-2 flex-col gap-2", className)} {...props} />;
}
