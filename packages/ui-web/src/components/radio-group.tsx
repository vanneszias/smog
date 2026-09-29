import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../lib/cn";
import { disabled, focusRing, hitArea, transition } from "../lib/variants";
import { useFieldLabelId } from "./field";

export interface RadioOption {
  description?: string;
  disabled?: boolean;
  label: string;
  value: string;
}

export interface RadioGroupProps
  extends Omit<ComponentProps<typeof RadioGroupPrimitive.Root>, "children"> {
  options: readonly RadioOption[];
}

/** One choice out of a few, all visible. Inside a Field it is labelled by the Field label. */
export function RadioGroup({
  "aria-labelledby": labelledBy,
  className,
  options,
  orientation = "vertical",
  ...props
}: RadioGroupProps): ReactNode {
  const fieldLabelId = useFieldLabelId();
  const base = useId();
  return (
    <RadioGroupPrimitive.Root
      aria-labelledby={labelledBy ?? fieldLabelId}
      className={cn(
        "flex gap-x-6",
        orientation === "horizontal" ? "flex-row flex-wrap" : "flex-col",
        className
      )}
      orientation={orientation}
      {...props}
    >
      {options.map((option) => {
        const id = `${base}-${option.value}`;
        return (
          <div
            className="flex min-h-touch items-start gap-3 py-3"
            key={option.value}
          >
            <span className="flex h-6 items-center">
              <RadioGroupPrimitive.Item
                className={cn(
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-foreground-muted bg-surface hover:border-foreground data-[state=checked]:border-primary",
                  hitArea,
                  focusRing,
                  transition,
                  disabled
                )}
                disabled={option.disabled}
                id={id}
                value={option.value}
              >
                <RadioGroupPrimitive.Indicator className="block size-2 rounded-full bg-primary" />
              </RadioGroupPrimitive.Item>
            </span>
            <span className="flex flex-col">
              <label
                className="cursor-pointer text-body text-foreground"
                htmlFor={id}
              >
                {option.label}
              </label>
              {option.description ? (
                <span className="text-body-sm text-foreground-muted">
                  {option.description}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
