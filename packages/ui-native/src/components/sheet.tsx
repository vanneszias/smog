import { useTranslation } from "@smog/i18n/react";
import X from "lucide-react-native/icons/x";
import type { ReactElement, ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { createOverlay } from "../lib/overlay";
import { IconButton } from "./icon-button";
import { SheetPanel } from "./sheet-panel";
import { Heading, Text } from "./text";

const overlay = createOverlay("Sheet");

/** Root: `open` / `defaultOpen` / `onOpenChange`. */
export const Sheet = overlay.Root;
/** Wraps one pressable child that opens the sheet (web: `asChild`). */
export const SheetTrigger = overlay.Trigger;
/** Wraps one pressable child that closes the sheet. */
export const SheetClose = overlay.Close;

export interface SheetContentProps {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  hideClose?: boolean;
  /** Web's edge; native always draws a bottom sheet. */
  side?: "auto" | "bottom" | "right" | "left";
  testID?: string;
  /** The sheet's heading. */
  title: ReactNode;
}

/** A bottom sheet with a title, an optional description and a close button. */
export function SheetContent({
  children,
  className,
  description,
  hideClose = false,
  side: _side,
  testID,
  title,
}: SheetContentProps): ReactElement {
  const { t } = useTranslation();
  const { close, open } = overlay.useOverlay();
  return (
    <SheetPanel
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
    </SheetPanel>
  );
}

/** Actions at the bottom of the sheet, stacked. */
export function SheetFooter({ className, ...props }: ViewProps): ReactElement {
  return <View className={cn("mt-2 flex-col gap-2", className)} {...props} />;
}
