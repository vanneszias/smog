import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement, ReactNode, Ref } from "react";
import { TextInput, type TextInputProps, View } from "react-native";
import { cn } from "../lib/cn";
import { ICON_SIZE, renderIcon } from "../lib/icon";
import { useColor } from "../lib/theme";
import { useFieldControl } from "./field";

/** Border and fill of text inputs, selects and textareas (as web). */
export const fieldVariants = cva(
  "w-full flex-row items-center gap-2 rounded-md border bg-surface",
  {
    defaultVariants: { invalid: false, size: "md" },
    variants: {
      invalid: {
        false: "border-foreground-muted",
        true: "border-danger",
      },
      size: {
        lg: "min-h-12 px-4",
        md: "min-h-touch px-3",
      },
    },
  }
);

const inputTextClasses = "min-h-touch flex-1 py-2 text-body text-foreground";

export interface InputProps
  extends TextInputProps,
    Omit<VariantProps<typeof fieldVariants>, "invalid"> {
  /** The container's classes (border, fill); `className` styles the text. */
  containerClassName?: string;
  /** Web's `disabled`: not editable and dimmed. */
  disabled?: boolean;
  invalid?: boolean;
  /** A leading decorative icon. */
  leading?: ReactNode;
  ref?: Ref<TextInput>;
  required?: boolean;
  /** Trailing content, e.g. an IconButton. */
  trailing?: ReactNode;
}

/** A single-line text field; inside a Field it takes the label, hint and error. */
export function Input({
  className,
  containerClassName,
  disabled = false,
  editable,
  invalid: invalidProp,
  leading,
  required,
  size,
  trailing,
  ...props
}: InputProps): ReactElement {
  const field = useFieldControl({ ...props, invalid: invalidProp, required });
  const placeholderColor = useColor("foregroundMuted");
  const iconColor = useColor("foregroundMuted");
  return (
    <View
      className={cn(
        fieldVariants({ invalid: field.invalid, size }),
        disabled && "opacity-50",
        containerClassName
      )}
    >
      {renderIcon(leading, iconColor, ICON_SIZE.md)}
      <TextInput
        accessibilityHint={field.accessibilityHint}
        accessibilityLabel={field.accessibilityLabel}
        accessibilityLabelledBy={field.accessibilityLabelledBy}
        accessibilityState={{ disabled }}
        className={cn(inputTextClasses, className)}
        editable={editable ?? !disabled}
        placeholderTextColor={placeholderColor}
        {...props}
      />
      {trailing}
    </View>
  );
}
