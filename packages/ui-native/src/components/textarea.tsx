import { tokens } from "@smog/styles/tokens";
import type { ReactElement, Ref } from "react";
import { TextInput, type TextInputProps, View } from "react-native";
import { cn } from "../lib/cn";
import { useColor } from "../lib/theme";
import { useFieldControl } from "./field";
import { fieldVariants } from "./input";

export interface TextareaProps extends TextInputProps {
  containerClassName?: string;
  disabled?: boolean;
  invalid?: boolean;
  ref?: Ref<TextInput>;
  required?: boolean;
  /** Visible lines (4 by default). */
  rows?: number;
}

const DEFAULT_ROWS = 4;
const PADDING_Y = tokens.spacing["3"];

/** A multi-line text field; inside a Field it takes the label, hint and error. */
export function Textarea({
  className,
  containerClassName,
  disabled = false,
  editable,
  invalid: invalidProp,
  required,
  rows = DEFAULT_ROWS,
  style,
  ...props
}: TextareaProps): ReactElement {
  const field = useFieldControl({ ...props, invalid: invalidProp, required });
  const placeholderColor = useColor("foregroundMuted");
  const minHeight = rows * tokens.fontSize.body.lineHeight + PADDING_Y * 2;
  return (
    <View
      className={cn(
        fieldVariants({ invalid: field.invalid }),
        "items-stretch",
        disabled && "opacity-50",
        containerClassName
      )}
    >
      <TextInput
        accessibilityHint={field.accessibilityHint}
        accessibilityLabel={field.accessibilityLabel}
        accessibilityLabelledBy={field.accessibilityLabelledBy}
        accessibilityState={{ disabled }}
        className={cn("flex-1 py-3 text-body text-foreground", className)}
        editable={editable ?? !disabled}
        multiline
        numberOfLines={rows}
        placeholderTextColor={placeholderColor}
        style={[{ minHeight }, style]}
        textAlignVertical="top"
        {...props}
      />
    </View>
  );
}
