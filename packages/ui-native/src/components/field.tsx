import { useTranslation } from "@smog/i18n/react";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useId,
} from "react";
import { Text, View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { textOf } from "../lib/icon";

interface FieldContextValue {
  /** What the control's accessibilityHint says: error, hint and counter. */
  hint: string | undefined;
  invalid: boolean;
  /** The label as text, the control's accessible name. */
  label: string;
  /** The label's `nativeID`, for `accessibilityLabelledBy` (Android). */
  labelId: string;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

interface ControlProps {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  "aria-label"?: string;
  invalid?: boolean;
  required?: boolean;
}

export interface FieldControlProps {
  accessibilityHint: string | undefined;
  accessibilityLabel: string | undefined;
  accessibilityLabelledBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

/**
 * What a control takes from its Field: its accessible name (the label), its
 * hint (error, hint, counter) and the invalid/required state, under the
 * control's own props. Native has no `id`/`aria-describedby`, so the
 * relationships become the label and hint VoiceOver/TalkBack read.
 */
export function useFieldControl(props: ControlProps): FieldControlProps {
  const field = useContext(FieldContext);
  return {
    accessibilityHint: props.accessibilityHint ?? field?.hint,
    accessibilityLabel:
      props.accessibilityLabel ?? props["aria-label"] ?? field?.label,
    accessibilityLabelledBy: field?.labelId,
    invalid: props.invalid ?? field?.invalid ?? false,
    required: props.required ?? field?.required ?? false,
  };
}

export interface FieldProps extends Omit<ViewProps, "children"> {
  children: ReactNode;
  /** A live `count/max` counter under the control (e.g. a display name). */
  counter?: { count: number; max: number };
  /** The error message; marks the control invalid and is announced. */
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
  /** Adds "Optional" to the label (`kit.optional`). */
  optional?: boolean;
  required?: boolean;
}

/** Label + control + hint + error, wired for VoiceOver and TalkBack. */
export function Field({
  children,
  className,
  counter,
  error,
  hint,
  label,
  optional = false,
  required = false,
  ...props
}: FieldProps): ReactElement {
  const { t } = useTranslation();
  const labelId = `${useId()}-label`;
  const counterText = counter ? t("a11y.characterCount", counter) : undefined;
  const hintText =
    [textOf(error), textOf(hint), counterText].filter(Boolean).join(". ") ||
    undefined;
  const value: FieldContextValue = {
    hint: hintText,
    invalid: Boolean(error),
    label: textOf(label),
    labelId,
    required,
  };
  return (
    <FieldContext.Provider value={value}>
      <View className={cn("flex-col gap-1", className)} {...props}>
        <View className="flex-row items-baseline gap-2">
          <Text
            className="font-medium text-body-sm text-foreground"
            nativeID={labelId}
          >
            {label}
          </Text>
          {optional ? (
            <Text className="font-regular text-caption text-foreground-muted">
              {t("kit.optional")}
            </Text>
          ) : null}
        </View>
        {children}
        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            className="text-body-sm text-danger-strong"
          >
            {error}
          </Text>
        ) : null}
        {hint || counter ? (
          <View className="flex-row items-start justify-between gap-4">
            {hint ? (
              <Text className="flex-1 text-body-sm text-foreground-muted">
                {hint}
              </Text>
            ) : (
              <View />
            )}
            {counter ? (
              <Text
                accessibilityLabel={counterText}
                className={cn(
                  "shrink-0 text-caption",
                  counter.count > counter.max
                    ? "text-danger-strong"
                    : "text-foreground-muted"
                )}
              >
                {t("kit.characterCount", counter)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </FieldContext.Provider>
  );
}
