import { useTranslation } from "@smog/i18n/react";
import Check from "lucide-react-native/icons/check";
import type { ReactElement, Ref } from "react";
import { Text, View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { ICON_SIZE } from "../lib/icon";
import { useColor } from "../lib/theme";

export interface StepperStep {
  label: string;
}

export interface StepperProps extends Omit<ViewProps, "children"> {
  /** Zero-based index of the current step. */
  current: number;
  ref?: Ref<View>;
  steps: readonly StepperStep[];
}

/**
 * The step bar of a wizard, in web's small-screen layout: "Step n of m"
 * and the current label above the markers. Each marker is named by its
 * step; done ones add `a11y.stepCompleted`, the current one is selected.
 */
export function Stepper({
  className,
  current,
  steps,
  ...props
}: StepperProps): ReactElement {
  const { t } = useTranslation();
  const markColor = useColor("primaryForeground");
  return (
    <View
      accessibilityLabel={t("a11y.steps")}
      className={cn("flex-col gap-2", className)}
      {...props}
    >
      <View className="flex-col">
        <Text className="text-caption text-foreground-muted">
          {t("kit.stepOf", { current: current + 1, total: steps.length })}
        </Text>
        <Text
          accessibilityElementsHidden
          className="font-semibold text-body text-foreground"
          importantForAccessibility="no-hide-descendants"
        >
          {steps[current]?.label}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const last = index === steps.length - 1;
          return (
            <View
              className={cn(
                "flex-row items-center gap-2",
                last ? "shrink-0" : "flex-1"
              )}
              key={step.label}
            >
              <View
                accessibilityLabel={
                  done
                    ? `${step.label} (${t("a11y.stepCompleted")})`
                    : step.label
                }
                accessibilityState={{ selected: active }}
                accessible
                className={cn(
                  "size-8 items-center justify-center rounded-full border-2",
                  done || active
                    ? "border-primary bg-primary"
                    : "border-foreground-muted bg-surface"
                )}
              >
                {done ? (
                  <Check
                    color={markColor}
                    size={ICON_SIZE.sm}
                    strokeWidth={3}
                  />
                ) : (
                  <Text
                    className={cn(
                      "font-semibold text-body-sm",
                      active
                        ? "text-primary-foreground"
                        : "text-foreground-muted"
                    )}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              {last ? null : (
                <View
                  className={cn(
                    "h-0.5 flex-1 rounded-full",
                    done ? "bg-primary" : "bg-border"
                  )}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
